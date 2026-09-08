import type { MigrationHistoryV1 } from "document-model/tooling";
import { dirname, resolve } from "node:path";
import {
  observeMigrationLifecycle,
  type CanarySummary,
  type MigrationLifecycleObservation,
  type MigrationPhaseJournal,
  type RetirementFixtureReport,
} from "./migration-lifecycle-probe.js";
import { canonicalJson as canonical, readJson } from "./utils.js";

export const B10_ASSERTION_IDS = [
  "B10.report",
  "B10.beside-write",
  "B10.verify",
  "B10.artifact",
  "B10.canary",
  "B10.deploy",
  "B10.rollback",
  "B10.retire",
  "B10.negative",
] as const;

export type MigrationLifecycleAssertionId = (typeof B10_ASSERTION_IDS)[number];

export type MigrationLifecycleEvaluation = {
  readonly assertions: readonly {
    readonly id: MigrationLifecycleAssertionId;
    readonly outcome: "pass" | "fail";
    readonly failures: readonly string[];
  }[];
  readonly observation: MigrationLifecycleObservation;
};

type MigrationFixtureManifest = {
  readonly gate: "B10";
  readonly profile: "fixture-family-only-v1";
};

function difference(
  left: unknown,
  right: unknown,
  label: string,
): string | null {
  return canonical(left) === canonical(right) ? null : `${label} changed`;
}

function failures(...values: readonly (string | null | false)[]): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

