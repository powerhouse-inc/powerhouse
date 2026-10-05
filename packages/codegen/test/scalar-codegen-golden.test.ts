import type {
  DocumentModelGlobalState,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateDocumentModelZodSchemas } from "../src/codegen/graphql.js";
import type { DocumentModelFileMakerArgs } from "../src/file-builders/index.mts";

const GOLDENS = new URL("./goldens/scalar-codegen/", import.meta.url);
const OUTPUTS = ["types.ts", "zod.ts", "schema.graphql"] as const;

const MAPPED_SCALARS = [
  "PHID",
  "OID",
  "OLabel",
  "Currency",
  "EmailAddress",
  "EthereumAddress",
  "URL",
  "Date",
  "DateTime",
  "Amount_Money",
  "Amount_Percentage",
  "Amount_Tokens",
  "Amount",
  "Amount_Fiat",
  "Amount_Crypto",
  "Amount_Currency",
  "Upload",
  "Address",
  "AttachmentRef",
  "Unknown",
];

function specificationWithState(schema: string): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema, initialValue: "{}", examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [],
  } as unknown as DocumentSpecification;
}

const everyScalar = specificationWithState(
  [
    "type ScalarsState {",
    ...MAPPED_SCALARS.map((name) => `  f${name}: ${name}`),
    "}",
  ].join("\n"),
);

function lastSpecification(path: string): DocumentSpecification {
  const model = JSON.parse(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  ) as DocumentModelGlobalState;
  return model.specifications[model.specifications.length - 1];
}

const CASES: ReadonlyArray<readonly [string, DocumentSpecification]> = [
  ["every-scalar", everyScalar],
  [
    "vetra-package",
    lastSpecification(
      "../../vetra/document-models/vetra-package/vetra-package.json",
    ),
  ],
  [
    "document-editor",
    lastSpecification(
      "../../vetra/document-models/document-editor/document-editor.json",
    ),
  ],
];

const workDir = mkdtempSync(join(tmpdir(), "ph-scalar-codegen-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

async function generate(
  name: string,
  specification: DocumentSpecification,
): Promise<Record<(typeof OUTPUTS)[number], string>> {
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

describe("codegen output per scalar", () => {
  it.each(CASES)(
    "%s generates the recorded files",
    async (name, specification) => {
      const generated = await generate(name, specification);
      for (const output of OUTPUTS) {
        const golden = new URL(`${name}/${output}.txt`, GOLDENS);
        if (process.env.UPDATE_GOLDENS === "1") {
          mkdirSync(new URL(`${name}/`, GOLDENS), { recursive: true });
          writeFileSync(golden, generated[output]);
        }
        expect(
          generated[output],
          `${name}/${output} differs from its golden; rerun with UPDATE_GOLDENS=1 to record an intended change`,
        ).toBe(readFileSync(golden, "utf8"));
      }
    },
    60_000,
  );

  it("rejects a model that uses JSONObject", async () => {
    await expect(
      generate(
        "json-object",
        specificationWithState("type ScalarsState {\n  value: JSONObject\n}"),
      ),
    ).rejects.toThrow();
  }, 60_000);
});
