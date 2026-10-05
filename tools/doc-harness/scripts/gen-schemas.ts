/**
 * Regenerates prompts/schemas/*.schema.json from the zod schemas. The files
 * are checked in and handed to `claude -p --json-schema`; a test guards drift.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PROMPTS_ROOT } from "../src/lib/paths.js";
import { JudgeOutput, VerifyOutput } from "../src/lib/schemas.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Closes every object node; --json-schema wants a plain, strict object. */
function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (!isObject(node)) return node;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = closeObjects(value);
  }
  if (out.type === "object" && isObject(out.properties)) {
    out.additionalProperties = false;
  }
  return out;
}

export function toPromptSchema(schema: z.ZodType): JsonObject {
  // io: "input" so fields with defaults stay optional for the model.
  const { $schema: _dropped, ...rest } = z.toJSONSchema(schema, {
    io: "input",
  });
  return closeObjects(rest) as JsonObject;
}

export const SCHEMA_FILES = {
  "judge.schema.json": JudgeOutput,
  "verifier.schema.json": VerifyOutput,
} as const;

/** File basename -> exact file contents. */
export function renderSchemaFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [file, schema] of Object.entries(SCHEMA_FILES)) {
    out[file] = `${JSON.stringify(toPromptSchema(schema), null, 2)}\n`;
  }
  return out;
}

export function schemaFilePath(file: string): string {
  return path.join(PROMPTS_ROOT, "schemas", file);
}

function main(): void {
  for (const [file, contents] of Object.entries(renderSchemaFiles())) {
    const target = schemaFilePath(file);
    writeFileSync(target, contents);
    process.stdout.write(`wrote ${target}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
