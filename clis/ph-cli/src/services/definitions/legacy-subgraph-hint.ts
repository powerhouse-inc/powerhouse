import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LEGACY_FIELDS = new Set([
  "name",
  "typeDefs",
  "resolvers",
  "hasSubscriptions",
  "path",
]);

const DIAGNOSTIC =
  /^(.+?)\((\d+),(\d+)\): error (TS2416|TS2540|TS4114): (.*)$/gm;

/**
 * TS2540 names no base class, so it requires a BaseSubgraph mention in the file.
 */
export function legacySubgraphHints(
  compilerOutput: string,
  packageRoot: string,
): string[] {
  const fieldsByFile = new Map<string, Set<string>>();
  const sources = new Map<string, readonly string[]>();
  const linesOf = (file: string): readonly string[] => {
    let lines = sources.get(file);
    if (lines === undefined) {
      try {
        lines = readFileSync(resolve(packageRoot, file), "utf8").split("\n");
      } catch {
        lines = [];
      }
      sources.set(file, lines);
    }
    return lines;
  };
  for (const [, file, line, column, code, message] of compilerOutput.matchAll(
    DIAGNOSTIC,
  )) {
    const lines = linesOf(file);
    const before = lines[Number(line) - 1]?.slice(0, Number(column) - 1) ?? "";
    const at = lines[Number(line) - 1]?.slice(Number(column) - 1) ?? "";
    const field = legacyFieldOf(code, message, before, at, lines);
    if (field === undefined) continue;
    let fields = fieldsByFile.get(file);
    if (fields === undefined) {
      fields = new Set();
      fieldsByFile.set(file, fields);
    }
    fields.add(field);
  }
  return Array.from(fieldsByFile, ([file, fields]) => {
    const names = [...LEGACY_FIELDS].filter((field) => fields.has(field));
    return `${file} declares the old-style subgraph ${names.length === 1 ? "field" : "fields"} ${names.join(", ")}. Old-style subgraphs (\`name\`/\`typeDefs\`/\`resolvers\`): run \`ph migrate\`.`;
  });
}

function legacyFieldOf(
  code: string,
  message: string,
  before: string,
  at: string,
  lines: readonly string[],
): string | undefined {
  let field: string | undefined;
  if (code === "TS2416") {
    field =
      /^Property '([\w$]+)' in type '[^']*' is not assignable to the same property in base type 'BaseSubgraph\b/.exec(
        message,
      )?.[1];
  } else if (code === "TS4114") {
    if (/base class 'BaseSubgraph\b/.test(message)) {
      field = /^[A-Za-z_$][\w$]*/.exec(at)?.[0];
    }
  } else if (
    /\bthis\s*\.\s*$/.test(before) &&
    lines.some((line) => line.includes("BaseSubgraph"))
  ) {
    field =
      /^Cannot assign to '([\w$]+)' because it is a read-only property/.exec(
        message,
      )?.[1];
  }
  return field !== undefined && LEGACY_FIELDS.has(field) ? field : undefined;
}
