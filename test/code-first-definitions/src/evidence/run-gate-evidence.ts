import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ScalarDefinitionV1 } from "@powerhousedao/shared/document-model";
import {
  evaluateModelParity,
  type ModelParityEvaluation,
} from "./model-parity.js";
import {
  evaluateFailurePropagation,
  type FailurePropagationEvaluation,
} from "./failure-propagation.js";
import { evaluateModelSdl, type ModelSdlEvaluation } from "./model-sdl.js";
import {
  evaluateScalarConformance,
  type ScalarConformanceEvaluation,
  type ScalarDifference,
  type ScalarOutcomeGolden,
} from "./scalar-conformance.js";
import {
  evaluateProtocolMatrix,
  type ProtocolMatrixEvaluation,
} from "./protocol-matrix.js";
import {
  evaluateSubgraphContract,
  type SubgraphContractEvaluation,
} from "./subgraph-contract.js";
import {
  evaluateLoaderCompatibility,
  type LoaderCompatibilityEvaluation,
} from "./loader-compatibility.js";
import {
  evaluatePackedConsumers,
  type PackedConsumerEvaluation,
} from "./packed-consumers.js";
import {
  evaluateSyntheticReplay,
  type SyntheticReplayEvaluation,
} from "./synthetic-replay.js";
import {
  evaluateMigrationLifecycle,
  type MigrationLifecycleEvaluation,
} from "./migration-lifecycle.js";
import { Ajv, type AjvValidate } from "./ajv.js";
import { capCodePoints } from "document-model/tooling";
import {
  compareCodeUnits,
  filesBelow,
  normalizePath,
  sha256,
} from "./utils.js";

export const GATE_IDS = [
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "B7",
  "B8",
  "B9",
  "B10",
  "B11",
  "B12",
  "B13",
  "B14",
] as const;

export type GateId = (typeof GATE_IDS)[number];
export type EvidenceOutcome = "pass" | "fail" | "blocked" | "cancelled";

export function evidenceExitCode(outcome: EvidenceOutcome): 0 | 1 | 2 | 130 {
  switch (outcome) {
    case "pass":
      return 0;
    case "fail":
      return 1;
    case "blocked":
      return 2;
    case "cancelled":
      return 130;
  }
}

type FixtureManifest = {
  readonly kind: "powerhouse.gate-fixture-manifest";
  readonly formatVersion: 1;
  readonly gate: GateId;
  readonly fixtureVersion: string;
  readonly schemaDigest: `sha256:${string}`;
  readonly directDependencies: readonly {
    readonly gate: GateId;
    readonly contractRevision: `sha256:${string}`;
    readonly fixtureManifestDigest: `sha256:${string}`;
  }[];
  readonly cases: readonly unknown[];
};

type EvidenceDependency = {
  readonly gate: GateId;
  readonly outcome: "pass";
  readonly contractRevision: `sha256:${string}`;
  readonly fixtureManifestDigest: `sha256:${string}`;
  readonly reportDigest: `sha256:${string}`;
};

type EvidenceAssertion = {
  readonly id: string;
  readonly outcome: EvidenceOutcome;
  readonly expected: string;
  readonly received: string;
  readonly artifactRefs: readonly string[];
};

type EvidenceArtifact = {
  readonly name: string;
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
  readonly retention: "committed" | "ci-immutable" | "restricted";
};

export type GateEvidenceReport = {
  readonly kind: "powerhouse.gate-evidence";
  readonly formatVersion: 1;
  readonly gate: GateId;
  readonly contract: {
    readonly status: "spec-complete";
    readonly revision: `sha256:${string}`;
  };
  readonly evidence: {
    readonly outcome: EvidenceOutcome;
    readonly reasonCode?: `PH-${string}`;
  };
  readonly repository: {
    readonly commit: string;
    readonly baseTreeDigest: `sha256:${string}`;
    readonly baseDirty: false;
    readonly appliedPatchDigest?: `sha256:${string}`;
  };
  readonly toolchain: {
    readonly lockfileDigest: `sha256:${string}`;
    readonly runnerVersion: string;
    readonly node: string;
    readonly packageManager: string;
    readonly platform: string;
    readonly tools: Readonly<Record<string, string>>;
  };
  readonly fixture: {
    readonly manifest: string;
    readonly fixtureVersion: string;
    readonly manifestDigest: `sha256:${string}`;
    readonly schemaDigest: `sha256:${string}`;
    readonly caseCount: number;
  };
  readonly dependencies: readonly EvidenceDependency[];
  readonly command: {
    readonly name: "gate-evidence";
    readonly args: readonly string[];
    readonly cwd: "<repository>";
  };
  readonly assertions: readonly EvidenceAssertion[];
  readonly measurements: readonly unknown[];
  readonly artifacts: readonly EvidenceArtifact[];
  readonly results: Readonly<Record<string, unknown>>;
  readonly summary: {
    readonly passed: number;
    readonly failed: number;
    readonly blocked: number;
    readonly cancelled: number;
  };
};

function repositoryPath(repositoryRoot: string, path: string): string {
  const relativePath = relative(repositoryRoot, path);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Evidence inputs must stay inside the repository root.");
  }
  return normalizePath(relativePath);
}

function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function packageManagerVersion(repositoryRoot: string): string {
  try {
    return `pnpm@${execFileSync("pnpm", ["--version"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()}`;
  } catch {
    return "pnpm@unavailable";
  }
}

