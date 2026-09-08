import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import {
  B10_ASSERTION_IDS,
  evaluateMigrationLifecycle,
  type MigrationLifecycleEvaluation,
} from "../src/evidence/migration-lifecycle.js";
import { B10_NEGATIVE_CASES } from "../src/evidence/migration-lifecycle-probe.js";

const packageRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(packageRoot, "../..");
const manifestPath = resolve(
  packageRoot,
  "fixtures/migrations/v1/manifest.json",
);

let evaluation: MigrationLifecycleEvaluation;

beforeAll(async () => {
  evaluation = await evaluateMigrationLifecycle({
    manifestPath,
    packageRoot,
    repositoryRoot,
  });
}, 30_000);

describe("B10 deterministic migration lifecycle", () => {
  it("validates the migration manifest, equivalence report, and retirement plan", async () => {
    const [
      fixtureSchema,
      equivalenceSchema,
      retirementSchema,
      manifest,
      equivalence,
      retirementReport,
    ] = await Promise.all([
      readFile(
        resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(
        resolve(packageRoot, "schemas/equivalence-report-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(
        resolve(packageRoot, "schemas/retirement-plan-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(manifestPath, "utf8").then(
        (value) => JSON.parse(value) as unknown,
      ),
      readFile(
        resolve(packageRoot, "fixtures/migrations/v1/equivalence-report.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as unknown),
      readFile(
        resolve(packageRoot, "fixtures/retirement/v1/retirement-report.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as { readonly plan: unknown }),
    ]);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const fixture = ajv.compile(fixtureSchema);
    const equivalenceCheck = ajv.compile(equivalenceSchema);
    const retirement = ajv.compile(retirementSchema);
    expect(fixture(manifest), JSON.stringify(fixture.errors)).toBe(true);
    expect(
      equivalenceCheck(equivalence),
      JSON.stringify(equivalenceCheck.errors),
    ).toBe(true);
    expect(
      retirement(retirementReport.plan),
      JSON.stringify(retirement.errors),
    ).toBe(true);
  });

  it("passes all nine deterministic lifecycle assertions", () => {
    expect(evaluation.assertions.map(({ id }) => id)).toEqual(
      B10_ASSERTION_IDS,
    );
    expect(
      evaluation.assertions.every(({ outcome }) => outcome === "pass"),
    ).toBe(true);
    expect(evaluation.observation.reportOnly).toMatchObject({
      status: "ready",
      writeCount: 0,
    });
    expect(evaluation.observation.candidateMatchesCommitted).toBe(true);
    expect(evaluation.observation.equivalenceReport).toMatchObject({
      status: "equivalent",
      family: { documentType: "test/todo", versions: [1, 2] },
    });
    expect(evaluation.observation.equivalenceReport.histories).toHaveLength(10);
  });

  it("binds deployment, rollback, and retirement to the same artifact", () => {
    const observation = evaluation.observation;
    expect(observation.deploymentOutcomes).toHaveLength(11);
    expect(
      observation.deploymentOutcomes.every(
        ({ artifactDigest }) =>
          artifactDigest === observation.artifactValidation.actualDigest,
      ),
    ).toBe(true);
    expect(observation.mixedRevision).toEqual({
      policy: "drained",
      overlapAllowed: false,
      oldRevisionDrained: true,
      crossRevisionTraffic: 0,
      newRevisionActivated: true,
    });
    expect(observation.rollback).toMatchObject({
      behaviorEquivalent: true,
      restored: true,
      freshProcessCount: 3,
    });
    expect(observation.retirementReport.plan.artifactDigest).toBe(
      observation.artifactValidation.actualDigest,
    );
    expect(observation.retirementReport.allTargetsRemoved).toBe(true);
  });

  it("rejects the full retirement negative matrix without losing its input tree", () => {
    expect(
      evaluation.observation.retirementReport.negativeCases.map(
        ({ caseId, expectedCode, receivedCode, treeRestored }) => ({
          caseId,
          expectedCode,
          receivedCode,
          treeRestored,
        }),
      ),
    ).toEqual(
      B10_NEGATIVE_CASES.map(({ caseId, expectedCode }) => ({
        caseId,
        expectedCode,
        receivedCode: expectedCode,
        treeRestored: true,
      })),
    );
  });
});
