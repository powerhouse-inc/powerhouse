import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * No client in this repository sends a deprecated argument of the reactor
 * GraphQL API. The server keeps accepting the old names until they are
 * removed; this guard keeps our own clients from going back to them.
 *
 * The list is not written down here. It is read from the `@deprecated`
 * markers on the argument and input field definitions in the server's schema
 * sources, so deprecating another argument extends the guard by itself.
 *
 * A use is reported only on the field that declares the deprecation: an
 * `identifier` argument on `document(...)` is a use, an `identifier` field or
 * argument anywhere else is not. Text is read as it stands, in `.graphql`
 * files and in source files alike, so a query in a `gql` literal, in a plain
 * string or in a comment all count. What is built at run time (a variables
 * object, a query assembled from parts) is out of reach.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** The schema as the server writes it: SDL files and the per-model template. */
const SCHEMA_SOURCES = [
  "packages/reactor-api/src/graphql/reactor/schema.graphql",
  "packages/reactor-api/src/graphql/auth/schema.graphql",
  "packages/reactor-api/src/graphql/model-schema-templates.ts",
];

/** Where clients of the API live. */
const SCANNED_ROOTS = ["apps", "clis", "packages", "scripts", "test", "tools"];
const SCANNED_FILE = /\.(?:graphql|gql|[cm]?[jt]sx?)$/;
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "storybook-static",
  "test-results",
  "playwright-report",
]);
const LARGEST_SCANNED_FILE = 2_000_000;

/**
 * Files that send deprecated names on purpose: each proves that the server
 * still accepts them. They go when the names are removed from the schema.
 */
const COMPATIBILITY_COVERAGE: string[] = [
  "packages/reactor-api/test/fixtures/operations.pre-rename.graphql",
];

/**
 * The legacy per-model API names its mutations `<Model>_<operation>` and keeps
 * `docId` for good. Those fields are not the per-model operations of the
 * current API, whose names the schema template fills in.
 */
const LEGACY_MODEL_FIELD = /^[A-Z][A-Za-z0-9]*_[a-z]/;

type ArgumentRule = {
  /** Every argument the field declares, deprecated or not. */
  declared: Set<string>;
  /** The declared arguments a request cannot leave out. */
  required: Set<string>;
  /** Deprecated argument name to the reason the schema gives. */
  deprecated: Map<string, string>;
};

type Deprecations = {
  /** Rules for fields the schema names. */
  fields: Map<string, ArgumentRule>;
  /** Rules for fields whose name the per-model template fills in. */
  patterns: ArgumentRule[];
  /** `field.argument` to the deprecated fields of the input type it takes. */
  inputs: Map<string, Map<string, string>>;
};

type TypedArgument = { field: string; argument: string; type: string };
type Use = { line: number; field: string; argument: string; reason: string };

const NAME = String.raw`(?:\$\{[^}]*\}|[A-Za-z_])(?:\$\{[^}]*\}|\w)*`;
const TYPE = String.raw`(?:\[|\]|!|\$\{[^}]*\}|\w)+`;
const DEFINITION = new RegExp(String.raw`(${NAME})\s*:\s*(${TYPE})`, "y");
const NAME_BEFORE = new RegExp(String.raw`(${NAME})\s*$`);
const INPUT_BEFORE = new RegExp(String.raw`\binput\s+(${NAME})\s*$`);
const DEPRECATED_AFTER = /\s*@deprecated\b(?:\s*\(\s*reason:\s*"([^"]*)")?/y;

/** A template placeholder stands for any name. */
const typeNameOf = (type: string) =>
  type.replace(/\$\{[^}]*\}/g, "*").replace(/[[\]!]/g, "");

/**
 * The text with descriptions, string values and `#` comments blanked out, so
 * that brackets inside them do not count. Offsets are kept.
 */
function withoutStrings(text: string, hashComments: boolean): string {
  const pattern = hashComments
    ? /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|#[^\n]*/g
    : /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"/g;
  return text.replace(pattern, (found) => found.replace(/[^\n]/g, " "));
}