function resultsForGate(gate: GateId): Readonly<Record<string, unknown>> {
  return gate === "B9" ? { injections: [] } : {};
}

function summaryForAssertions(assertions: readonly EvidenceAssertion[]) {
  return {
    passed: assertions.filter(({ outcome }) => outcome === "pass").length,
    failed: assertions.filter(({ outcome }) => outcome === "fail").length,
    blocked: assertions.filter(({ outcome }) => outcome === "blocked").length,
    cancelled: assertions.filter(({ outcome }) => outcome === "cancelled")
      .length,
  };
}

async function committedArtifact(request: {
  readonly name: string;
  readonly repositoryRoot: string;
  readonly displayRoot: string;
  readonly paths: readonly string[];
  readonly mediaType: string;
}): Promise<EvidenceArtifact> {
  const files = (
    await Promise.all(request.paths.map((path) => filesBelow(path)))
  )
    .flat()
    .sort((left, right) =>
      compareCodeUnits(normalizePath(left), normalizePath(right)),
    );
  const hash = createHash("sha256");
  let bytes = 0;
  for (const path of files) {
    const content = await readFile(path);
    const relativePath = repositoryPath(request.repositoryRoot, path);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
    bytes += content.byteLength;
  }
  return {
    name: request.name,
    path: repositoryPath(request.repositoryRoot, request.displayRoot),
    mediaType: request.mediaType,
    bytes,
    digest: `sha256:${hash.digest("hex")}`,
    retention: "committed",
  };
}

const B1_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B1.schema": "all definitions validate and unknown properties are rejected",
  "B1.structured": "legacy and code-first definitions equal their golden",
  "B1.stored-state": "both modules equal the stored PH state golden",
  "B1.identity": "every stored identity matches its committed vector",
  "B1.order": "all definition and compatibility-AST arrays retain source order",
  "B1.field-options": "all seven unsupported field options are rejected",
  "B1.state-root": "all invalid roots fail and empty local state is canonical",
  "B1.repeat-import": "two cold imports produce one digest for every case",
};

function b1Assertions(
  evaluation: ModelParityEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B1_EXPECTATIONS[assertion.id] ?? "the B1 assertion passes",
    received:
      assertion.failures.length === 0
        ? "all declared cases matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B1.schema"
        ? ["fixture-manifest", "definition-schemas", "definition-goldens"]
        : assertion.id === "B1.identity"
          ? ["identity-vectors"]
          : assertion.id === "B1.structured" ||
              assertion.id === "B1.stored-state" ||
              assertion.id === "B1.order"
            ? ["definition-goldens"]
            : ["fixture-manifest"],
  }));
}

async function b1Artifacts(
  repositoryRoot: string,
  packageRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const goldenRoot = resolve(packageRoot, "fixtures/definitions/v1/goldens");
  const goldenNames = await readdir(goldenRoot);
  const definitionGoldens = goldenNames
    .filter(
      (name) =>
        name.endsWith(".definition.json") || name.endsWith(".state.json"),
    )
    .map((name) => resolve(goldenRoot, name));
  const identityVectors = goldenNames
    .filter((name) => name.endsWith(".identity.json"))
    .map((name) => resolve(goldenRoot, name));
  return Promise.all([
    committedArtifact({
      name: "fixture-manifest",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "definition-schemas",
      repositoryRoot,
      displayRoot: resolve(
        packageRoot,
        "schemas/document-model-definition-v1.schema.json",
      ),
      paths: [
        resolve(
          packageRoot,
          "schemas/document-model-definition-v1.schema.json",
        ),
      ],
      mediaType: "application/schema+json",
    }),
    committedArtifact({
      name: "definition-goldens",
      repositoryRoot,
      displayRoot: goldenRoot,
      paths: definitionGoldens,
      mediaType: "application/vnd.powerhouse.definition-goldens+json",
    }),
    committedArtifact({
      name: "identity-vectors",
      repositoryRoot,
      displayRoot: goldenRoot,
      paths: identityVectors,
      mediaType: "application/vnd.powerhouse.identity-vectors+json",
    }),
  ]);
}

const B3_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B3.validation":
    "creator, reducer, no-input, extra-key, and duplicate-action behavior matches",
  "B3.scope":
    "creator, incoming wrong-scope, and open unknown-scope routing matches",
  "B3.state": "every legacy and code-first row reaches the committed state",
  "B3.hash": "every scope hash delta matches the committed row",
  "B3.error":
    "validation, domain, denial, stored-code, and reducer error outcomes match",
  "B3.dispatch": "every emitted signal sequence matches",
  "B3.version": "stored versions normalize and select the same module",
  "B3.upgrade": "every declared family upgrade edge reaches the same state",
};

function b3Assertions(
  evaluation: ProtocolMatrixEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B3_EXPECTATIONS[assertion.id] ?? "the B3 assertion passes",
    received:
      assertion.failures.length === 0
        ? "all declared protocol rows matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs: ["protocol-matrix"],
  }));
}

async function b3Artifacts(
  repositoryRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  return [
    await committedArtifact({
      name: "protocol-matrix",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/vnd.powerhouse.protocol-matrix+json",
    }),
  ];
}

const B2_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B2.state":
    "legacy, code-first, and committed synthetic state match at every prefix",
  "B2.initial":
    "the initial state remains identical and immutable at every prefix",
  "B2.scope-hash": "all shared-runtime scope hashes match at every prefix",
  "B2.error":
    "reducer errors are recomputed identically from cleared archive errors",
  "B2.denial": "denied operations retain position without changing state",
  "B2.index": "operation indices match at every prefix",
  "B2.skip": "recorded skip values match at every prefix",
  "B2.revision": "scope revisions match at every prefix",
  "B2.dispatches": "replayed signal sequences match at every prefix",
};

