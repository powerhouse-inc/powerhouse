import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  B8_HOSTS,
  hostNamespaceGoldens,
  runLoaderCompatibilityCases,
} from "../src/evidence/loader-compatibility.js";
import type { GateEvidenceReport } from "../src/evidence/run-gate-evidence.js";
import { sha256 } from "../src/evidence/utils.js";

const packageRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(packageRoot, "fixtures/packages/v1");
const [fixtureSchemaBytes, b1Report, b9Report] = await Promise.all([
  readFile(
    resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
  ),
  readFile(resolve(packageRoot, ".evidence/B1/report.json"), "utf8").then(
    (value) => JSON.parse(value) as GateEvidenceReport,
  ),
  readFile(resolve(packageRoot, ".evidence/B9/report.json"), "utf8").then(
    (value) => JSON.parse(value) as GateEvidenceReport,
  ),
]);
const current = runLoaderCompatibilityCases(packageRoot);
if (current.hosts.some(({ firstMismatch }) => firstMismatch !== null)) {
  throw new Error("One or more B8 legacy/code-first loader pairs diverged.");
}

await Promise.all([
  writeFile(
    resolve(fixtureRoot, "definition-source-results.json"),
    `${JSON.stringify(current.definitionSource, null, 2)}\n`,
  ),
  writeFile(
    resolve(fixtureRoot, "host-namespaces.json"),
    `${JSON.stringify(hostNamespaceGoldens(current.hosts), null, 2)}\n`,
  ),
]);

const dependency = (gate: "B1" | "B9", report: GateEvidenceReport) => ({
  gate,
  contractRevision: report.contract.revision,
  fixtureManifestDigest: report.fixture.manifestDigest,
});
const variants: Record<(typeof B8_HOSTS)[number], string[]> = {
  "definition-source": [
    "vite-import-adapter",
    "node-build-import-adapter",
    "rfc-6901",
    "one-import-per-revision",
    "fixed-code-unit-order",
  ],
  "node-server": [
    "direct-named-models",
    "aggregate-ignored",
    "nested-subgraph-flatten",
    "non-callable-retained",
  ],
  "http-cdn": [
    "nested-subgraph-flatten",
    "generic-export",
    "default-export",
    "non-callable-filtered",
  ],
  "vite-local": [
    "direct-named-models",
    "outer-inner-name-equality",
    "base-subgraph-predicate",
  ],
  "browser-static": ["document-model-lib", "latest-version"],
  "browser-worker": [
    "cdn-namespace",
    "aggregate-models",
    "aggregate-ignored",
    "latest-version",
  ],
  graphql: [
    "package-manager",
    "document-models",
    "upgrade-manifests",
    "subgraphs",
  ],
  mcp: ["vite-source", "direct-named-models", "aggregate-ignored"],
  connect: [
    "document-model-lib",
    "local-package-registration",
    "first-version-resolution",
  ],
  "reactor-worker": [
    "named-export-reference",
    "host-worker-manifest",
    "versioned-modules",
  ],
  registry: [
    "global-id-version-key",
    "unversioned-default-v1",
    "duplicate-diagnostic",
  ],
};
const fixtureFor = (
  hostId: (typeof B8_HOSTS)[number],
  mode: "legacy" | "code-first",
) => {
  if (hostId === "definition-source") {
    return "./fixtures/packages/v1/powerhouse.config.json";
  }
  if (
    hostId === "http-cdn" ||
    hostId === "vite-local" ||
    hostId === "graphql"
  ) {
    return "./fixtures/packages/v1/subgraphs.ts";
  }
  return mode === "legacy"
    ? "./fixtures/packages/v1/legacy-models.ts"
    : "./fixtures/packages/v1/source-models.ts";
};
const manifest = {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B8",
  fixtureVersion: "package-loaders-v1",
  caseCount: B8_HOSTS.length,
  requiredTools: {
    node: process.version,
    vite: "locked-workspace",
    tsdown: "locked-workspace",
  },
  schemaDigest: sha256(fixtureSchemaBytes),
  directDependencies: [dependency("B1", b1Report), dependency("B9", b9Report)],
  cases: B8_HOSTS.map((hostId) => ({
    caseId: hostId,
    hostKind: hostId,
    baselineFixture: fixtureFor(hostId, "legacy"),
    codeFirstFixture: fixtureFor(hostId, "code-first"),
    coveredVariants: variants[hostId],
  })),
};
await writeFile(
  resolve(fixtureRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
