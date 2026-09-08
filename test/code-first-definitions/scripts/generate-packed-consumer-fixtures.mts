import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  B5_CASE_IDS,
  jsonBytes,
  probePackedConsumers,
  type B5CaseId,
} from "../src/evidence/packed-consumers-probe.js";
import type { GateEvidenceReport } from "../src/evidence/run-gate-evidence.js";
import { sha256 } from "../src/evidence/utils.js";

const packageRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(packageRoot, "fixtures/packed-consumers");
const artifactRoot = resolve(fixtureRoot, "artifacts");
const tarballPath = resolve(
  artifactRoot,
  "code-first-packed-fixture-0.0.0.tgz",
);
await mkdir(artifactRoot, { recursive: true });
const [fixtureSchemaBytes, b8Report, b9Report] = await Promise.all([
  readFile(
    resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
  ),
  readFile(resolve(packageRoot, ".evidence/B8/report.json"), "utf8").then(
    (value) => JSON.parse(value) as GateEvidenceReport,
  ),
  readFile(resolve(packageRoot, ".evidence/B9/report.json"), "utf8").then(
    (value) => JSON.parse(value) as GateEvidenceReport,
  ),
]);
const current = await probePackedConsumers({
  packageRoot,
  retainTarballAt: tarballPath,
});
await Promise.all([
  writeFile(
    resolve(fixtureRoot, "packed-file-manifest.json"),
    jsonBytes(current.packedFileManifest),
  ),
  writeFile(
    resolve(fixtureRoot, "dependency-tree.json"),
    jsonBytes(current.dependencyTrees),
  ),
  writeFile(
    resolve(fixtureRoot, "resolver-trace.json"),
    jsonBytes(current.resolverTraces),
  ),
]);

const dependency = (gate: "B8" | "B9", report: GateEvidenceReport) => ({
  gate,
  contractRevision: report.contract.revision,
  fixtureManifestDigest: report.fixture.manifestDigest,
});
const exportPaths: Readonly<
  Record<
    B5CaseId,
    {
      readonly root: string;
      readonly documentModels: string;
      readonly declaration: string;
    }
  >
> = {
  node: {
    root: "./dist/node.js",
    documentModels: "./dist/node.js",
    declaration: "./dist/node.d.ts",
  },
  "browser-worker": {
    root: "./dist/browser.js",
    documentModels: "./dist/browser.js",
    declaration: "./dist/node.d.ts",
  },
};
const variants: Readonly<Record<B5CaseId, readonly string[]>> = {
  node: [
    "fresh-directory",
    "offline-install",
    "node-conditions",
    "root-and-subpath-imports",
    "code-first-family-v1-v2",
  ],
  "browser-worker": [
    "fresh-directory",
    "offline-install",
    "browser-condition",
    "worker-thread-handshake",
    "root-and-subpath-imports",
  ],
};
const manifest = {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B5",
  fixtureVersion: "packed-consumers-v1",
  caseCount: B5_CASE_IDS.length,
  requiredTools: {
    node: process.version,
    npm: "locked-system",
    typescript: "locked-workspace",
    tsdown: "locked-workspace",
  },
  schemaDigest: sha256(fixtureSchemaBytes),
  directDependencies: [dependency("B8", b8Report), dependency("B9", b9Report)],
  cases: B5_CASE_IDS.map((caseId) => {
    const observation = current.consumers.find(
      (candidate) => candidate.caseId === caseId,
    );
    if (!observation) throw new Error(`No B5 result for ${caseId}.`);
    return {
      caseId,
      consumerSource: `./fixtures/packed-consumers/${caseId}/consumer.ts`,
      runtimeEntry:
        caseId === "node"
          ? "./fixtures/packed-consumers/node/runtime.mjs"
          : "./fixtures/packed-consumers/browser-worker/launcher.mjs",
      tarball: {
        path: "./artifacts/code-first-packed-fixture-0.0.0.tgz",
        digest: current.tarballDigest,
      },
      lockfileDigest: observation.lockfileDigest,
      exportPaths: exportPaths[caseId],
      runtimeConditions: caseId === "node" ? [] : ["browser"],
      expectedLogicalDefinitions: observation.projection,
      expectedActionType: observation.actionType,
      coveredVariants: variants[caseId],
    };
  }),
};
await writeFile(resolve(fixtureRoot, "manifest-v1.json"), jsonBytes(manifest));
