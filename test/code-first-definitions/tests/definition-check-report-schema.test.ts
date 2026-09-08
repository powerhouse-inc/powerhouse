import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Ajv, type AjvValidate as Validate } from "../src/evidence/ajv.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function validator(): Promise<Validate> {
  const schema = JSON.parse(
    await readFile(
      resolve(packageRoot, "schemas/definition-check-report-v1.schema.json"),
      "utf8",
    ),
  ) as unknown;
  return new Ajv({ allErrors: true, strict: false }).compile(schema);
}

const digest = `sha256:${"0".repeat(64)}`;
const base = {
  kind: "powerhouse.definition-check",
  formatVersion: 1,
  profile: "edit",
  sourceSet: {
    mode: "code-first",
    origin: "config",
    digest,
    sources: [{ specifier: "./src/model.ts", exportPath: ["Model"] }],
  },
  definitions: [
    {
      kind: "document-model",
      key: "powerhouse/test",
      version: 1,
      digest,
      source: { specifier: "./src/model.ts", exportPath: ["Model"] },
    },
  ],
  diagnostics: [],
  summary: { errors: 0, warnings: 0 },
} as const;

describe("definition check report schema", () => {
  it("accepts closed ordinary and explicit-legacy reports", async () => {
    const validate = await validator();

    expect(
      validate({ ...base, status: "ok" }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    expect(
      validate({
        ...base,
        status: "skipped",
        skipReason: "explicit-legacy-mode",
        sourceSet: {
          mode: "legacy",
          origin: "config",
          digest,
          sources: [],
        },
        definitions: [],
        diagnostics: [],
        summary: { errors: 0, warnings: 0 },
      }),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it("makes skipped and explicit legacy mode an if-and-only-if state", async () => {
    const validate = await validator();

    expect(
      validate({
        ...base,
        status: "ok",
        skipReason: "explicit-legacy-mode",
      }),
    ).toBe(false);
    expect(
      validate({
        ...base,
        status: "skipped",
        skipReason: "explicit-legacy-mode",
      }),
    ).toBe(false);
  });

  it("rejects unknown report and diagnostic fields", async () => {
    const validate = await validator();
    expect(validate({ ...base, status: "ok", timestamp: 1 })).toBe(false);
    expect(
      validate({
        ...base,
        status: "invalid",
        diagnostics: [
          {
            code: "PH-DEF-TEST",
            severity: "error",
            phase: "definition",
            path: [],
            message: "invalid",
            repair: "repair it",
            stack: "machine-specific stack",
          },
        ],
        summary: { errors: 1, warnings: 0 },
      }),
    ).toBe(false);
  });
});