function b2Assertions(
  evaluation: SyntheticReplayEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B2_EXPECTATIONS[assertion.id] ?? "the B2 assertion passes",
    received:
      assertion.failures.length === 0
        ? `all ${evaluation.prefixCount} synthetic prefixes matched`
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B2.initial"
        ? ["synthetic-histories"]
        : ["synthetic-histories", "synthetic-prefixes"],
  }));
}

async function b2Artifacts(
  repositoryRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = dirname(manifestPath);
  return Promise.all([
    committedArtifact({
      name: "synthetic-histories",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "histories.json"),
      paths: [resolve(fixtureRoot, "histories.json")],
      mediaType: "application/vnd.powerhouse.synthetic-histories+json",
    }),
    committedArtifact({
      name: "synthetic-prefixes",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "synthetic-prefixes.json"),
      paths: [resolve(fixtureRoot, "synthetic-prefixes.json")],
      mediaType: "application/vnd.powerhouse.synthetic-prefixes+json",
    }),
    committedArtifact({
      name: "scope-declaration",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "scope-declaration.json"),
      paths: [resolve(fixtureRoot, "scope-declaration.json")],
      mediaType: "application/vnd.powerhouse.evidence-scope+json",
    }),
  ]);
}

const B10_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B10.report":
    "report-only is complete, deterministic, and performs zero writes",
  "B10.beside-write":
    "apply writes only the verification candidate beside untouched legacy source",
  "B10.verify":
    "definitions, stored specifications, creators, initial states, and every replay prefix are equivalent",
  "B10.artifact":
    "the importable two-version candidate matches its hash-bound artifact digest",
  "B10.canary": "the read-only fixture canary passes with zero mutations",
  "B10.deploy":
    "every current host lifecycle passes under a drained zero-cross-revision deployment",
  "B10.rollback":
    "three fresh processes prove candidate parity and exact legacy rollback",
  "B10.retire":
    "only the approved target set is retired after all evidence is revalidated",
  "B10.negative":
    "all nine unsafe retirement variants fail with their exact diagnostic and preserve the attempted tree",
};

function b10Assertions(
  evaluation: MigrationLifecycleEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B10_EXPECTATIONS[assertion.id] ?? "the B10 assertion passes",
    received:
      assertion.failures.length === 0
        ? "the deterministic fixture-family lifecycle matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B10.report"
        ? ["migration-report", "phase-journal"]
        : assertion.id === "B10.beside-write" || assertion.id === "B10.artifact"
          ? ["source-tree-manifest", "output-tree-manifest"]
          : assertion.id === "B10.canary"
            ? ["canary-summary"]
            : assertion.id === "B10.retire" || assertion.id === "B10.negative"
              ? ["retirement-report"]
              : ["phase-journal", "migration-report"],
  }));
}

async function b10Artifacts(
  repositoryRoot: string,
  packageRoot: string,
): Promise<readonly EvidenceArtifact[]> {
  const migrationRoot = resolve(packageRoot, "fixtures/migrations/v1");
  const retirementRoot = resolve(packageRoot, "fixtures/retirement/v1");
  const descriptions = [
    ["migration-report", resolve(migrationRoot, "migration-report.json")],
    ["phase-journal", resolve(migrationRoot, "phase-journal.json")],
    ["canary-summary", resolve(migrationRoot, "canary-summary.json")],
    [
      "source-tree-manifest",
      resolve(migrationRoot, "source-tree-manifest.json"),
    ],
    [
      "output-tree-manifest",
      resolve(migrationRoot, "output-tree-manifest.json"),
    ],
    ["retirement-report", resolve(retirementRoot, "retirement-report.json")],
  ] as const;
  return Promise.all(
    descriptions.map(([name, path]) =>
      committedArtifact({
        name,
        repositoryRoot,
        displayRoot: path,
        paths: [path],
        mediaType: "application/json",
      }),
    ),
  );
}

function requiredMigrationDigest(
  value: `sha256:${string}` | null,
  label: string,
): `sha256:${string}` {
  if (value === null) throw new Error(`B10 ${label} digest is missing.`);
  return value;
}

const B9_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B9.exit": "every command returns its declared 0, 1, or 2 exit status",
  "B9.report": "checks emit the declared closed JSON report status",
  "B9.warning-policy":
    "warnings pass by default and fail under --warnings-as-errors",
  "B9.build-order":
    "typecheck and definition checks finish before the first bundle write",
  "B9.prepack": "prepack requires a retained passing release report",
  "B9.publish":
    "publish preflight requires retained evidence before registry access",
  "B9.registry-zero": "failed preflight performs zero registry requests",
  "B9.output-unchanged": "failed pre-write phases preserve bundle output",
  "B9.source-selection":
    "all lifecycle commands select the same normalized source set",
};

function b9Assertions(
  evaluation: FailurePropagationEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B9_EXPECTATIONS[assertion.id] ?? "the B9 assertion passes",
    received:
      assertion.failures.length === 0
        ? "all declared injections matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B9.registry-zero" || assertion.id === "B9.publish"
        ? ["failure-manifest", "recording-registry-journal"]
        : assertion.id === "B9.output-unchanged" ||
            assertion.id === "B9.build-order"
          ? ["failure-manifest", "output-tree-manifests"]
          : ["failure-manifest"],
  }));
}