/** Reads the deprecated arguments and input fields out of one schema source. */
function readSchemaSource(
  text: string,
  isSdlFile: boolean,
  into: Deprecations,
  inputTypes: Map<string, Map<string, string>>,
  typedArguments: TypedArgument[],
): void {
  const bare = withoutStrings(text, isSdlFile);
  const open: { bracket: string; at: number; rule?: ArgumentRule }[] = [];
  for (let at = 0; at < bare.length; at++) {
    const char = bare[at];
    if (char === "(" || char === "{" || char === "[") {
      open.push({ bracket: char, at });
      continue;
    }
    if (char === ")" || char === "}" || char === "]") {
      open.pop();
      continue;
    }
    const enclosing = open.at(-1);
    if (!enclosing || enclosing.bracket === "[") continue;
    if (!/[A-Za-z_$]/.test(char) || /[\w$}]/.test(bare[at - 1] ?? "")) continue;
    DEFINITION.lastIndex = at;
    const definition = DEFINITION.exec(bare);
    if (!definition) continue;
    const [whole, name, type] = definition;
    DEPRECATED_AFTER.lastIndex = at + whole.length;
    const marker = DEPRECATED_AFTER.exec(text);
    const reason = marker ? (marker[1] ?? "Deprecated.") : undefined;
    const before = bare.slice(0, enclosing.at);

    if (enclosing.bracket === "{") {
      const input = INPUT_BEFORE.exec(before)?.[1];
      if (!input || reason === undefined) continue;
      const fields = inputTypes.get(typeNameOf(input)) ?? new Map();
      fields.set(name, reason);
      inputTypes.set(typeNameOf(input), fields);
      continue;
    }

    const field = NAME_BEFORE.exec(before)?.[1];
    if (!field) continue;
    enclosing.rule ??= {
      declared: new Set(),
      required: new Set(),
      deprecated: new Map(),
    };
    const rule = enclosing.rule;
    rule.declared.add(name);
    if (type.endsWith("!")) rule.required.add(name);
    typedArguments.push({ field, argument: name, type: typeNameOf(type) });
    if (reason === undefined) continue;
    rule.deprecated.set(name, reason);
    if (field.includes("${")) {
      if (!into.patterns.includes(rule)) into.patterns.push(rule);
      continue;
    }
    // The same field in two subgraphs is one rule, fed by both definitions.
    const known = into.fields.get(field) ?? rule;
    into.fields.set(field, known);
    for (const declared of rule.declared) known.declared.add(declared);
    known.deprecated.set(name, reason);
  }
}

function readDeprecations(): Deprecations {
  const deprecations: Deprecations = {
    fields: new Map(),
    patterns: [],
    inputs: new Map(),
  };
  const inputTypes = new Map<string, Map<string, string>>();
  const typedArguments: TypedArgument[] = [];
  for (const source of SCHEMA_SOURCES) {
    readSchemaSource(
      readFileSync(join(ROOT, source), "utf8"),
      source.endsWith(".graphql"),
      deprecations,
      inputTypes,
      typedArguments,
    );
  }
  for (const { field, argument, type } of typedArguments) {
    const fields = inputTypes.get(type);
    if (!fields || field.includes("${")) continue;
    const key = `${field}.${argument}`;
    const known = deprecations.inputs.get(key) ?? new Map<string, string>();
    for (const [name, reason] of fields) known.set(name, reason);
    deprecations.inputs.set(key, known);
  }
  return deprecations;
}

/** How far a bracket is followed to its other end. */
const REACH = 4000;

type Entry = { name: string; at: number; valueAt: number };

/**
 * The `name: value` entries directly inside the bracket that opens at `from`,
 * or undefined when the bracket does not close within reach.
 */
function entriesOf(text: string, from: number): Entry[] | undefined {
  const entries: Entry[] = [];
  const entry = /([A-Za-z_]\w*)\s*:\s*/y;
  let depth = 0;
  let quoted = false;
  for (let at = from; at < text.length && at < from + REACH; at++) {
    const char = text[at];
    if (char === '"') quoted = !quoted;
    if (char === "\n") quoted = false;
    if (quoted) continue;
    if (char === "(" || char === "{" || char === "[") {
      depth++;
      continue;
    }
    if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) return entries;
      continue;
    }
    if (depth !== 1 || !/[A-Za-z_]/.test(char)) continue;
    if (/[\w$.]/.test(text[at - 1])) continue;
    entry.lastIndex = at;
    const found = entry.exec(text);
    if (!found) continue;
    const valueAt = at + found[0].length;
    entries.push({ name: found[1], at, valueAt });
    at = valueAt - 1;
  }
  return undefined;
}

/** Where the bracket around `at` opens, if it opens within reach. */
function openingOf(text: string, at: number): number | undefined {
  let depth = 0;
  for (let back = at - 1; back >= 0 && back > at - REACH; back--) {
    const char = text[back];
    if (char === ")" || char === "}" || char === "]") depth++;
    if (char !== "(" && char !== "{" && char !== "[") continue;
    if (depth === 0) return back;
    depth--;
  }
  return undefined;
}

/**
 * What follows an argument's colon when a value is being sent: a variable, a
 * string, a number, a list of those or a template placeholder. A type name
 * there means the text is a declaration (the schema itself, a TypeScript
 * signature), not a request.
 */
