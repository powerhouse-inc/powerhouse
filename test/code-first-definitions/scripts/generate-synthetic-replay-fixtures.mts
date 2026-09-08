import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSyntheticPrefixArtifact,
  createSyntheticReplayHistories,
} from "../src/evidence/synthetic-replay.js";
import { sha256, writeJson } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = resolve(packageRoot, "fixtures/histories/v1");

const histories = createSyntheticReplayHistories();
const prefixes = createSyntheticPrefixArtifact(histories);
const historyPath = resolve(fixtureRoot, "histories.json");
const prefixPath = resolve(fixtureRoot, "synthetic-prefixes.json");
const scopePath = resolve(fixtureRoot, "scope-declaration.json");
const manifestPath = resolve(fixtureRoot, "manifest.json");

await writeJson(historyPath, histories);
await writeJson(prefixPath, prefixes);
await writeJson(scopePath, {
  kind: "powerhouse.synthetic-replay-scope",
  formatVersion: 1,
  profile: "synthetic-only-v1",
  productionCorpus: {
    status: "not-established",
    reason:
      "The production corpus verifier and restricted operational approvals are deferred by the accepted release scope.",
  },
  deferredArtifacts: [
    "production-privacy-approval",
    "production-verifier",
    "production-scrubbed-summary",
  ],
});

const [fixtureSchema, contract, b9Manifest, b1Manifest, b3Manifest] =
  await Promise.all([
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
    readFile(resolve(packageRoot, "fixtures/definitions/v1/manifest.json")),
    readFile(resolve(packageRoot, "fixtures/protocol/v1/matrix.json")),
  ]);

await writeJson(manifestPath, {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B2",
  fixtureVersion: "synthetic-1.0.0",
  requiredTools: {
    node: ">=24",
    profile: "synthetic-only-v1",
  },
  schemaDigest: sha256(fixtureSchema),
  directDependencies: [
    {
      gate: "B1",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b1Manifest),
    },
    {
      gate: "B3",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b3Manifest),
    },
    {
      gate: "B9",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b9Manifest),
    },
  ],
  profile: "synthetic-only-v1",
  productionCorpusStatus: "not-established",
  historySet: "./histories.json",
  expectedPrefixes: "./synthetic-prefixes.json",
  scopeDeclaration: "./scope-declaration.json",
  caseCount: histories.histories.length,
  cases: histories.histories.map((history) => ({
    caseId: history.caseId,
    documentType: history.documentType,
    version: history.version,
    mode: history.mode,
    operationCount: history.operations.length,
    prefixCount: history.operations.length + 1,
    coveredActionTypes: history.coveredActionTypes,
    scopes: history.scopes,
    outcomes: history.outcomes,
    upgradeEdges: history.upgradeEdges,
  })),
});

process.stdout.write(
  `Generated ${histories.histories.length} synthetic replay histories at ${relative(
    repositoryRoot,
    manifestPath,
  )}.\n`,
);
