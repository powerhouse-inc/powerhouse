import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createDiagnostic } from "../diagnostics.js";
import { compareCodeUnits } from "../primitives.js";
import type { DefinitionSourceResolution } from "./definition-source-types.js";

/**
 * A code-first model directory or subgraph module that `definitionSources`
 * does not reach.
 *
 * The scan looks only where the scaffolds put definitions and reads source
 * text without running it.
 */
export type UnregisteredDefinition = {
  readonly kind: "document-model" | "subgraph";
  /** `./document-models/<name>/`, or the declaring module itself. */
  readonly unit: `./${string}`;
  /** The entry that registers it. */
  readonly specifier: `./${string}`;
};

type SelectedSources = Pick<
  DefinitionSourceResolution,
  "packageRoot" | "sourceSet"
>;

type Unit = UnregisteredDefinition & {
  readonly declaring: readonly string[];
};

const DECLARATION = {
  "document-model": {
    module: /^document-model(?:\/|$)/,
    factory: "defineDocumentModel(?:Family)?",
  },
  subgraph: {
    module: /^@powerhousedao\/reactor-api(?:\/|$)/,
    factory: "defineSubgraph",
  },
} as const;

const NAMED_IMPORT = /\bimport\s*\{([^}]*)\}\s*from\s*"#(\d+)"/g;

const NAMESPACE_IMPORT = /\bimport\s*\*\s*as\s+([\w$]+)\s*from\s*"#(\d+)"/g;

const MODULE_REFERENCE =
  /\b(?:(?:import|export)\s+((?:(?!\b(?:import|export)\b)[^;=]){0,1000}?)\s*\bfrom\s*|import\s*\(?\s*)"#(\d+)"/g;

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

function isTypeOnly(clause: string): boolean {
  const braced = /^\{([^}]*)\}$/.exec(clause);
  return (
    /^type\s/.test(clause) ||
    (braced !== null && valueBindings(braced[1]).length === 0)
  );
}

function isSourceFile(name: string): boolean {
  return /\.m?tsx?$/.test(name) && !/\.d\.m?ts$/.test(name);
}

function readableEntries(path: string) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(
        (entry) => entry.name !== "node_modules" && !entry.name.startsWith("."),
      )
      .sort((left, right) => compareCodeUnits(left.name, right.name));
  } catch {
    return [];
  }
}

function sourceFilesUnder(path: string): string[] {
  return readableEntries(path).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory())
      return entry.name === "__tests__" ? [] : sourceFilesUnder(child);
    return isSourceFile(entry.name) && !isTestFile(entry.name) ? [child] : [];
  });
}

function isTestFile(name: string): boolean {
  return /\.(?:test|spec)\.m?tsx?$/.test(name);
}

