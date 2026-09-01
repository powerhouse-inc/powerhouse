import type { BenchmarkEntry } from "../../bench/records/benchmark-schema.js";
import type { TaskEntry } from "../../bench/records/task-schema.js";

/**
 * A full concurrency entry shaped the way a real run would record it. The
 * harness that produces these does not exist yet, so this fixture is the only
 * exercise the payload gets: keep it realistic.
 */
export function concurrencyEntry(
  overrides: Partial<BenchmarkEntry> = {},
): Record<string, unknown> {
  return {
    id: "B-001",
    kind: "concurrency",
    tier: "meso",
    title: "Group-lock contention under N concurrent writers",
    question:
      "Does authGroups serialise writes to documents that name the same group?",
    command: "pnpm --filter @powerhousedao/reactor bench:concurrency",
    recordedAt: "2026-09-01T12:00:00.000Z",
    environment: {
      host: "mac-studio-m2",
      os: "darwin 24.6.0",
      cpu: "Apple M2 Max",
      cores: 12,
      node: "v22.14.0",
      reactorSha: "c9d01b3",
      storage: "postgres",
      postgres: "17.2",
    },
    conclusions: [
      "Documents sharing one group serialise on the per-document advisory lock",
      "Retry counts grow superlinearly with writer count in the shared arm",
    ],
    caveats: ["Single host; no network between writer and postgres"],
    results: {
      workload: {
        documents: 64,
        operationsPerDocument: 20,
        batchSize: 5,
        grantsInPolicy: 10,
        groupPrincipals: 4,
      },
      protocol: {
        repetitions: 3,
        interleaved: true,
        retryCeiling: 20,
        lockInstrument: "pg_locks_sampler",
        instrument: "pg_stat_statements",
      },
      cells: [
        {
          arm: "SHARED_GROUP",
          writers: 8,
          ladderLevel: "L3_AUTH_GROUPS",
          groupsInPolicy: 1,
          documentsPerGroup: 64,
          runs: [
            {
              wallMs: 8421.5,
              throughputOpsPerSec: 152.1,
              p99LatencyMs: 310.4,
              appendConditionRetries: 1184,
              maxRetriesOnOneOperation: 17,
              retryExhaustions: 0,
              advisoryLockWaitMsTotal: 4102.9,
              errors: 0,
            },
          ],
        },
        {
          arm: "DISJOINT_GROUPS",
          writers: 8,
          ladderLevel: "L3_AUTH_GROUPS",
          groupsInPolicy: 8,
          documentsPerGroup: 8,
          runs: [
            {
              wallMs: 2190.2,
              throughputOpsPerSec: 584.4,
              p99LatencyMs: 44.1,
              appendConditionRetries: 12,
              maxRetriesOnOneOperation: 2,
              retryExhaustions: 0,
              advisoryLockWaitMsTotal: 61.3,
              errors: 0,
            },
          ],
        },
      ],
      derived: [
        {
          name: "sharedGroupWallPenalty",
          value: 3.84,
          unit: "x",
          note: "shared over disjoint at 8 writers",
        },
      ],
    },
    ...overrides,
  };
}

export function gapTask(
  overrides: Partial<TaskEntry> = {},
): Record<string, unknown> {
  return {
    id: "T-001",
    kind: "GAP",
    title: "Concurrency: contended advisory lock",
    createdAt: "2026-09-01T12:00:00.000Z",
    status: "UNVERIFIED",
    history: [{ status: "UNVERIFIED", at: "2026-09-01T12:00:00.000Z" }],
    priority: 1,
    area: "auth-scope",
    details: {
      question: "Does authGroups serialise documents sharing a group?",
      experiment:
        "N concurrent writers over documents naming one group vs disjoint groups",
      whyItMatters:
        "Append-condition conflicts retry 20x exempt from the retry limit, so cost multiplies",
      proposedKind: "concurrency",
    },
    ...overrides,
  };
}

export function defectTask(
  overrides: Partial<TaskEntry> = {},
): Record<string, unknown> {
  return {
    id: "T-002",
    kind: "DEFECT",
    title: "Guarded insert re-prepares its statement per append",
    createdAt: "2026-09-01T12:00:00.000Z",
    status: "UNVERIFIED",
    history: [{ status: "UNVERIFIED", at: "2026-09-01T12:00:00.000Z" }],
    priority: 2,
    area: "storage",
    details: {
      sites: [
        { file: "packages/reactor/src/storage/kysely/store.ts", line: 291 },
      ],
      repro:
        "Run the concurrency bench at 8 writers with pg_stat_statements on",
      observed: "One parse per append",
      expected: "One parse per connection",
      magnitude: "+23%",
      fixes: [
        {
          rank: 1,
          summary: "Prepare the guarded insert once per connection",
          expectedEffect: "Parse count drops to the connection count",
          cost: "small",
        },
      ],
    },
    ...overrides,
  };
}

/**
 * A micro entry shaped the way the adapter emits one, trimmed to two suites.
 * The numbers are real, lifted from a `pnpm bench:auth:record` run: a fixture
 * with invented magnitudes would not catch a unit mistake.
 */
export function microEntry(
  overrides: Partial<BenchmarkEntry> = {},
): Record<string, unknown> {
  return {
    id: "B-001",
    kind: "micro",
    tier: "micro",
    title: "auth-scope microbenchmarks",
    question: "What does each auth-scope operation cost in isolation?",
    command: "pnpm --filter @powerhousedao/reactor bench:auth:record",
    recordedAt: "2026-09-01T12:00:00.000Z",
    environment: {
      host: "mac-studio-m2",
      os: "darwin 24.6.0",
      cpu: "Apple M2 Max",
      cores: 12,
      node: "v22.14.0",
      reactorSha: "c9d01b3",
      storage: "stubbed",
    },
    conclusions: [
      "In auth policy evaluation (pure CPU), evaluateGrantStack: 64 grants is 12.4x evaluateGrantStack: 2 grants",
    ],
    caveats: [],
    results: {
      runner: "vitest-bench",
      runnerVersion: "4.1.1",
      sourceFiles: ["bench/auth-scope.bench.ts"],
      protocol: { repetitions: 1, interleaved: false },
      suites: [
        {
          fullName:
            "bench/auth-scope.bench.ts > auth policy evaluation (pure CPU)",
          cases: [
            {
              name: "evaluateGrantStack: 2 grants",
              rank: 1,
              hz: 24445789.657730818,
              meanMs: 4.09068397462774e-5,
              medianMs: 4.199999966658652e-5,
              minMs: 0,
              maxMs: 14.25775000000067,
              p75Ms: 4.199999966658652e-5,
              p99Ms: 8.300000081362668e-5,
              p999Ms: 0.00016599999980826396,
              rmePct: 5.589634149552225,
              sampleCount: 12222895,
              totalTimeMs: 500.00000700057535,
              vitestId: "-368308803_0_0",
            },
            {
              name: "evaluateGrantStack: 64 grants",
              rank: 2,
              hz: 1971434.6218525374,
              meanMs: 0.0005072430462046,
              medianMs: 0.000499999999417923,
              minMs: 0.00041699999827425,
              maxMs: 4.783458000000431,
              rmePct: 1.2119570154275,
              sampleCount: 985718,
              totalTimeMs: 500.0026669999585,
            },
          ],
        },
      ],
      derived: [
        {
          name: "grantStackSpread",
          value: 12.4,
          unit: "x",
          note: "slowest over fastest in auth policy evaluation (pure CPU)",
        },
      ],
    },
    ...overrides,
  };
}