async function b9Artifacts(
  repositoryRoot: string,
  packageRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = resolve(
    packageRoot,
    "fixtures/reproductions/v1/failure-propagation",
  );
  return Promise.all([
    committedArtifact({
      name: "failure-manifest",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "recording-registry-journal",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "recording-registry-journal.json"),
      paths: [resolve(fixtureRoot, "recording-registry-journal.json")],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "output-tree-manifests",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "prior-output-manifest.json"),
      paths: [resolve(fixtureRoot, "prior-output-manifest.json")],
      mediaType: "application/vnd.powerhouse.byte-manifest+json",
    }),
  ]);
}

const B6_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B6.parse":
    "every structured projection parses with the locked GraphQL parser",
  "B6.ast": "every location-free parsed AST equals its committed golden",
  "B6.print": "every canonical SDL byte sequence equals its committed golden",
  "B6.scalar": "every projection matches the committed scalar inventory digest",
  "B6.no-regex": "structured projection makes zero legacy regex adapter calls",
};

function b6Assertions(
  evaluation: ModelSdlEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B6_EXPECTATIONS[assertion.id] ?? "the B6 assertion passes",
    received:
      assertion.failures.length === 0
        ? "all declared cases matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B6.ast"
        ? ["model-sdl-manifest", "ast-goldens"]
        : assertion.id === "B6.print" || assertion.id === "B6.parse"
          ? ["model-sdl-manifest", "sdl-goldens"]
          : assertion.id === "B6.scalar"
            ? ["scalar-inventory-digest"]
            : ["model-sdl-manifest"],
  }));
}

async function b6Artifacts(
  repositoryRoot: string,
  packageRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = resolve(packageRoot, "fixtures/model-sdl/v1");
  return Promise.all([
    committedArtifact({
      name: "model-sdl-manifest",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "sdl-goldens",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "sdl"),
      paths: [resolve(fixtureRoot, "sdl")],
      mediaType: "application/graphql",
    }),
    committedArtifact({
      name: "ast-goldens",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "ast"),
      paths: [resolve(fixtureRoot, "ast")],
      mediaType: "application/vnd.powerhouse.graphql-ast+json",
    }),
    committedArtifact({
      name: "scalar-inventory-digest",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "scalar-inventory-digest.json"),
      paths: [resolve(fixtureRoot, "scalar-inventory-digest.json")],
      mediaType: "application/json",
    }),
  ]);
}

const B7_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B7.definition-schema":
    "typed and compatibility definitions match the closed V1 schema",
  "B7.author-ast": "legacy and code-first author AST order and bytes match",
  "B7.augmented-schema": "the current host produces the same augmented schema",
  "B7.resolver-call":
    "parent, args, subgraph, request, info, and outcomes match",
  "B7.composition":
    "the installed Apollo LocalCompose result and diagnostics match",
  "B7.route": "registration publishes the same route and composition name",
  "B7.transport":
    "transport flags, allocation, delivery, and cleanup behavior match",
  "B7.hot-reload":
    "duplicate registration and composition-failure outcomes remain current-host identical",
};

function b7Assertions(
  evaluation: SubgraphContractEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B7_EXPECTATIONS[assertion.id] ?? "the B7 assertion passes",
    received:
      assertion.failures.length === 0
        ? "all declared subgraph cases matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B7.transport" || assertion.id === "B7.resolver-call"
        ? ["subscription-manifest", "event-goldens"]
        : ["subgraph-manifest", "composition-goldens"],
  }));
}

async function b7Artifacts(
  repositoryRoot: string,
  packageRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = resolve(packageRoot, "fixtures/subgraphs/v1");
  const subscriptionManifest = resolve(
    packageRoot,
    "fixtures/subscriptions/v1/manifest.json",
  );
  return Promise.all([
    committedArtifact({
      name: "subgraph-manifest",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "subscription-manifest",
      repositoryRoot,
      displayRoot: subscriptionManifest,
      paths: [subscriptionManifest],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "composition-goldens",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "composition-goldens.json"),
      paths: [resolve(fixtureRoot, "composition-goldens.json")],
      mediaType: "application/vnd.powerhouse.composition-goldens+json",
    }),
    committedArtifact({
      name: "event-goldens",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "event-goldens.json"),
      paths: [resolve(fixtureRoot, "event-goldens.json")],
      mediaType: "application/vnd.powerhouse.event-goldens+json",
    }),
  ]);
}

async function evaluateB7(
  manifestPath: string,
  packageRoot: string,
): Promise<SubgraphContractEvaluation> {
  const schema = JSON.parse(
    await readFile(
      resolve(packageRoot, "schemas/subgraph-definition-v1.schema.json"),
      "utf8",
    ),
  ) as object;
  const validator = new Ajv({ allErrors: true, strict: false }).compile(schema);
  return evaluateSubgraphContract(manifestPath, validator);
}

const B8_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B8.definition-source":
    "Vite and build adapters normalize the explicit source set identically",
  "B8.node-server":
    "the Node import loader preserves direct model and flattened subgraph exports",
  "B8.http-cdn":
    "the HTTP loader preserves one-level callable subgraph flattening",
  "B8.vite-local":
    "the Vite loader preserves outer/inner export-name selection",
  "B8.browser-static":
    "the static browser package manager preserves latest-version selection",
  "B8.browser-worker":
    "the browser worker loader preserves named-export discovery and latest-version selection",
  "B8.graphql":
    "the GraphQL package manager preserves model, manifest, and subgraph registration",
  "B8.mcp": "the MCP Vite loader preserves direct model export discovery",
  "B8.connect":
    "the Connect package manager preserves DocumentModelLib registration and selects the first matching family version",
  "B8.reactor-worker":
    "the reactor worker manifest preserves exact named export references",
  "B8.registry":
    "the document-model registry preserves global-id/version duplicate detection",
};

