import type {
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { DEFINITION_SOURCE_EXTENSION } from "@powerhousedao/shared/clis/definition-sources";
import { pathWithin } from "@powerhousedao/shared/clis/real-paths";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { compareCodeUnits } from "../../kernel/primitives.js";
import type { UnregisteredDefinition } from "../report/types.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";
import { describeThrown } from "../structured-diagnostics.js";

/**
 * Finds `defineDocumentModel(Family)` calls under the document models
 * directory that no selected source reaches. Declarations are read from
 * source text, never run, so an unregistered model cannot fail the scan by
 * throwing. What a source reaches is the module graph its import evaluated.
 */

type Unit = Omit<UnregisteredDefinition, "reason"> & {
  /** Real paths. */
  readonly declaring: readonly string[];
  /** `null` when a declaration's id cannot be read from its source text. */
  readonly ids: readonly string[] | null;
};

type Unreadable = { readonly path: string; readonly error: unknown }[];

type Entry = {
  readonly name: string;
  /** As spelled under the models directory. */
  readonly path: string;
  readonly real: string;
  readonly isDirectory: boolean;
};

const DECLARATION = {
  module: /^document-model(?:\/|$)/,
  factory: "defineDocumentModel(?:Family)?",
} as const;

const NAMED_IMPORT = /\bimport\s*\{([^}]*)\}\s*from\s*"#(\d+)"/g;

const NAMESPACE_IMPORT = /\bimport\s*\*\s*as\s+([\w$]+)\s*from\s*"#(\d+)"/g;

type Lexed = { readonly code: string; readonly strings: readonly string[] };

function startsRegExp(code: string): boolean {
  const before = code.slice(-64).trimEnd();
  return (
    before === "" ||
    /[(,=:[!&|?{};+\-*%<>~^}]$/.test(before) ||
    /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(
      before,
    )
  );
}

function lexCodeAndStrings(text: string): Lexed {
  let code = "";
  const strings: string[] = [];
  const literal = (contents: string) => {
    code += `"#${strings.length}"`;
    strings.push(contents);
  };
  let braces = 0;
  const templates: number[] = [];
  let i = 0;
  const skipQuoted = (end: (index: number) => boolean) => {
    while (i < text.length && !end(i)) i += text[i] === "\\" ? 2 : 1;
  };
  while (i < text.length) {
    const char = text[i];
    if (char === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i === -1) i = text.length;
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      code += " ";
    } else if (char === "/" && startsRegExp(code)) {
      i += 1;
      let inClass = false;
      while (i < text.length && text[i] !== "\n") {
        if (text[i] === "\\") i += 1;
        else if (text[i] === "[") inClass = true;
        else if (text[i] === "]") inClass = false;
        else if (text[i] === "/" && !inClass) break;
        i += 1;
      }
      i += 1;
      while (/[a-z]/.test(text[i] ?? "")) i += 1;
      code += " ";
    } else if (char === '"' || char === "'") {
      const start = (i += 1);
      skipQuoted((at) => text[at] === char || text[at] === "\n");
      literal(text.slice(start, i));
      i += 1;
    } else if (char === "`" || (char === "}" && templates.at(-1) === braces)) {
      const whole = char === "`";
      if (!whole) templates.pop();
      const start = (i += 1);
      skipQuoted(
        (at) => text[at] === "`" || (text[at] === "$" && text[at + 1] === "{"),
      );
      const closed = text[i] === "`";
      literal(whole && closed ? text.slice(start, i) : "");
      if (closed) {
        i += 1;
      } else {
        templates.push(braces);
        i += 2;
      }
    } else {
      if (char === "{") braces += 1;
      if (char === "}") braces -= 1;
      code += char;
      i += 1;
    }
  }
  return { code, strings };
}

/** `type as e` imports a value named `type`. */
function valueBindings(
  clause: string,
): { readonly imported: string; readonly local: string }[] {
  return clause
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !/^type\s+(?!as\b)/.test(part))
    .map((part) => {
      const [imported, local = imported] = part.split(/\s+as\s+/);
      return { imported, local };
    });
}

function isSourceFile(name: string): boolean {
  return DEFINITION_SOURCE_EXTENSION.test(name) && !/\.d\.m?ts$/.test(name);
}

function isTestFile(name: string): boolean {
  return /\.(?:test|spec)\.(?:[jt]sx?|m[jt]s)$/.test(name);
}

