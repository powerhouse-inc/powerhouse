import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProtocolMatrixCases } from "../src/evidence/protocol-matrix.js";
import { sha256, writeJson } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = resolve(packageRoot, "fixtures/protocol/v1");
const matrixPath = resolve(fixtureRoot, "matrix.json");

const [fixtureSchema, contract, b9Manifest, b1Manifest] = await Promise.all([
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
]);
const cases = createProtocolMatrixCases();

await writeJson(matrixPath, {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B3",
  fixtureVersion: "1.0.0",
  requiredTools: {
    node: ">=24",
    zod: "catalog",
    graphql: "catalog",
  },
  schemaDigest: sha256(fixtureSchema),
  directDependencies: [
    {
      gate: "B1",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b1Manifest),
    },
    {
      gate: "B9",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b9Manifest),
    },
  ],
  caseCount: cases.length,
  cases,
});

process.stdout.write(
  `Generated ${cases.length} protocol rows at ${relative(
    repositoryRoot,
    matrixPath,
  )}.\n`,
);
