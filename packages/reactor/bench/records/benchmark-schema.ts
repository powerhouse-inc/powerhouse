import { z } from "zod";

/** One canonical spelling per rung. */
export const LadderLevel = z.enum([
  "L0_CLEAN",
  "L0_POLICIED",
  "L1_DOCUMENT_DECISIONS",
  "L2_AUTH_ENFORCEMENT",
  "L3_AUTH_GROUPS",
  "L4_AUTH_CONDITIONS",
]);
export type LadderLevel = z.infer<typeof LadderLevel>;

export const StorageEngine = z.enum(["stubbed", "pglite", "postgres", "mixed"]);
export type StorageEngine = z.infer<typeof StorageEngine>;

export const BenchmarkId = z.string().regex(/^B-\d{3,}$/, {
  error: "Ids look like B-001",
});
export const TaskIdRef = z.string().regex(/^T-\d{3,}$/, {
  error: "Ids look like T-001",
});

/**
 * Machine facts only. Protocol facts live in each payload: merging the two is
 * where hand-written benchmark records diverge from one another.
 */
export const MachineEnvironment = z.strictObject({
  host: z.string().min(1),
  os: z.string().min(1).optional(),
  cpu: z.string().min(1),
  cores: z.int().positive().optional(),
  node: z.string().min(1),
  reactorSha: z.string().regex(/^[0-9a-f]{7,40}$/),
  storage: StorageEngine,
  postgres: z.string().min(1).optional(),
  workerPool: z.string().min(1).optional(),
  signatureVerifier: z.string().min(1).optional(),
});
export type MachineEnvironment = z.infer<typeof MachineEnvironment>;

/** How the run was conducted. Payloads needing more extend this. */
export const RunProtocol = z.strictObject({
  repetitions: z.int().positive(),
  interleaved: z.boolean(),
  schemaDroppedPerCell: z.boolean().optional(),
  instrument: z.string().min(1).optional(),
  notes: z.array(z.string().min(1)).default([]),
});
export type RunProtocol = z.infer<typeof RunProtocol>;

export const OperationWorkload = z.strictObject({
  documents: z.int().positive(),
  operationsPerDocument: z.int().positive(),
  batchSize: z.int().positive(),
  grantsInPolicy: z.int().nonnegative(),
  groupPrincipals: z.int().nonnegative().default(0),
  backdatedActions: z.int().nonnegative().default(0),
});
export type OperationWorkload = z.infer<typeof OperationWorkload>;

/** A derived number is never a bare float in prose. */
export const DerivedRatio = z.strictObject({
  name: z.string().min(1),
  value: z.number(),
  unit: z.enum(["x", "pct", "ms", "us", "count", "perOperation"]),
  note: z.string().min(1).optional(),
});
export type DerivedRatio = z.infer<typeof DerivedRatio>;

export const ConcurrencyArm = z.enum([
  "SHARED_GROUP",
  "DISJOINT_GROUPS",
  "NO_GROUPS",
]);
export type ConcurrencyArm = z.infer<typeof ConcurrencyArm>;

/**
 * One repetition of one cell. `appendConditionRetries` and `retryExhaustions`
 * are required because a run without them has not measured the mechanism this
 * benchmark exists to provoke.
 */
export const ConcurrencyRun = z.strictObject({
  wallMs: z.number().positive(),
  throughputOpsPerSec: z.number().positive().optional(),
  p50LatencyMs: z.number().nonnegative().optional(),
  p95LatencyMs: z.number().nonnegative().optional(),
  p99LatencyMs: z.number().nonnegative().optional(),
  appendConditionRetries: z.int().nonnegative(),
  maxRetriesOnOneOperation: z.int().nonnegative().optional(),
  retryExhaustions: z.int().nonnegative(),
  advisoryLockAcquisitions: z.int().nonnegative().optional(),
  advisoryLockWaitMsTotal: z.number().nonnegative().optional(),
  advisoryLockWaitMsMax: z.number().nonnegative().optional(),
  postgresMs: z.number().nonnegative().optional(),
  statements: z.int().nonnegative().optional(),
  errors: z.int().nonnegative(),
});
export type ConcurrencyRun = z.infer<typeof ConcurrencyRun>;