/**
 * Sorted, with symlinks followed. An entry whose real path cannot be read, or
 * leaves the package, is not the package's and is skipped; a directory that
 * cannot be listed goes to `unreadable`.
 */
function packageEntries(
  path: string,
  packageRootIdentity: string,
  unreadable: Unreadable,
): Entry[] {
  let names: string[];
  try {
    names = readdirSync(path);
  } catch (error) {
    unreadable.push({ path, error });
    return [];
  }
  return names
    .filter((name) => name !== "node_modules" && !name.startsWith("."))
    .sort(compareCodeUnits)
    .flatMap((name) => {
      const child = join(path, name);
      try {
        const real = realpathSync.native(child);
        if (pathWithin(packageRootIdentity, real) === null) return [];
        const isDirectory = statSync(real).isDirectory();
        return [{ name, path: child, real, isDirectory }];
      } catch {
        return [];
      }
    });
}

/** `visited` holds real directories, so a symlink cycle ends. */
function sourceFilesUnder(
  directory: Entry,
  packageRootIdentity: string,
  visited: Set<string>,
  unreadable: Unreadable,
): Entry[] {
  if (visited.has(directory.real)) return [];
  visited.add(directory.real);
  return packageEntries(
    directory.path,
    packageRootIdentity,
    unreadable,
  ).flatMap((entry) => {
    if (entry.isDirectory) {
      return entry.name === "__tests__"
        ? []
        : sourceFilesUnder(entry, packageRootIdentity, visited, unreadable);
    }
    return isSourceFile(entry.name) && !isTestFile(entry.name) ? [entry] : [];
  });
}

/**
 * The object literal's own `id` when its source spells it as a plain string.
 * A spread can override it and an escape changes its spelling, so either
 * leaves it unknown.
 */
function topLevelId(
  code: string,
  strings: readonly string[],
  open: number,
): string | undefined {
  let depth = 0;
  let id: string | undefined;
  for (let i = open; i < code.length; i += 1) {
    const char = code[i];
    if ("{([".includes(char)) depth += 1;
    else if ("})]".includes(char)) {
      depth -= 1;
      if (depth === 0) break;
    } else if (depth === 1 && code.startsWith("...", i)) {
      return undefined;
    } else if (depth === 1 && !/[\w$]/.test(code[i - 1] ?? "")) {
      const rest = code.slice(i, i + 16);
      const quoted = /^"#(\d+)"\s*:\s*/.exec(rest);
      const key =
        /^id\s*:\s*/.exec(rest) ??
        (quoted !== null && strings[+quoted[1]] === "id" ? quoted : null);
      if (key !== null) {
        const value = /^"#(\d+)"/.exec(code.slice(i + key[0].length));
        id = value === null ? undefined : strings[+value[1]];
      }
    }
  }
  return id === undefined || id === "" || id.includes("\\") ? undefined : id;
}

function declarations(
  code: string,
  strings: readonly string[],
): { readonly declares: boolean; readonly ids: readonly string[] | null } {
  const { module, factory } = DECLARATION;
  const isFactory = new RegExp(`^${factory}$`);
  const callees = [
    ...[...code.matchAll(NAMED_IMPORT)]
      .filter(([, , index]) => module.test(strings[Number(index)]))
      .flatMap(([, clause]) =>
        valueBindings(clause)
          .filter(({ imported }) => isFactory.test(imported))
          .map(({ imported, local }) => ({
            callee: escapeRegExp(local),
            family: imported !== "defineDocumentModel",
          })),
      ),
    ...[...code.matchAll(NAMESPACE_IMPORT)]
      .filter(([, , index]) => module.test(strings[Number(index)]))
      .flatMap(([, namespace]) =>
        [false, true].map((family) => ({
          callee: `${escapeRegExp(namespace)}\\s*\\.\\s*defineDocumentModel${family ? "Family" : ""}`,
          family,
        })),
      ),
  ];
  let declares = false;
  let ids: string[] | null = [];
  for (const { callee, family } of callees) {
    const calls = new RegExp(
      `(?<![\\w$.])${callee}\\s*(?:<[^;()]*>\\s*)?\\((?:\\s*\\{)?`,
      "g",
    );
    for (const call of code.matchAll(calls)) {
      declares = true;
      const id =
        family || !call[0].endsWith("{")
          ? undefined
          : topLevelId(code, strings, call.index + call[0].length - 1);
      if (id === undefined) ids = null;
      else ids?.push(id);
    }
  }
  return { declares, ids };
}

function escapeRegExp(name: string): string {
  return name.replaceAll("$", "\\$");
}

