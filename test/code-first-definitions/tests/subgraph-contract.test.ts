import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { Ajv, type AjvValidate } from "../src/evidence/ajv.js";
import {
  evaluateSubgraphContract,
  runSubgraphContractCases,
  type SubgraphContractEvaluation,
} from "../src/evidence/subgraph-contract.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(packageRoot, "fixtures/subgraphs/v1");

let evaluation: SubgraphContractEvaluation;
let validateDefinition: AjvValidate;

beforeAll(async () => {
  const definitionSchema = JSON.parse(
    await readFile(
      resolve(packageRoot, "schemas/subgraph-definition-v1.schema.json"),
      "utf8",
    ),
  ) as object;
  validateDefinition = new Ajv({ allErrors: true, strict: false }).compile(
    definitionSchema,
  );
  evaluation = await evaluateSubgraphContract(
    resolve(fixtureRoot, "manifest.json"),
    validateDefinition,
  );
}, 60_000);

describe("B7 subgraph contract", () => {
  it("validates the closed seven-case fixture manifest", async () => {
    const [schema, manifest] = await Promise.all([
      readFile(
        resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(resolve(fixtureRoot, "manifest.json"), "utf8").then(
        (value) => JSON.parse(value) as { readonly cases: readonly unknown[] },
      ),
    ]);
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(manifest.cases).toHaveLength(7);
  });

  it("validates every structured definition and rejects unknown properties", () => {
    const probe = runSubgraphContractCases(packageRoot);

    expect(probe.definitions.length).toBeGreaterThanOrEqual(7);
    for (const definition of probe.definitions) {
      expect(
        validateDefinition(definition),
        JSON.stringify(validateDefinition.errors),
      ).toBe(true);
    }
    expect(
      validateDefinition({ ...probe.definitions[0], unexpected: true }),
    ).toBe(false);
  }, 30_000);

  it("passes all eight contract assertions without a pairwise mismatch", () => {
    expect(evaluation.assertions).toHaveLength(8);
    expect(
      evaluation.assertions.every(({ outcome }) => outcome === "pass"),
    ).toBe(true);
    expect(evaluation.cases).toHaveLength(7);
    expect(
      evaluation.cases.every(({ firstMismatch }) => firstMismatch === null),
    ).toBe(true);
  });

  it("locks transport tri-state, duplicate replacement, and failed-composition routing", () => {
    const byId = Object.fromEntries(
      evaluation.cases.map((result) => [result.caseId, result]),
    );

    expect(byId["typed-subscription-true"]?.transportFlags).toEqual({
      hasSubscriptions: [true],
      webSocketAllocations: 1,
      sseRoutes: [
        "/api/graphql/stream",
        "/api/graphql/typed-subscription/stream",
      ],
    });
    expect(byId["typed-subscription-true"]?.allocationCount).toBe(1);
    expect(byId["typed-subscription-true"]?.cleanupObservations).toEqual([
      "cleanup",
    ]);
    expect(
      byId["compat-subscription-undefined"]?.transportFlags.hasSubscriptions,
    ).toEqual(["undefined"]);
    expect(
      byId["compat-subscription-false"]?.transportFlags.hasSubscriptions,
    ).toEqual([false]);
    expect(byId["duplicate-first-wins"]?.replacementOutcome).toBe("kept-first");
    expect(byId["composition-conflict-routes-kept"]?.replacementOutcome).toBe(
      "composition-failed-routes-kept",
    );
    expect(byId["composition-conflict-routes-kept"]?.route).toBe(
      "/api/graphql/conflict-a,/api/graphql/conflict-b",
    );
    expect(
      byId["composition-conflict-routes-kept"]?.apolloDiagnostics,
    ).toHaveLength(1);
  });
});