export async function evaluateMigrationLifecycle(request: {
  readonly manifestPath: string;
  readonly packageRoot: string;
  readonly repositoryRoot: string;
}): Promise<MigrationLifecycleEvaluation> {
  const fixtureRoot = dirname(request.manifestPath);
  const [
    manifest,
    historySet,
    expectedMigration,
    expectedEquivalence,
    expectedJournal,
    expectedCanary,
    expectedSourceManifest,
    expectedOutputManifest,
    expectedRetirement,
  ] = await Promise.all([
    readJson<MigrationFixtureManifest>(request.manifestPath),
    readJson<{ readonly histories: readonly MigrationHistoryV1[] }>(
      resolve(fixtureRoot, "histories.json"),
    ),
    readJson<MigrationLifecycleObservation["migrationReport"]>(
      resolve(fixtureRoot, "migration-report.json"),
    ),
    readJson<MigrationLifecycleObservation["equivalenceReport"]>(
      resolve(fixtureRoot, "equivalence-report.json"),
    ),
    readJson<MigrationPhaseJournal>(resolve(fixtureRoot, "phase-journal.json")),
    readJson<CanarySummary>(resolve(fixtureRoot, "canary-summary.json")),
    readJson<{
      readonly files: MigrationLifecycleObservation["sourceTreeManifest"];
    }>(resolve(fixtureRoot, "source-tree-manifest.json")),
    readJson<{
      readonly files: MigrationLifecycleObservation["outputTreeManifest"];
    }>(resolve(fixtureRoot, "output-tree-manifest.json")),
    readJson<RetirementFixtureReport>(
      resolve(
        request.packageRoot,
        "fixtures/retirement/v1/retirement-report.json",
      ),
    ),
  ]);
  if (manifest.profile !== "fixture-family-only-v1") {
    throw new Error("B10 fixture selected an unsupported evidence profile.");
  }
  const observation = await observeMigrationLifecycle({
    packageRoot: request.packageRoot,
    repositoryRoot: request.repositoryRoot,
    histories: historySet.histories,
  });
  const assertionFailures = new Map<MigrationLifecycleAssertionId, string[]>();

  assertionFailures.set(
    "B10.report",
    failures(
      observation.reportOnly.status !== "ready" &&
        `report-only status was ${observation.reportOnly.status}`,
      observation.reportOnly.writeCount !== 0 &&
        `report-only wrote ${observation.reportOnly.writeCount} files`,
      observation.reportOnly.beforeTreeDigest !==
        observation.reportOnly.afterTreeDigest &&
        "report-only changed the tree",
      difference(
        observation.migrationReport,
        expectedMigration,
        "migration report",
      ),
    ),
  );
  assertionFailures.set(
    "B10.beside-write",
    failures(
      !observation.candidateMatchesCommitted &&
        "generated candidate differs from the committed verification source",
      observation.migrationReport.status !== "applied" &&
        `apply status was ${observation.migrationReport.status}`,
      observation.migrationReport.candidateRoot !==
        "document-models/.verification/todo" &&
        "candidate was not written to the verification subpath",
      difference(
        observation.sourceTreeManifest,
        expectedSourceManifest.files,
        "legacy source tree",
      ),
      difference(
        observation.outputTreeManifest,
        expectedOutputManifest.files,
        "verification output tree",
      ),
    ),
  );
  assertionFailures.set(
    "B10.verify",
    failures(
      observation.equivalenceReport.status !== "equivalent" &&
        `equivalence status was ${observation.equivalenceReport.status}`,
      observation.equivalenceReport.checks.some(
        ({ outcome }) => outcome !== "pass",
      ) && "one or more equivalence checks failed",
      observation.equivalenceReport.histories.some(
        ({ firstDifference }) => firstDifference !== null,
      ) && "one or more replay prefixes diverged",
      difference(
        observation.equivalenceReport,
        expectedEquivalence,
        "equivalence report",
      ),
    ),
  );
  assertionFailures.set(
    "B10.artifact",
    failures(
      !observation.artifactValidation.matches &&
        "candidate artifact digest changed",
      canonical(observation.artifactValidation.importedVersions) !== "[1,2]" &&
        "candidate artifact did not import versions 1 and 2",
    ),
  );
  assertionFailures.set(
    "B10.canary",
    failures(
      observation.canarySummary.status !== "pass" && "canary did not pass",
      !observation.canarySummary.readOnly && "canary was not read-only",
      observation.canarySummary.mutationCount !== 0 && "canary mutated source",
      difference(observation.canarySummary, expectedCanary, "canary summary"),
    ),
  );
  assertionFailures.set(
    "B10.deploy",
    failures(
      observation.deploymentOutcomes.length !== 11 &&
        `expected 11 current hosts, received ${observation.deploymentOutcomes.length}`,
      observation.deploymentOutcomes.some(({ status }) => status !== "pass") &&
        "a current host lifecycle failed",
      observation.mixedRevision.policy !== "drained" &&
        "the fixture did not require a drained deployment",
      observation.mixedRevision.crossRevisionTraffic !== 0 &&
        "cross-revision traffic was nonzero",
      difference(observation.phaseJournal, expectedJournal, "phase journal"),
    ),
  );
  assertionFailures.set(
    "B10.rollback",
    failures(
      !observation.rollback.behaviorEquivalent &&
        "fresh candidate behavior did not match the legacy baseline",
      !observation.rollback.restored &&
        "fresh rollback did not restore the legacy digest",
      observation.rollback.freshProcessCount !== 3 &&
        "rollback did not use three fresh processes",
    ),
  );
  assertionFailures.set(
    "B10.retire",
    failures(
      observation.retirementReport.status !== "pass" &&
        "retirement fixture did not pass",
      observation.retirementReport.apply.status !== "retired" &&
        "approved targets were not retired",
      !observation.retirementReport.allTargetsRemoved &&
        "one or more approved targets remain",
      !observation.recoverableLegacyRoot.startsWith("git:") &&
        "retirement has no recoverable legacy root",
      difference(
        observation.retirementReport,
        expectedRetirement,
        "retirement report",
      ),
    ),
  );
  assertionFailures.set(
    "B10.negative",
    failures(
      observation.retirementReport.negativeCases.length !== 9 &&
        "the retirement negative matrix is incomplete",
      observation.retirementReport.negativeCases.some(
        ({ expectedCode, receivedCode }) => expectedCode !== receivedCode,
      ) && "a retirement failure returned the wrong diagnostic",
      observation.retirementReport.negativeCases.some(
        ({ treeRestored }) => !treeRestored,
      ) && "a rejected retirement did not preserve the attempted tree",
    ),
  );

  return {
    assertions: B10_ASSERTION_IDS.map((id) => ({
      id,
      outcome: assertionFailures.get(id)?.length ? "fail" : "pass",
      failures: assertionFailures.get(id) ?? [],
    })),
    observation,
  };
}
