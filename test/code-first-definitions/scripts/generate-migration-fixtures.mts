import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B10_NEGATIVE_CASES,
  createTodoMigrationHistories,
  observeMigrationLifecycle,
} from "../src/evidence/migration-lifecycle-probe.js";
import { sha256, writeJson } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const migrationRoot = resolve(packageRoot, "fixtures/migrations/v1");
const retirementRoot = resolve(packageRoot, "fixtures/retirement/v1");

const histories = createTodoMigrationHistories();
const historyPath = resolve(migrationRoot, "histories.json");
await writeJson(historyPath, {
  kind: "powerhouse.migration-histories",
  formatVersion: 1,
  histories,
});

const observation = await observeMigrationLifecycle({
  packageRoot,
  repositoryRoot,
  histories,
});

await Promise.all([
  writeJson(
    resolve(migrationRoot, "migration-report.json"),
    observation.migrationReport,
  ),
  writeJson(
    resolve(migrationRoot, "equivalence-report.json"),
    observation.equivalenceReport,
  ),
  writeJson(
    resolve(migrationRoot, "phase-journal.json"),
    observation.phaseJournal,
  ),
  writeJson(
    resolve(migrationRoot, "canary-summary.json"),
    observation.canarySummary,
  ),
  writeJson(resolve(migrationRoot, "source-tree-manifest.json"), {
    kind: "powerhouse.byte-manifest",
    formatVersion: 1,
    root: "test/versioned-documents/document-models/todo",
    files: observation.sourceTreeManifest,
  }),
  writeJson(resolve(migrationRoot, "output-tree-manifest.json"), {
    kind: "powerhouse.byte-manifest",
    formatVersion: 1,
    root: "test/versioned-documents/document-models/.verification/todo",
    files: observation.outputTreeManifest,
  }),
  writeJson(
    resolve(retirementRoot, "retirement-report.json"),
    observation.retirementReport,
  ),
]);

await writeJson(resolve(retirementRoot, "manifest.json"), {
  kind: "powerhouse.retirement-fixture-manifest",
  formatVersion: 1,
  family: {
    documentType: observation.equivalenceReport.family.documentType,
    digest: observation.equivalenceReport.family.digest,
  },
  templateRoot:
    "./fixtures/retirement/v1/template/document-models/retired-todo",
  report: "./fixtures/retirement/v1/retirement-report.json",
  planSchema: "./schemas/retirement-plan-v1.schema.json",
  recoverableLegacyRoot: observation.recoverableLegacyRoot,
  negativeCases: B10_NEGATIVE_CASES,
});

const [
  fixtureSchema,
  contract,
  b9Manifest,
  b3Manifest,
  b8Manifest,
  b5Manifest,
  b2Manifest,
] = await Promise.all([
  readFile(
    resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
  ),
  readFile(resolve(repositoryRoot, "cf-spec/08-implementation-plan.md")),
  readFile(
    resolve(
      packageRoot,
      "fixtures/reproductions/v1/failure-propagation/manifest.json",
    ),
  ),
  readFile(resolve(packageRoot, "fixtures/protocol/v1/matrix.json")),
  readFile(resolve(packageRoot, "fixtures/packages/v1/manifest.json")),
  readFile(resolve(packageRoot, "fixtures/packed-consumers/manifest-v1.json")),
  readFile(resolve(packageRoot, "fixtures/histories/v1/manifest.json")),
]);

const caseFixtures: Readonly<Record<string, string>> = {
  report: "./fixtures/migrations/v1/migration-report.json",
  "beside-write": "./fixtures/migrations/v1/output-tree-manifest.json",
  verify: "./fixtures/migrations/v1/equivalence-report.json",
  artifact: "./fixtures/migrations/v1/output-tree-manifest.json",
  canary: "./fixtures/migrations/v1/canary-summary.json",
  deploy: "./fixtures/migrations/v1/phase-journal.json",
  rollback: "./fixtures/migrations/v1/phase-journal.json",
  retire: "./fixtures/retirement/v1/retirement-report.json",
  negative: "./fixtures/retirement/v1/retirement-report.json",
};
const coveredVariants: Readonly<Record<string, readonly string[]>> = {
  report: ["report-only", "zero-write", "fixture-family"],
  "beside-write": ["apply", "verification-subpath", "legacy-untouched"],
  verify: ["stored-specification", "creators", "every-prefix", "v1-v2"],
  artifact: ["hash-bound", "candidate-import", "committed-bytes"],
  canary: ["read-only", "zero-mutation"],
  deploy: ["current-hosts", "drained-deployment", "zero-cross-revision"],
  rollback: ["fresh-process", "legacy-baseline"],
  retire: ["exact-target-set", "recoverable-root", "post-stage-check"],
  negative: B10_NEGATIVE_CASES.map(({ caseId }) => caseId),
};
const phases = [
  "report",
  "beside-write",
  "verify",
  "artifact",
  "canary",
  "deploy",
  "rollback",
  "retire",
  "negative",
] as const;

await writeJson(resolve(migrationRoot, "manifest.json"), {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B10",
  fixtureVersion: "deterministic-1.0.0",
  requiredTools: {
    node: ">=24",
    profile: "fixture-family-only-v1",
  },
  schemaDigest: sha256(fixtureSchema),
  directDependencies: [
    {
      gate: "B2",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b2Manifest),
    },
    {
      gate: "B3",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b3Manifest),
    },
    {
      gate: "B5",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b5Manifest),
    },
    {
      gate: "B8",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b8Manifest),
    },
    {
      gate: "B9",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b9Manifest),
    },
  ],
  profile: "fixture-family-only-v1",
  retirementManifest: "./fixtures/retirement/v1/manifest.json",
  caseCount: phases.length,
  cases: phases.map((phase) => ({
    caseId: `migration-${phase}`,
    phase,
    fixture: caseFixtures[phase],
    expectedOutcome: "pass",
    coveredVariants: coveredVariants[phase],
  })),
});

process.stdout.write(
  `Generated deterministic migration lifecycle fixtures at ${relative(
    repositoryRoot,
    resolve(migrationRoot, "manifest.json"),
  )}.\n`,
);