function b8Assertions(
  evaluation: LoaderCompatibilityEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B8_EXPECTATIONS[assertion.id] ?? "the B8 assertion passes",
    received:
      assertion.failures.length === 0
        ? "the current host matched its committed legacy fixture"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B8.definition-source"
        ? ["package-manifest", "definition-source-results"]
        : ["package-manifest", "host-namespaces"],
  }));
}

async function b8Artifacts(
  repositoryRoot: string,
  packageRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = resolve(packageRoot, "fixtures/packages/v1");
  return Promise.all([
    committedArtifact({
      name: "package-manifest",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "definition-source-results",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "definition-source-results.json"),
      paths: [resolve(fixtureRoot, "definition-source-results.json")],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "host-namespaces",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "host-namespaces.json"),
      paths: [resolve(fixtureRoot, "host-namespaces.json")],
      mediaType: "application/vnd.powerhouse.host-namespaces+json",
    }),
  ]);
}

const B5_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B5.pack":
    "the rebuilt tarball and every packed file match the committed artifact",
  "B5.node-types":
    "the isolated Node consumer typechecks both public declaration entries",
  "B5.browser-types":
    "the isolated browser-worker consumer typechecks both public declaration entries",
  "B5.node-import":
    "Node imports every public entry with B1-equivalent models, actions, specifications, and SDL",
  "B5.worker-import":
    "a browser-condition worker imports every public entry and completes its handshake",
  "B5.portability":
    "both offline installs use only packed files with no workspace link or escaped resolution",
};

function b5Assertions(
  evaluation: PackedConsumerEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B5_EXPECTATIONS[assertion.id] ?? "the B5 assertion passes",
    received:
      assertion.failures.length === 0
        ? "both fresh packed consumers matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B5.pack"
        ? ["packed-tarball", "packed-file-manifest"]
        : assertion.id === "B5.portability"
          ? ["packed-tarball", "dependency-tree", "resolver-trace"]
          : ["packed-tarball", "resolver-trace"],
  }));
}

async function b5Artifacts(
  repositoryRoot: string,
  packageRoot: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = resolve(packageRoot, "fixtures/packed-consumers");
  return Promise.all([
    committedArtifact({
      name: "packed-tarball",
      repositoryRoot,
      displayRoot: resolve(
        fixtureRoot,
        "artifacts/code-first-packed-fixture-0.0.0.tgz",
      ),
      paths: [
        resolve(fixtureRoot, "artifacts/code-first-packed-fixture-0.0.0.tgz"),
      ],
      mediaType: "application/gzip",
    }),
    committedArtifact({
      name: "packed-file-manifest",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "packed-file-manifest.json"),
      paths: [resolve(fixtureRoot, "packed-file-manifest.json")],
      mediaType: "application/vnd.powerhouse.byte-manifest+json",
    }),
    committedArtifact({
      name: "dependency-tree",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "dependency-tree.json"),
      paths: [resolve(fixtureRoot, "dependency-tree.json")],
      mediaType: "application/vnd.powerhouse.dependency-tree+json",
    }),
    committedArtifact({
      name: "resolver-trace",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "resolver-trace.json"),
      paths: [resolve(fixtureRoot, "resolver-trace.json")],
      mediaType: "application/vnd.powerhouse.resolver-trace+json",
    }),
  ]);
}

const B14_EXPECTATIONS: Readonly<Record<string, string>> = {
  "B14.schema": "all 21 scalar definitions match the closed V1 schema",
  "B14.inventory": "catalog and host names reproduce the B6 inventory digest",
  "B14.validation": "catalog validators match document-engineering 1.40.5",
  "B14.coercion": "installed coercion outcomes match the committed vectors",
  "B14.exemptions": "every compatibility difference is exact and exempted",
  "B14.graphql-profile":
    "current authored and host-owned resolver behavior is preserved",
  "B14.fresh-process":
    "Node and browser-condition metadata digests are identical",
};

function b14Assertions(
  evaluation: ScalarConformanceEvaluation,
): readonly EvidenceAssertion[] {
  return evaluation.assertions.map((assertion) => ({
    id: assertion.id,
    outcome: assertion.outcome,
    expected: B14_EXPECTATIONS[assertion.id] ?? "the B14 assertion passes",
    received:
      assertion.failures.length === 0
        ? "all declared scalar cases matched"
        : capCodePoints(assertion.failures.join("; ")),
    artifactRefs:
      assertion.id === "B14.schema" || assertion.id === "B14.inventory"
        ? ["scalar-manifest", "scalar-definitions"]
        : assertion.id === "B14.exemptions"
          ? ["difference-list"]
          : ["current-coercion-goldens"],
  }));
}

