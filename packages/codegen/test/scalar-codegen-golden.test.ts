import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateDocumentModelZodSchemas,
  scalars,
} from "../src/codegen/graphql.js";
import type { DocumentModelFileMakerArgs } from "../src/file-builders/index.mts";

const MAPPED_SCALARS = Object.keys(scalars);

function specification(
  stateSchema: string,
  inputSchema = "",
): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema: stateSchema, initialValue: "{}", examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: inputSchema
      ? [{ name: "scalars", operations: [{ schema: inputSchema }] }]
      : [],
  } as unknown as DocumentSpecification;
}

const everyScalar = specification(
  [
    "type ScalarsState {",
    ...MAPPED_SCALARS.map((name) => `  f${name}: ${name}`),
    "}",
  ].join("\n"),
  [
    "input SetScalarsInput {",
    ...MAPPED_SCALARS.map((name) => `  f${name}: ${name}!`),
    "  ids: [PHID!]!",
    "  note: String",
    "}",
  ].join("\n"),
);

let workDir: string;
beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "ph-scalar-codegen-"));
});
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

async function generate(name: string, specification: DocumentSpecification) {
  const versionDirPath = join(workDir, name);
  const schemaDirPath = join(versionDirPath, "gen", "schema");
  mkdirSync(schemaDirPath, { recursive: true });
  await generateDocumentModelZodSchemas({
    specification,
    schemaDirPath,
    versionDirPath,
  } as DocumentModelFileMakerArgs);
  return {
    "types.ts": readFileSync(join(schemaDirPath, "types.ts"), "utf8"),
    "zod.ts": readFileSync(join(schemaDirPath, "zod.ts"), "utf8"),
    "schema.graphql": readFileSync(
      join(versionDirPath, "schema.graphql"),
      "utf8",
    ),
  };
}

describe("scalar codegen", () => {
  it("generates the recorded files for every mapped scalar", async () => {
    const generated = await generate("every-scalar", everyScalar);
    for (const [output, contents] of Object.entries(generated)) {
      await expect(contents).toMatchFileSnapshot(
        `./goldens/scalar-codegen/every-scalar/${output}.txt`,
      );
    }
  });

  it("rejects a model that uses JSONObject", async () => {
    await expect(
      generate(
        "json-object",
        specification("type ScalarsState {\n  value: JSONObject\n}"),
      ),
    ).rejects.toThrow(/Unknown type: "JSONObject"/);
  });
});