export const ConcurrencyCell = z.strictObject({
  arm: ConcurrencyArm,
  writers: z.int().positive(),
  ladderLevel: LadderLevel,
  documentsPerWriter: z.int().positive().optional(),
  groupsInPolicy: z.int().nonnegative(),
  documentsPerGroup: z.int().positive().optional(),
  runs: z.array(ConcurrencyRun).min(1),
});
export type ConcurrencyCell = z.infer<typeof ConcurrencyCell>;

/**
 * N concurrent writers over documents naming one shared group versus disjoint
 * groups. The pairing refinement rejects an unpaired contention number, which
 * is the exact mistake this benchmark exists to avoid.
 */
export const ConcurrencyPayload = z
  .strictObject({
    workload: OperationWorkload,
    protocol: RunProtocol.extend({
      retryCeiling: z.int().positive(),
      lockInstrument: z
        .enum(["pg_locks_sampler", "pg_stat_statements", "none"])
        .default("none"),
    }),
    cells: z.array(ConcurrencyCell).min(2),
    derived: z.array(DerivedRatio).default([]),
  })
  .superRefine((payload, ctx) => {
    const armsByWriters = new Map<number, Set<string>>();
    for (const cell of payload.cells) {
      const arms = armsByWriters.get(cell.writers) ?? new Set<string>();
      arms.add(cell.arm);
      armsByWriters.set(cell.writers, arms);
    }

    const paired = [...armsByWriters.values()].some(
      (arms) => arms.has("SHARED_GROUP") && arms.has("DISJOINT_GROUPS"),
    );
    if (!paired) {
      ctx.addIssue({
        code: "custom",
        path: ["cells"],
        message:
          "Needs SHARED_GROUP and DISJOINT_GROUPS at the same writer count",
      });
    }
  });
export type ConcurrencyPayload = z.infer<typeof ConcurrencyPayload>;

/** Adding a benchmark shape means one payload here and one line in the union. */
export const BENCHMARK_PAYLOADS = {
  concurrency: ConcurrencyPayload,
} as const;

export type BenchmarkKind = keyof typeof BENCHMARK_PAYLOADS;
export const BENCHMARK_KINDS = Object.keys(
  BENCHMARK_PAYLOADS,
) as BenchmarkKind[];

export const BenchmarkTier = z.enum(["micro", "meso", "macro"]);
export type BenchmarkTier = z.infer<typeof BenchmarkTier>;

const benchmarkEnvelope = {
  id: BenchmarkId,
  tier: BenchmarkTier,
  title: z.string().min(1),
  /** The question, not the result: a run with no question cannot be falsified. */
  question: z.string().min(1),
  command: z.string().min(1),
  recordedAt: z.iso.datetime(),
  environment: MachineEnvironment,
  conclusions: z.array(z.string().min(1)).min(1),
  caveats: z.array(z.string().min(1)),
  supersedes: z.array(BenchmarkId).default([]),
  tasks: z.array(TaskIdRef).default([]),
  tags: z.array(z.string().min(1)).default([]),
};

const benchmarkVariant = <K extends BenchmarkKind>(kind: K) =>
  z.strictObject({
    ...benchmarkEnvelope,
    kind: z.literal(kind),
    results: BENCHMARK_PAYLOADS[kind],
  });

/**
 * One variant today. `discriminatedUnion` accepts a single-element list, so the
 * mechanism is in place and the next shape is one payload plus one line here.
 */
export const BenchmarkEntry = z.discriminatedUnion("kind", [
  benchmarkVariant("concurrency"),
]);
export type BenchmarkEntry = z.infer<typeof BenchmarkEntry>;