function packagePath(root: string, path: string): `./${string}` {
  return `./${relative(root, path).split(sep).join("/")}`;
}

function realPathOrSelf(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

/** The suggested specifier is the folder's `index.ts` when it declares, else the first declaring file. */
function modelUnit(
  packageRoot: string,
  packageRootIdentity: string,
  directory: Entry,
  unreadable: Unreadable,
): Unit | undefined {
  const declaring: {
    readonly entry: Entry;
    readonly ids: readonly string[] | null;
  }[] = [];
  for (const entry of sourceFilesUnder(
    directory,
    packageRootIdentity,
    new Set(),
    unreadable,
  )) {
    let text: string;
    try {
      text = readFileSync(entry.real, "utf8");
    } catch (error) {
      unreadable.push({ path: entry.path, error });
      continue;
    }
    const { code, strings } = lexCodeAndStrings(text);
    const found = declarations(code, strings);
    if (found.declares) declaring.push({ entry, ids: found.ids });
  }
  const index = join(directory.path, "index.ts");
  const suggested =
    declaring.find(({ entry }) => entry.path === index) ?? declaring.at(0);
  if (suggested === undefined) return undefined;
  return {
    kind: "document-model",
    unit: `${packagePath(packageRoot, directory.path)}/`,
    specifier: packagePath(packageRoot, suggested.entry.path),
    declaring: declaring.map(({ entry }) => entry.real),
    ids: declaring.some(({ ids }) => ids === null)
      ? null
      : declaring.flatMap(({ ids }) => ids ?? []),
  };
}

function unreadableDiagnostic(
  packageRoot: string,
  { path, error }: Unreadable[number],
): DefinitionDiagnostic {
  return toolingDiagnostics.create({
    code: "PH-IMPORT-FAILED",
    source: { specifier: packagePath(packageRoot, path) },
    path: [],
    message:
      "This path under the document models directory could not be read, so the scan cannot tell whether it declares a code-first model that no definitionSources entry reaches.",
    expected: "a readable file or directory",
    received: describeThrown(error),
    repair:
      "Fix the permissions of the path, or move it out of the document models directory.",
  });
}

/**
 * Each `<documentModelsDir>/<name>/` whose sources declare a code-first model
 * that no selected source's import reached, or that a selected source reached
 * without exporting the model's literal id. A selected source that did not
 * import reaches files no one can name, so the scan then reports nothing.
 */
export function findUnregisteredDefinitions(request: {
  readonly packageRoot: string;
  /** Absolute, and already checked to stay inside the package root. */
  readonly documentModelsDir: string;
  readonly sources: readonly DefinitionSource[];
  /** Absolute paths of every module the import of `specifier` evaluated, its own included. */
  readonly importedFiles: (specifier: string) => readonly string[];
  readonly loadedDocumentTypes: ReadonlySet<string>;
}): {
  readonly unregistered: readonly UnregisteredDefinition[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
} {
  const {
    packageRoot,
    documentModelsDir,
    sources,
    importedFiles,
    loadedDocumentTypes,
  } = request;
  const imported = sources.map(({ specifier }) => importedFiles(specifier));
  if (imported.some((files) => files.length === 0)) {
    return { unregistered: [], diagnostics: [] };
  }
  const reached = new Set(imported.flat().map(realPathOrSelf));
  const packageRootIdentity = realPathOrSelf(packageRoot);
  const unreadable: Unreadable = [];
  const directories = packageEntries(
    documentModelsDir,
    packageRootIdentity,
    [],
  ).filter(({ isDirectory }) => isDirectory);
  const units = directories.flatMap(
    (entry) =>
      modelUnit(packageRoot, packageRootIdentity, entry, unreadable) ?? [],
  );
  const modelDirectories = new Set(directories.map(({ path }) => path));
  const unregistered = units.flatMap(
    ({ kind, unit, specifier, declaring, ids }): UnregisteredDefinition[] => {
      const isReached = declaring.some((file) => reached.has(file));
      if (
        isReached &&
        (ids === null || ids.some((id) => loadedDocumentTypes.has(id)))
      ) {
        return [];
      }
      return [
        {
          kind,
          unit,
          specifier,
          reason: isReached ? "not-exported" : "unreached",
        },
      ];
    },
  );
  return {
    unregistered,
    diagnostics: unreadable
      .filter(({ path }) => !modelDirectories.has(path))
      .map((entry) => unreadableDiagnostic(packageRoot, entry)),
  };
}