const SENT_VALUE = /[$"'\\\d]|\[\s*[$"'\\\d\]]/y;

function usesIn(
  text: string,
  deprecations: Deprecations,
  mention: RegExp,
): Use[] {
  // Every argument list that names a deprecated argument, once.
  const lists = new Set<number>();
  for (const found of text.matchAll(mention)) {
    let open = openingOf(text, found.index);
    // Inside an input object, the list is the one around the object.
    if (open !== undefined && text[open] === "{") open = openingOf(text, open);
    if (open !== undefined && text[open] === "(") lists.add(open);
  }

  const uses = new Map<number, Use>();
  const report = (at: number, use: Omit<Use, "line">) =>
    uses.set(at, { line: text.slice(0, at).split("\n").length, ...use });

  for (const open of lists) {
    const before = text.slice(Math.max(0, open - 200), open);
    const field = /([A-Za-z_]\w*)\s*$/.exec(before)?.[1];
    const entries = entriesOf(text, open);
    if (!field || !entries) continue;
    const names = new Set(entries.map((entry) => entry.name));
    const named = deprecations.fields.get(field);
    const rules = named
      ? [named]
      : LEGACY_MODEL_FIELD.test(field)
        ? []
        : deprecations.patterns;

    for (const rule of rules) {
      // A field the schema does not name is a per-model operation only when
      // its arguments are that operation's arguments.
      const applies =
        rule === named ||
        ([...names].every((name) => rule.declared.has(name)) &&
          [...rule.required].every((name) => names.has(name)));
      if (!applies) continue;
      for (const { name, at, valueAt } of entries) {
        const reason = rule.deprecated.get(name);
        SENT_VALUE.lastIndex = valueAt;
        if (reason === undefined || !SENT_VALUE.test(text)) continue;
        report(at, { field, argument: name, reason });
      }
    }

    for (const { name, valueAt } of entries) {
      const fields = deprecations.inputs.get(`${field}.${name}`);
      if (!fields || text[valueAt] !== "{") continue;
      for (const key of entriesOf(text, valueAt) ?? []) {
        const reason = fields.get(key.name);
        if (reason === undefined) continue;
        report(key.at, { field, argument: `${name}.${key.name}`, reason });
      }
    }
  }
  return [...uses.values()];
}

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : filesIn(path);
    }
    return entry.isFile() && SCANNED_FILE.test(entry.name) ? [path] : [];
  });
}

const fromRoot = (path: string) => relative(ROOT, path).replaceAll("\\", "/");
const show = (path: string, use: Use) =>
  `${path}:${use.line} ${use.field}(${use.argument}:) ${use.reason}`;

describe("deprecated GraphQL argument names", () => {
  const deprecations = readDeprecations();
  const everyName = new Set(
    [
      ...[...deprecations.fields.values()].map((rule) => rule.deprecated),
      ...deprecations.patterns.map((rule) => rule.deprecated),
      ...deprecations.inputs.values(),
    ].flatMap((deprecated) => [...deprecated.keys()]),
  );
  const mention = new RegExp(`\\b(?:${[...everyName].join("|")})\\s*:`, "g");

  const usesByFile = new Map<string, Use[]>();
  for (const root of SCANNED_ROOTS) {
    for (const file of filesIn(join(ROOT, root))) {
      if (statSync(file).size > LARGEST_SCANNED_FILE) continue;
      const uses = usesIn(readFileSync(file, "utf8"), deprecations, mention);
      if (uses.length > 0) usesByFile.set(fromRoot(file), uses);
    }
  }

  it("reads the deprecated arguments from the schema", () => {
    // Guards the reader, not the list: were it to find nothing, every file
    // would pass.
    const { fields, patterns, inputs } = deprecations;
    expect(fields.get("document")?.deprecated.has("identifier")).toBe(true);
    expect(fields.get("documentAccess")?.deprecated.has("documentId")).toBe(
      true,
    );
    expect(patterns.some((rule) => rule.deprecated.has("docId"))).toBe(true);
    expect(inputs.get("documentOperations.filter")?.has("documentId")).toBe(
      true,
    );
  });

  it("is sent by no client in the repository", () => {
    const offenders = [...usesByFile]
      .filter(([path]) => !COMPATIBILITY_COVERAGE.includes(path))
      .flatMap(([path, uses]) => uses.map((use) => show(path, use)));
    expect(offenders).toEqual([]);
  });

  it("exempts only files that still send a deprecated name", () => {
    const idle = COMPATIBILITY_COVERAGE.filter((path) => !usesByFile.has(path));
    expect(idle).toEqual([]);
  });
});