async function b14Artifacts(
  repositoryRoot: string,
  packageRoot: string,
  manifestPath: string,
): Promise<readonly EvidenceArtifact[]> {
  const fixtureRoot = resolve(packageRoot, "fixtures/scalars/v1");
  return Promise.all([
    committedArtifact({
      name: "scalar-manifest",
      repositoryRoot,
      displayRoot: manifestPath,
      paths: [manifestPath],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "scalar-definitions",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "definitions.json"),
      paths: [resolve(fixtureRoot, "definitions.json")],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "current-coercion-goldens",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "current-coercion-goldens.json"),
      paths: [resolve(fixtureRoot, "current-coercion-goldens.json")],
      mediaType: "application/json",
    }),
    committedArtifact({
      name: "difference-list",
      repositoryRoot,
      displayRoot: resolve(fixtureRoot, "difference-list.json"),
      paths: [resolve(fixtureRoot, "difference-list.json")],
      mediaType: "application/json",
    }),
  ]);
}

function scalarMetadataProbe(
  packageRoot: string,
  browser: boolean,
): `sha256:${string}` {
  return execFileSync(
    process.execPath,
    [
      "--conditions=source",
      ...(browser ? ["--conditions=browser"] : []),
      "--import",
      "tsx",
      "scripts/probe-scalar-metadata.mts",
    ],
    { cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim() as `sha256:${string}`;
}

async function evaluateB14(
  manifestPath: string,
  packageRoot: string,
): Promise<ScalarConformanceEvaluation> {
  const fixtureRoot = dirname(manifestPath);
  const [definitions, goldens, differenceList, definitionSchema, inventory] =
    await Promise.all([
      readFile(resolve(fixtureRoot, "definitions.json"), "utf8").then(
        (value) => JSON.parse(value) as ScalarDefinitionV1[],
      ),
      readFile(
        resolve(fixtureRoot, "current-coercion-goldens.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as ScalarOutcomeGolden[]),
      readFile(resolve(fixtureRoot, "difference-list.json"), "utf8").then(
        (value) =>
          JSON.parse(value) as { readonly differences: ScalarDifference[] },
      ),
      readFile(
        resolve(packageRoot, "schemas/scalar-definition-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(
        resolve(fixtureRoot, "scalar-inventory-digest.json"),
        "utf8",
      ).then(
        (value) =>
          JSON.parse(value) as {
            readonly names: readonly string[];
            readonly digest: `sha256:${string}`;
          },
      ),
    ]);
  const definitionValidator = new Ajv({
    allErrors: true,
    strict: false,
  }).compile(definitionSchema);
  return evaluateScalarConformance({
    expectedGoldens: goldens,
    expectedDefinitions: definitions,
    expectedDifferences: differenceList.differences,
    freshProcessDigests: [
      scalarMetadataProbe(packageRoot, false),
      scalarMetadataProbe(packageRoot, true),
    ],
    definitionSchemaValid: definitions.every((definition) =>
      definitionValidator(definition),
    ),
    unknownPropertyRejected: !definitionValidator({
      ...definitions[0],
      unexpected: true,
    }),
    expectedInventory: inventory,
  });
}

function validate(schema: object, value: unknown, label: string): void {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const check = ajv.compile(schema);
  if (check(value)) return;
  const errors = (check.errors ?? [])
    .map(
      (error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`,
    )
    .join("; ");
  throw new Error(`${label} does not match its V1 schema: ${errors}`);
}

async function validateDependencyReports(request: {
  readonly repositoryRoot: string;
  readonly expected: FixtureManifest["directDependencies"];
  readonly paths: readonly string[];
  readonly reportSchema: object;
  readonly commit: string;
  readonly lockfileDigest: `sha256:${string}`;
}): Promise<{
  readonly dependencies: readonly EvidenceDependency[];
  readonly reasonCode?: `PH-${string}`;
}> {
  const supplied = new Map<
    GateId,
    { bytes: Buffer; report: GateEvidenceReport }
  >();
  for (const unresolvedPath of request.paths) {
    const path = resolve(unresolvedPath);
    repositoryPath(request.repositoryRoot, path);
    const bytes = await readFile(path);
    let report: GateEvidenceReport;
    try {
      report = JSON.parse(bytes.toString("utf8")) as GateEvidenceReport;
      validate(request.reportSchema, report, `Dependency report ${path}`);
    } catch {
      return {
        dependencies: [],
        reasonCode: "PH-EVIDENCE-DEPENDENCY-INVALID",
      };
    }
    supplied.set(report.gate, { bytes, report });
  }

  const dependencies: EvidenceDependency[] = [];
  for (const expected of request.expected) {
    const candidate = supplied.get(expected.gate);
    if (!candidate) {
      return {
        dependencies,
        reasonCode: "PH-EVIDENCE-DEPENDENCY-MISSING",
      };
    }
    const { report, bytes } = candidate;
    if (
      report.evidence.outcome !== "pass" ||
      report.contract.revision !== expected.contractRevision ||
      report.fixture.manifestDigest !== expected.fixtureManifestDigest ||
      report.repository.commit !== request.commit ||
      report.toolchain.lockfileDigest !== request.lockfileDigest
    ) {
      return {
        dependencies,
        reasonCode: "PH-EVIDENCE-DEPENDENCY-MISMATCH",
      };
    }
    dependencies.push({
      gate: expected.gate,
      outcome: "pass",
      contractRevision: expected.contractRevision,
      fixtureManifestDigest: expected.fixtureManifestDigest,
      reportDigest: sha256(bytes),
    });
  }
  return { dependencies };
}

export async function runGateEvidence(request: {
  readonly gate: GateId;
  readonly repositoryRoot: string;
  readonly fixtureManifest: string;
  readonly commandArgs: readonly string[];
  readonly dependencyReports?: readonly string[];
  readonly signal?: AbortSignal;
}): Promise<GateEvidenceReport> {
  const repositoryRoot = resolve(request.repositoryRoot);
  const manifestPath = resolve(request.fixtureManifest);
  const packageRoot = resolve(repositoryRoot, "test/code-first-definitions");
  const fixtureSchemaPath = resolve(
    packageRoot,
    "schemas/gate-fixture-manifest-v1.schema.json",
  );
  const reportSchemaPath = resolve(
    packageRoot,
    "schemas/gate-evidence-report-v1.schema.json",
  );
  const contractPath = resolve(
    repositoryRoot,
    "cf-spec/08-implementation-plan.md",
  );
  const lockfilePath = resolve(repositoryRoot, "pnpm-lock.yaml");

  const [
    manifestBytes,
    fixtureSchemaBytes,
    reportSchemaBytes,
    contractBytes,
    lockfileBytes,
  ] = await Promise.all([
    readFile(manifestPath),
    readFile(fixtureSchemaPath),
    readFile(reportSchemaPath),
    readFile(contractPath),
    readFile(lockfilePath),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  const fixtureSchema = JSON.parse(
    fixtureSchemaBytes.toString("utf8"),
  ) as object;
  const reportSchema = JSON.parse(reportSchemaBytes.toString("utf8")) as object;
  validate(fixtureSchema, manifest, "Fixture manifest");
  const typedManifest = manifest as FixtureManifest;
  if (typedManifest.gate !== request.gate) {
    throw new Error(
      `Fixture gate ${typedManifest.gate} does not match requested gate ${request.gate}.`,
    );
  }
  const fixtureSchemaDigest = sha256(fixtureSchemaBytes);
  if (typedManifest.schemaDigest !== fixtureSchemaDigest) {
    throw new Error(
      "Fixture manifest schemaDigest does not match the selected schema.",
    );
  }

  const status = git(repositoryRoot, ["status", "--porcelain=v1"]);
  const commit = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const lockfileDigest = sha256(lockfileBytes);
  let outcome: EvidenceOutcome = "blocked";
  let reasonCode: `PH-${string}` | undefined =
    "PH-EVIDENCE-GATE-NOT-IMPLEMENTED";
  let assertions: readonly EvidenceAssertion[] = [
    {
      id: `${request.gate}.implementation`,
      outcome: "blocked",
      expected: "a registered deterministic gate implementation",
      received:
        "the gate runner is scaffolded but this implementation is not registered",
      artifactRefs: [],
    },
  ];
  let artifacts: readonly EvidenceArtifact[] = [];
  let results = resultsForGate(request.gate);

  if (request.gate === "B1") {
    const evaluation = await evaluateModelParity(manifestPath);
    assertions = b1Assertions(evaluation);
    artifacts = await b1Artifacts(repositoryRoot, packageRoot, manifestPath);
    results = { cases: evaluation.cases };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B1-DIVERGENCE" : undefined;
  }

  if (request.gate === "B2") {
    const evaluation = await evaluateSyntheticReplay(manifestPath);
    assertions = b2Assertions(evaluation);
    artifacts = await b2Artifacts(repositoryRoot, manifestPath);
    results = {
      profile: "synthetic-only-v1",
      corpusDigest: evaluation.corpusDigest,
      familyDigests: evaluation.familyDigests,
      strata: evaluation.strata,
      operationCount: evaluation.operationCount,
      prefixCount: evaluation.prefixCount,
      assertionCounts: evaluation.assertionCounts,
      hashAlgorithmVersion: evaluation.hashAlgorithmVersion,
      productionCorpusStatus: evaluation.productionCorpusStatus,
      divergences: evaluation.divergences,
    };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B2-DIVERGENCE" : undefined;
  }

  if (request.gate === "B3") {
    const evaluation = await evaluateProtocolMatrix(manifestPath);
    assertions = b3Assertions(evaluation);
    artifacts = await b3Artifacts(repositoryRoot, manifestPath);
    results = {
      matrixDigest: evaluation.matrixDigest,
      rows: evaluation.rows,
    };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B3-DIVERGENCE" : undefined;
  }

  if (request.gate === "B6") {
    const evaluation = await evaluateModelSdl(manifestPath);
    assertions = b6Assertions(evaluation);
    artifacts = await b6Artifacts(repositoryRoot, packageRoot, manifestPath);
    results = { cases: evaluation.cases };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B6-DIVERGENCE" : undefined;
  }

  if (request.gate === "B7") {
    const evaluation = await evaluateB7(manifestPath, packageRoot);
    assertions = b7Assertions(evaluation);
    artifacts = await b7Artifacts(repositoryRoot, packageRoot, manifestPath);
    results = { cases: evaluation.cases };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B7-DIVERGENCE" : undefined;
  }

  if (request.gate === "B8") {
    const evaluation = await evaluateLoaderCompatibility(manifestPath);
    assertions = b8Assertions(evaluation);
    artifacts = await b8Artifacts(repositoryRoot, packageRoot, manifestPath);
    results = { hosts: evaluation.hosts };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B8-DIVERGENCE" : undefined;
  }

  if (request.gate === "B5") {
    const evaluation = await evaluatePackedConsumers(manifestPath);
    assertions = b5Assertions(evaluation);
    artifacts = await b5Artifacts(repositoryRoot, packageRoot);
    results = { consumers: evaluation.consumers };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B5-DIVERGENCE" : undefined;
  }

  if (request.gate === "B9") {
    const evaluation = await evaluateFailurePropagation(manifestPath);
    assertions = b9Assertions(evaluation);
    artifacts = await b9Artifacts(repositoryRoot, packageRoot, manifestPath);
    results = { injections: evaluation.injections };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B9-DIVERGENCE" : undefined;
  }

  if (request.gate === "B10") {
    const evaluation = await evaluateMigrationLifecycle({
      manifestPath,
      packageRoot,
      repositoryRoot,
    });
    assertions = b10Assertions(evaluation);
    artifacts = await b10Artifacts(repositoryRoot, packageRoot);
    const observation = evaluation.observation;
    results = {
      profile: "fixture-family-only-v1",
      phaseJournal: observation.phaseJournal.phases,
      artifactDigest: observation.artifactValidation.actualDigest,
      familyDigest: observation.equivalenceReport.family.digest,
      sourceTreeDigest: requiredMigrationDigest(
        observation.migrationReport.sourceTreeDigest,
        "source-tree",
      ),
      outputTreeDigest: requiredMigrationDigest(
        observation.migrationReport.outputTreeDigest,
        "output-tree",
      ),
      sourceTreeManifestDigest: observation.sourceTreeManifestDigest,
      outputTreeManifestDigest: observation.outputTreeManifestDigest,
      verificationReports: [
        {
          kind: observation.equivalenceReport.kind,
          status: observation.equivalenceReport.status,
          reportDigest: observation.equivalenceReport.digest,
          prefixCount: observation.equivalenceReport.histories.length,
          checkCount: observation.equivalenceReport.checks.length,
        },
      ],
      canaryCounts: {
        histories: observation.canarySummary.historyCount,
        prefixes: observation.canarySummary.prefixCount,
        checks: observation.canarySummary.checkCount,
        mutations: observation.canarySummary.mutationCount,
      },
      mixedRevisionOutcomes: observation.mixedRevision,
      deploymentOutcomes: observation.deploymentOutcomes,
      rollbackResult: observation.rollback,
      retirementDecision: observation.retirementDecision,
      recoverableLegacyRoot: observation.recoverableLegacyRoot,
      negativeOutcomes: observation.retirementReport.negativeCases,
      reportOnly: observation.reportOnly,
    };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B10-DIVERGENCE" : undefined;
  }

  if (request.gate === "B14") {
    const evaluation = await evaluateB14(manifestPath, packageRoot);
    assertions = b14Assertions(evaluation);
    artifacts = await b14Artifacts(repositoryRoot, packageRoot, manifestPath);
    results = { cases: evaluation.cases };
    outcome = assertions.some((assertion) => assertion.outcome === "fail")
      ? "fail"
      : "pass";
    reasonCode = outcome === "fail" ? "PH-EVIDENCE-B14-DIVERGENCE" : undefined;
  }

  const dependencyValidation = await validateDependencyReports({
    repositoryRoot,
    expected: typedManifest.directDependencies,
    paths: request.dependencyReports ?? [],
    reportSchema,
    commit,
    lockfileDigest,
  });
  if (outcome === "pass" && dependencyValidation.reasonCode) {
    outcome = "blocked";
    reasonCode = dependencyValidation.reasonCode;
  }

  if (request.signal?.aborted) {
    outcome = "cancelled";
    reasonCode = "PH-EVIDENCE-CANCELLED";
    assertions = assertions.map((assertion) => ({
      ...assertion,
      outcome: "cancelled",
      received: "the run was cancelled",
    }));
  }

  const report: GateEvidenceReport = {
    kind: "powerhouse.gate-evidence",
    formatVersion: 1,
    gate: request.gate,
    contract: {
      status: "spec-complete",
      revision: sha256(contractBytes),
    },
    evidence: { outcome, ...(reasonCode ? { reasonCode } : {}) },
    repository: {
      commit,
      baseTreeDigest: sha256(git(repositoryRoot, ["rev-parse", "HEAD^{tree}"])),
      baseDirty: false,
      ...(status === "" ? {} : { appliedPatchDigest: sha256(status) }),
    },
    toolchain: {
      lockfileDigest,
      runnerVersion: "0.1.0",
      node: process.version,
      packageManager: packageManagerVersion(repositoryRoot),
      platform: process.platform,
      tools: {},
    },
    fixture: {
      manifest: repositoryPath(repositoryRoot, manifestPath),
      fixtureVersion: typedManifest.fixtureVersion,
      manifestDigest: sha256(manifestBytes),
      schemaDigest: fixtureSchemaDigest,
      caseCount: typedManifest.cases.length,
    },
    dependencies: dependencyValidation.dependencies,
    command: {
      name: "gate-evidence",
      args: [...request.commandArgs],
      cwd: "<repository>",
    },
    assertions,
    measurements: [],
    artifacts,
    results,
    summary: summaryForAssertions(assertions),
  };
  validate(reportSchema, report, "Gate evidence report");
  return report;
}

export function cancelledReport(
  report: GateEvidenceReport,
): GateEvidenceReport {
  const assertions = report.assertions.map((assertion) => ({
    ...assertion,
    outcome: "cancelled" as const,
    received: "the run was cancelled before artifact publication completed",
  }));
  const cancelled: GateEvidenceReport = {
    ...report,
    evidence: {
      outcome: "cancelled",
      reasonCode: "PH-EVIDENCE-CANCELLED",
    },
    assertions,
    summary: summaryForAssertions(assertions),
  };
  return cancelled;
}
