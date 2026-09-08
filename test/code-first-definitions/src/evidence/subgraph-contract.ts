import type { SubgraphDefinitionV1 } from "@powerhousedao/shared/document-model";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson as canonical, firstDifference } from "./utils.js";

export const B7_CASES = [
  { caseId: "typed-query-field", scenario: "typed-query-field" },
  { caseId: "compat-manual-query", scenario: "compat-manual-query" },
  {
    caseId: "typed-subscription-true",
    scenario: "typed-subscription-true",
  },
  {
    caseId: "compat-subscription-undefined",
    scenario: "compat-subscription-undefined",
  },
  {
    caseId: "compat-subscription-false",
    scenario: "compat-subscription-false",
  },
  { caseId: "duplicate-first-wins", scenario: "duplicate-first-wins" },
  {
    caseId: "composition-conflict-routes-kept",
    scenario: "composition-conflict-routes-kept",
  },
] as const;

export type B7CaseId = (typeof B7_CASES)[number]["caseId"];
export type B7Scenario = (typeof B7_CASES)[number]["scenario"];

export type SubgraphContractCaseResult = {
  readonly caseId: B7CaseId;
  readonly authorAstDigest: `sha256:${string}`;
  readonly augmentedAstDigest: `sha256:${string}`;
  readonly resolverCallDigest: `sha256:${string}`;
  readonly supergraphDigest: `sha256:${string}`;
  readonly apolloDiagnostics: readonly string[];
  readonly route: string;
  readonly compositionName: string;
  readonly transportFlags: {
    readonly hasSubscriptions: readonly (boolean | "undefined")[];
    readonly webSocketAllocations: number;
    readonly sseRoutes: readonly string[];
  };
  readonly allocationCount: number;
  readonly cleanupObservations: readonly string[];
  readonly deliveryDigest: `sha256:${string}`;
  readonly replacementOutcome: string;
  readonly firstMismatch: string | null;
};

export type SubgraphContractAssertion = {
  readonly id:
    | "B7.definition-schema"
    | "B7.author-ast"
    | "B7.augmented-schema"
    | "B7.resolver-call"
    | "B7.composition"
    | "B7.route"
    | "B7.transport"
    | "B7.hot-reload";
  readonly outcome: "pass" | "fail";
  readonly failures: readonly string[];
};

export type SubgraphContractEvaluation = {
  readonly assertions: readonly SubgraphContractAssertion[];
  readonly cases: readonly SubgraphContractCaseResult[];
};

type ProbeResult = {
  readonly cases: readonly SubgraphContractCaseResult[];
  readonly definitions: readonly SubgraphDefinitionV1[];
};

type B7Manifest = {
  readonly cases: readonly {
    readonly caseId: B7CaseId;
    readonly scenario: B7Scenario;
    readonly coveredVariants: readonly string[];
  }[];
};

type GoldenRecord = Readonly<
  Record<B7CaseId, Readonly<Record<string, unknown>>>
>;

export function runSubgraphContractCases(
  packageRoot = resolve(import.meta.dirname, "../.."),
): ProbeResult {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/probe-subgraph-contract.mts"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  ) as ProbeResult;
}

function compositionProjection(result: SubgraphContractCaseResult) {
  return {
    authorAstDigest: result.authorAstDigest,
    augmentedAstDigest: result.augmentedAstDigest,
    supergraphDigest: result.supergraphDigest,
    apolloDiagnostics: result.apolloDiagnostics,
    route: result.route,
    compositionName: result.compositionName,
    replacementOutcome: result.replacementOutcome,
  };
}

function eventProjection(result: SubgraphContractCaseResult) {
  return {
    resolverCallDigest: result.resolverCallDigest,
    transportFlags: result.transportFlags,
    allocationCount: result.allocationCount,
    cleanupObservations: result.cleanupObservations,
    deliveryDigest: result.deliveryDigest,
  };
}

export function subgraphCompositionGoldens(
  cases: readonly SubgraphContractCaseResult[],
): GoldenRecord {
  return Object.fromEntries(
    cases.map((result) => [result.caseId, compositionProjection(result)]),
  ) as unknown as GoldenRecord;
}

export function subgraphEventGoldens(
  cases: readonly SubgraphContractCaseResult[],
): GoldenRecord {
  return Object.fromEntries(
    cases.map((result) => [result.caseId, eventProjection(result)]),
  ) as unknown as GoldenRecord;
}

export async function evaluateSubgraphContract(
  manifestPath: string,
  validateDefinition: (definition: unknown) => boolean,
): Promise<SubgraphContractEvaluation> {
  const fixtureRoot = dirname(manifestPath);
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as B7Manifest;
  const [compositionGoldens, eventGoldens] = await Promise.all([
    readFile(resolve(fixtureRoot, "composition-goldens.json"), "utf8").then(
      (value) => JSON.parse(value) as GoldenRecord,
    ),
    readFile(resolve(fixtureRoot, "event-goldens.json"), "utf8").then(
      (value) => JSON.parse(value) as GoldenRecord,
    ),
  ]);
  const current = runSubgraphContractCases(resolve(fixtureRoot, "../../.."));
  const firstDefinition = current.definitions[0];
  const unknownPropertyRejected =
    firstDefinition !== undefined &&
    !validateDefinition({ ...firstDefinition, unexpected: true });

  const failures = new Map<SubgraphContractAssertion["id"], string[]>();
  const add = (id: SubgraphContractAssertion["id"], message: string) => {
    const values = failures.get(id) ?? [];
    values.push(message);
    failures.set(id, values);
  };
  if (
    canonical(manifest.cases.map(({ caseId }) => caseId)) !==
    canonical(current.cases.map(({ caseId }) => caseId))
  ) {
    add(
      "B7.definition-schema",
      "the runtime probe did not execute the manifest cases in declared order",
    );
  }
  if (
    !current.definitions.every(validateDefinition) ||
    !unknownPropertyRejected
  ) {
    add(
      "B7.definition-schema",
      "one or more structured definitions escaped the closed schema",
    );
  }

  const results = current.cases.map((result) => {
    if (result.firstMismatch) {
      add("B7.resolver-call", `${result.caseId}: ${result.firstMismatch}`);
    }
    const compositionDifference = firstDifference(
      compositionGoldens[result.caseId],
      compositionProjection(result),
    );
    const eventDifference = firstDifference(
      eventGoldens[result.caseId],
      eventProjection(result),
    );
    const difference =
      compositionDifference ?? eventDifference ?? result.firstMismatch;
    if (compositionDifference) {
      for (const id of [
        "B7.author-ast",
        "B7.augmented-schema",
        "B7.composition",
        "B7.route",
        "B7.hot-reload",
      ] as const) {
        add(id, `${result.caseId}: ${compositionDifference}`);
      }
    }
    if (eventDifference) {
      add("B7.resolver-call", `${result.caseId}: ${eventDifference}`);
      add("B7.transport", `${result.caseId}: ${eventDifference}`);
    }
    return { ...result, firstMismatch: difference };
  });

  const ids: readonly SubgraphContractAssertion["id"][] = [
    "B7.definition-schema",
    "B7.author-ast",
    "B7.augmented-schema",
    "B7.resolver-call",
    "B7.composition",
    "B7.route",
    "B7.transport",
    "B7.hot-reload",
  ];
  return {
    assertions: ids.map((id) => ({
      id,
      outcome: failures.has(id) ? "fail" : "pass",
      failures: failures.get(id) ?? [],
    })),
    cases: results,
  };
}
