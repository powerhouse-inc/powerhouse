import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import {
  evaluateScalarConformance,
  type ScalarDifference,
  type ScalarOutcomeGolden,
} from "../src/evidence/scalar-conformance.js";
import type { ScalarDefinitionV1 } from "@powerhousedao/shared/document-model";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(packageRoot, "fixtures/scalars/v1");

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function freshProbe(browser: boolean): `sha256:${string}` {
  const args = [
    "--conditions=source",
    ...(browser ? ["--conditions=browser"] : []),
    "--import",
    "tsx",
    "scripts/probe-scalar-metadata.mts",
  ];
  return execFileSync(process.execPath, args, {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim() as `sha256:${string}`;
}

describe("B14 scalar catalog conformance", () => {
  it("validates all 21 closed definitions and rejects unknown properties", async () => {
    const [schema, definitions] = await Promise.all([
      json<object>(
        resolve(packageRoot, "schemas/scalar-definition-v1.schema.json"),
      ),
      json<ScalarDefinitionV1[]>(resolve(fixtureRoot, "definitions.json")),
    ]);
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );

    expect(definitions).toHaveLength(21);
    for (const definition of definitions) {
      expect(validate(definition), JSON.stringify(validate.errors)).toBe(true);
    }
    expect(validate({ ...definitions[0], unexpected: true })).toBe(false);
  });

  it("matches validator, installed coercion, host binding, exemptions, and fresh-process metadata", async () => {
    const [schema, definitions, goldens, differenceList, expectedInventory] =
      await Promise.all([
        json<object>(
          resolve(packageRoot, "schemas/scalar-definition-v1.schema.json"),
        ),
        json<ScalarDefinitionV1[]>(resolve(fixtureRoot, "definitions.json")),
        json<ScalarOutcomeGolden[]>(
          resolve(fixtureRoot, "current-coercion-goldens.json"),
        ),
        json<{
          readonly differences: readonly ScalarDifference[];
        }>(resolve(fixtureRoot, "difference-list.json")),
        json<{
          readonly names: readonly string[];
          readonly digest: `sha256:${string}`;
        }>(resolve(fixtureRoot, "scalar-inventory-digest.json")),
      ]);
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );
    const evaluation = evaluateScalarConformance({
      expectedGoldens: goldens,
      expectedDefinitions: definitions,
      expectedDifferences: differenceList.differences,
      freshProcessDigests: [freshProbe(false), freshProbe(true)],
      definitionSchemaValid: definitions.every((definition) =>
        validate(definition),
      ),
      unknownPropertyRejected: !validate({
        ...definitions[0],
        unexpected: true,
      }),
      expectedInventory,
    });

    expect(evaluation.cases).toHaveLength(42);
    expect(evaluation.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "B14.schema", outcome: "pass" }),
        expect.objectContaining({ id: "B14.inventory", outcome: "pass" }),
        expect.objectContaining({ id: "B14.validation", outcome: "pass" }),
        expect.objectContaining({ id: "B14.coercion", outcome: "pass" }),
        expect.objectContaining({ id: "B14.exemptions", outcome: "pass" }),
        expect.objectContaining({
          id: "B14.graphql-profile",
          outcome: "pass",
        }),
        expect.objectContaining({
          id: "B14.fresh-process",
          outcome: "pass",
        }),
      ]),
    );
  }, 30_000);

  it("keeps the normative OID and Amount_Crypto review vectors exact", async () => {
    const [review, definitions] = await Promise.all([
      json<ScalarDefinitionV1[]>(
        resolve(
          packageRoot,
          "../../cf-spec/fixtures/v1/scalar-definition.json",
        ),
      ),
      json<ScalarDefinitionV1[]>(resolve(fixtureRoot, "definitions.json")),
    ]);
    expect(
      ["OID", "Amount_Crypto"].map((name) =>
        definitions.find((definition) => definition.name === name),
      ),
    ).toEqual(review);
  });
});
