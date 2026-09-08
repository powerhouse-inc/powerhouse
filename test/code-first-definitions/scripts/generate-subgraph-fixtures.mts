import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  B7_CASES,
  runSubgraphContractCases,
  subgraphCompositionGoldens,
  subgraphEventGoldens,
} from "../src/evidence/subgraph-contract.js";
import type { GateEvidenceReport } from "../src/evidence/run-gate-evidence.js";
import { sha256 } from "../src/evidence/utils.js";

const packageRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(packageRoot, "fixtures/subgraphs/v1");
const subscriptionRoot = resolve(packageRoot, "fixtures/subscriptions/v1");

const [fixtureSchemaBytes, b6Report, b9Report] = await Promise.all([
  readFile(
    resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
  ),
  readFile(resolve(packageRoot, ".evidence/B6/report.json"), "utf8").then(
    (value) => JSON.parse(value) as GateEvidenceReport,
  ),
  readFile(resolve(packageRoot, ".evidence/B9/report.json"), "utf8").then(
    (value) => JSON.parse(value) as GateEvidenceReport,
  ),
]);

const current = runSubgraphContractCases(packageRoot);
if (current.cases.some((item) => item.firstMismatch !== null)) {
  throw new Error("Legacy and code-first subgraph probes diverged.");
}

await Promise.all([
  mkdir(fixtureRoot, { recursive: true }),
  mkdir(subscriptionRoot, { recursive: true }),
]);
await Promise.all([
  writeFile(
    resolve(fixtureRoot, "composition-goldens.json"),
    `${JSON.stringify(subgraphCompositionGoldens(current.cases), null, 2)}\n`,
  ),
  writeFile(
    resolve(fixtureRoot, "event-goldens.json"),
    `${JSON.stringify(subgraphEventGoldens(current.cases), null, 2)}\n`,
  ),
  writeFile(
    resolve(subscriptionRoot, "manifest.json"),
    `${JSON.stringify(
      {
        kind: "powerhouse.subscription-fixture-manifest",
        formatVersion: 1,
        cases: [
          {
            caseId: "typed-subscription-true",
            hasSubscriptions: true,
            expectedWebSocketAllocations: 1,
            expectedSseRouteCount: 2,
            expectedSourceAllocations: 1,
            expectedCleanupCount: 1,
          },
          {
            caseId: "compat-subscription-undefined",
            hasSubscriptions: "undefined",
            expectedWebSocketAllocations: 0,
            expectedSseRouteCount: 0,
            expectedSourceAllocations: 0,
            expectedCleanupCount: 0,
          },
          {
            caseId: "compat-subscription-false",
            hasSubscriptions: false,
            expectedWebSocketAllocations: 0,
            expectedSseRouteCount: 0,
            expectedSourceAllocations: 0,
            expectedCleanupCount: 0,
          },
        ],
      },
      null,
      2,
    )}\n`,
  ),
]);

const coveredVariants: Record<(typeof B7_CASES)[number]["caseId"], string[]> = {
  "typed-query-field": [
    "typed",
    "parent",
    "args",
    "subgraph",
    "request",
    "info",
    "resolver-owned-authorization",
  ],
  "compat-manual-query": [
    "graphql-ast-compat",
    "location-free-ast",
    "resolver-coordinates",
    "manual-authorization-order",
  ],
  "typed-subscription-true": [
    "subscription",
    "hasSubscriptions-true",
    "websocket",
    "sse",
    "allocation",
    "delivery",
    "cleanup",
  ],
  "compat-subscription-undefined": [
    "graphql-ast-compat",
    "hasSubscriptions-undefined",
    "transport-disabled",
  ],
  "compat-subscription-false": [
    "graphql-ast-compat",
    "hasSubscriptions-false",
    "transport-disabled",
  ],
  "duplicate-first-wins": [
    "duplicate-name",
    "first-wins",
    "handler-cache",
    "resolver-closure-retained",
  ],
  "composition-conflict-routes-kept": [
    "apollo-local-compose",
    "composition-error",
    "individual-routes-mounted-first",
  ],
};

const dependency = (gate: "B6" | "B9", report: GateEvidenceReport) => ({
  gate,
  contractRevision: report.contract.revision,
  fixtureManifestDigest: report.fixture.manifestDigest,
});
const manifest = {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B7",
  fixtureVersion: "subgraphs-v1",
  caseCount: B7_CASES.length,
  requiredTools: {
    graphql: "16.12.0",
    apollo: "LocalCompose@2.14.4",
    host: "GraphQLManager",
  },
  schemaDigest: sha256(fixtureSchemaBytes),
  directDependencies: [dependency("B6", b6Report), dependency("B9", b9Report)],
  cases: B7_CASES.map((fixture) => ({
    caseId: fixture.caseId,
    scenario: fixture.scenario,
    coveredVariants: coveredVariants[fixture.caseId],
  })),
};

await writeFile(
  resolve(fixtureRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