function declares(kind: Unit["kind"], file: string): boolean {
  const { module, factory } = DECLARATION[kind];
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

function modelUnit(root: string, dir: string): Unit | undefined {
  const files = sourceFilesUnder(dir);
  const declaring = files.filter((file) => declares("document-model", file));
  if (declaring.length === 0) return undefined;
  const index = join(dir, "index.ts");
  const indexReaches =
    files.includes(index) &&
    declaring.some((file) =>
      reachableFiles(root, [index]).has(realpathSync(file)),
    );
  return {
    kind: "document-model",
    unit: `${packagePath(root, dir)}/`,
    specifier: packagePath(root, indexReaches ? index : declaring[0]),
    declaring,
  };
}

function subgraphUnit(root: string, path: string): Unit | undefined {
  if (!declares("subgraph", path)) return undefined;
  const specifier = packagePath(root, path);
  return { kind: "subgraph", unit: specifier, specifier, declaring: [path] };
}

function isSchemaFirstModelDir(models: string, name: string): boolean {
  return existsSync(join(models, name, `${name}.json`));
}

function handWrittenModelUnits(root: string, dir: string): Unit[] {
  return sourceFilesUnder(dir)
    .filter((file) => declares("document-model", file))
    .map((file) => {
      const specifier = packagePath(root, file);
      return {
        kind: "document-model",
        unit: specifier,
        specifier,
        declaring: [file],
      };
    });
}

function codeFirstUnits(root: string): Unit[] {
  const units: Unit[] = [];
  const models = join(root, "document-models");
  for (const entry of readableEntries(models)) {
    if (!entry.isDirectory()) continue;
    const dir = join(models, entry.name);
    if (isSchemaFirstModelDir(models, entry.name)) {
      units.push(...handWrittenModelUnits(root, dir));
      continue;
    }
    const unit = modelUnit(root, dir);
    if (unit) units.push(unit);
  }
  for (const path of sourceFilesUnder(join(root, "subgraphs"))) {
    const unit = subgraphUnit(root, path);
    if (unit) units.push(unit);
  }
  return units;
}

function resolveImport(from: string, specifier: string): string | undefined {
  const target = resolve(dirname(from), specifier);
  return [
    target,
    target.replace(/\.js$/, ".ts"),
    target.replace(/\.jsx?$/, ".tsx"),
    target.replace(/\.mjs$/, ".mts"),
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.mts`,
    join(target, "index.ts"),
    join(target, "index.tsx"),
    join(target, "index.mts"),
  ].find(
    (candidate) =>
      isSourceFile(candidate) &&
      existsSync(candidate) &&
      statSync(candidate).isFile(),
  );
}

function reachableFiles(root: string, entries: readonly string[]): Set<string> {
  const reached = new Set<string>();
  const pending = entries.map((specifier) => resolve(root, specifier));
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const real = realpathSync(file);
    if (reached.has(real)) continue;
    reached.add(real);
    const { code, strings } = readCodeAndStrings(real);
    for (const match of code.matchAll(MODULE_REFERENCE)) {
      const clause = match.at(1);
      const specifier = strings[Number(match[2])];
      if (clause !== undefined && isTypeOnly(clause.trim())) continue;
      if (!/^\.{1,2}\//.test(specifier)) continue;
      const target = resolveImport(real, specifier);
      if (target !== undefined) pending.push(target);
    }
  }
  return reached;
}

function withoutFiles({ kind, unit, specifier }: Unit): UnregisteredDefinition {
  return { kind, unit, specifier };
}

/** Every code-first definition in the package, registered or not. */
export function findCodeFirstDefinitions(
  packageRoot: string,
): UnregisteredDefinition[] {
  return codeFirstUnits(packageRoot).map(withoutFiles);
}

/** The code-first definitions in the package that the selected sources do not reach. */
export function findUnregisteredDefinitions(
  selection: SelectedSources,
): UnregisteredDefinition[] {
  const reached = reachableFiles(
    selection.packageRoot,
    selection.sourceSet.sources.map((source) => source.specifier),
  );
  return codeFirstUnits(selection.packageRoot)
    .filter(
      (unit) => !unit.declaring.some((file) => reached.has(realpathSync(file))),
    )
    .map(withoutFiles);
}

export function unregisteredDefinitionDiagnostic(
  definition: UnregisteredDefinition,
  mode: SelectedSources["sourceSet"]["mode"],
): DefinitionDiagnostic {
  const entry = `{ "specifier": "${definition.specifier}" }`;
  return createDiagnostic({
    code: "PH-CONFIG-SOURCE-UNREGISTERED",
    path: ["definitionSources", "entries"],
    message:
      definition.kind === "document-model"
        ? `${definition.unit} declares a code-first document model that definitionSources does not list, so the package leaves it out.`
        : `${definition.unit} declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.`,
    expected: `an entry for ${definition.specifier}`,
    received: "no entry",
    repair:
      mode === "code-first"
        ? `Add ${entry} to definitionSources.entries in powerhouse.config.json.`
        : `Set definitionSources in powerhouse.config.json to { "formatVersion": 1, "mode": "code-first", "entries": [${entry}] }. Schema-first models keep generating from their model documents.`,
  });
}

function unselectedDefinitionWarning(
  definition: UnregisteredDefinition,
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-CONFIG-SOURCE-UNSELECTED",
    path: ["sources"],
    message: `${definition.unit} declares a code-first ${definition.kind === "document-model" ? "document model" : "subgraph"} that the selected sources leave out, so this run does not check it.`,
    expected: `a --source for ${definition.specifier}`,
    received: "no source",
    repair:
      "Select it with another --source, or run without --source to check every registered definition.",
  });
}

export function unregisteredDefinitionDiagnostics(
  selection: SelectedSources,
): DefinitionDiagnostic[] {
  return findUnregisteredDefinitions(selection).map((definition) =>
    selection.sourceSet.origin === "config"
      ? unregisteredDefinitionDiagnostic(definition, selection.sourceSet.mode)
      : unselectedDefinitionWarning(definition),
  );
}
