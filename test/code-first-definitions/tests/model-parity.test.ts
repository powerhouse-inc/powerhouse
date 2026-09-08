import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import {
  B1_ASSERTION_IDS,
  evaluateModelParity,
  readModelParityManifest,
  type B1AssertionId,
  type ModelParityEvaluation,
} from "../src/evidence/model-parity.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");

let evaluation: ModelParityEvaluation;

function assertion(id: B1AssertionId) {
  const result = evaluation.assertions.find((candidate) => candidate.id === id);
  expect(result, `${id} was not evaluated`).toBeDefined();
  expect(result?.failures, result?.failures.join("\n")).toEqual([]);
  expect(result?.outcome).toBe("pass");
}

beforeAll(async () => {
  evaluation = await evaluateModelParity();
}, 60_000);

describe("B1 model parity", () => {
  it("schema-validates the closed fixture and every structured definition", async () => {
    const [manifest, fixtureSchema] = await Promise.all([
      readModelParityManifest(),
      readFile(
        resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as unknown),
    ]);
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      fixtureSchema,
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(manifest.cases).toHaveLength(10);
    expect(new Set(manifest.cases.map(({ rootId }) => rootId)).size).toBe(9);
    assertion("B1.schema");
  });

  it("matches the normalized structured golden", () => {
    assertion("B1.structured");
  });

  it("matches the complete stored DocumentModelPHState golden", () => {
    assertion("B1.stored-state");
  });

  it("matches every explicit legacy identity vector", () => {
    assertion("B1.identity");
  });

  it("preserves every authored and compatibility-AST array order", () => {
    assertion("B1.order");
  });

  it("rejects every unsupported field validation option", () => {
    assertion("B1.field-options");
  });

  it("rejects invalid state roots and canonically materializes empty local state", () => {
    assertion("B1.state-root");
  });

  it("produces one digest across two cold imports per case", () => {
    assertion("B1.repeat-import");
    for (const result of evaluation.cases) {
      expect(result.coldImportDigests[0]).toBe(result.coldImportDigests[1]);
    }
  });

  it("naming-derivation-has-one-source", async () => {
    const codegenNames = await readFile(
      resolve(
        repositoryRoot,
        "packages/codegen/src/name-builders/get-action-names.ts",
      ),
      "utf8",
    );
    expect(codegenNames).toContain("deriveDocumentModelModuleNames");
    expect(codegenNames).toContain("deriveDocumentModelOperationNames");
    expect(codegenNames).not.toMatch(/import\s*\{[^}]*constantCase/);
  });

  it("emits exactly the registered B1 assertion IDs", () => {
    expect(evaluation.assertions.map(({ id }) => id)).toEqual(B1_ASSERTION_IDS);
  });
});
