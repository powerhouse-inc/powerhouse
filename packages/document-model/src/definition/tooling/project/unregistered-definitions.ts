import type { DefinitionSource } from "@powerhousedao/shared/document-model";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { compareCodeUnits } from "../../kernel/primitives.js";
import type { UnregisteredDefinition } from "../report/types.js";
import { isWithin } from "../definition-source-resolution.js";

/**
 * Finds `defineDocumentModel(Family)` calls under the document models
 * directory that no selected source reaches. Declarations are read from
 * source text, never run, so an unregistered model cannot fail the scan by
 * throwing. What a source reaches is the module graph its import evaluated.
 */

type Unit = UnregisteredDefinition & {
  /** Real paths. */
  readonly declaring: readonly string[];
};

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

function readCodeAndStrings(file: string): Lexed {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { code: "", strings: [] };
  }
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
  return /\.m?tsx?$/.test(name) && !/\.d\.m?ts$/.test(name);
}

function isTestFile(name: string): boolean {
  return /\.(?:test|spec)\.m?tsx?$/.test(name);
}

/**
 * Sorted, with symlinks followed. An entry that cannot be read, or whose real
 * path leaves the package, is not the package's and is skipped.
 */
function packageEntries(path: string, packageRootIdentity: string): Entry[] {
  let names: string[];
  try {
    names = readdirSync(path);
  } catch {
    return [];
  }
  return names
    .filter((name) => name !== "node_modules" && !name.startsWith("."))
    .sort(compareCodeUnits)
    .flatMap((name) => {
      const child = join(path, name);
      try {
        const real = realpathSync.native(child);
        if (!isWithin(packageRootIdentity, real)) return [];
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
): Entry[] {
  if (visited.has(directory.real)) return [];
  visited.add(directory.real);
  return packageEntries(directory.path, packageRootIdentity).flatMap(
    (entry) => {
      if (entry.isDirectory) {
        return entry.name === "__tests__"
          ? []
          : sourceFilesUnder(entry, packageRootIdentity, visited);
      }
      return isSourceFile(entry.name) && !isTestFile(entry.name) ? [entry] : [];
    },
  );
}

function declares(file: string): boolean {
  const { module, factory } = DECLARATION;
  const { code, strings } = readCodeAndStrings(file);
  const isFactory = new RegExp(`^${factory}$`);
  const callees = [
    ...[...code.matchAll(NAMED_IMPORT)]
      .filter(([, , index]) => module.test(strings[Number(index)]))
      .flatMap(([, clause]) =>
        valueBindings(clause)
          .filter(({ imported }) => isFactory.test(imported))
          .map(({ local }) => escapeRegExp(local)),
      ),
    ...[...code.matchAll(NAMESPACE_IMPORT)]
      .filter(([, , index]) => module.test(strings[Number(index)]))
      .map(
        ([, namespace]) => `${escapeRegExp(namespace)}\\s*\\.\\s*${factory}`,
      ),
  ];
  return callees.some((callee) =>
    new RegExp(`(?<![\\w$.])${callee}\\s*(?:<[^;()]*>\\s*)?\\(`).test(code),
  );
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
): Unit | undefined {
  const declaring = sourceFilesUnder(
    directory,
    packageRootIdentity,
    new Set(),
  ).filter(({ real }) => declares(real));
  const index = join(directory.path, "index.ts");
  const suggested =
    declaring.find(({ path }) => path === index) ?? declaring.at(0);
  if (suggested === undefined) return undefined;
  return {
    kind: "document-model",
    unit: `${packagePath(packageRoot, directory.path)}/`,
    specifier: packagePath(packageRoot, suggested.path),
    declaring: declaring.map(({ real }) => real),
  };
}

/**
 * Each `<documentModelsDir>/<name>/` whose sources declare a code-first model
 * that no selected source's import reached. A selected source that did not
 * import reaches files no one can name, so the scan then reports nothing.
 */
export function findUnregisteredDefinitions(request: {
  readonly packageRoot: string;
  /** Absolute, and already checked to stay inside the package root. */
  readonly documentModelsDir: string;
  readonly sources: readonly DefinitionSource[];
  /** Absolute paths of every module the import of `specifier` evaluated, its own included. */
  readonly importedFiles: (specifier: string) => readonly string[];
}): readonly UnregisteredDefinition[] {
  const { packageRoot, documentModelsDir, sources, importedFiles } = request;
  const imported = sources.map(({ specifier }) => importedFiles(specifier));
  if (imported.some((files) => files.length === 0)) return [];
  const reached = new Set(imported.flat().map(realPathOrSelf));
  const packageRootIdentity = realPathOrSelf(packageRoot);
  return packageEntries(documentModelsDir, packageRootIdentity)
    .flatMap((entry) =>
      entry.isDirectory
        ? (modelUnit(packageRoot, packageRootIdentity, entry) ?? [])
        : [],
    )
    .filter((unit) => !unit.declaring.some((file) => reached.has(file)))
    .map(({ kind, unit, specifier }) => ({ kind, unit, specifier }));
}
