import { z } from "zod";
import type { BenchmarkKind } from "./benchmark-schema.js";
import { BENCHMARK_KINDS, BenchmarkId } from "./benchmark-schema.js";

/**
 * REFUTED is terminal in the same way COMMITTED is: a verifier that disproved
 * a finding has somewhere to put it, and reopening as UNVERIFIED would erase
 * the fact that someone looked.
 */
export const TASK_STATUSES = [
  "UNVERIFIED",
  "VERIFIED",
  "FIXED",
  "COMMITTED",
  "REFUTED",
] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskId = z.string().regex(/^T-\d{3,}$/, {
  error: "Ids look like T-001",
});

/**
 * Every status change appends one. No transition is illegal: a FIXED defect
 * that the next run reopens is a real event.
 */
export const StatusEvent = z.strictObject({
  status: TaskStatus,
  at: z.iso.datetime(),
  note: z.string().min(1).optional(),
  by: z.string().min(1).optional(),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .optional(),
  evidence: z.array(BenchmarkId).default([]),
});
export type StatusEvent = z.infer<typeof StatusEvent>;

export const CodeRef = z.strictObject({
  file: z.string().min(1).regex(/^[^/]/, { error: "Use a repo-relative path" }),
  line: z.int().positive().optional(),
  symbol: z.string().min(1).optional(),
});
export type CodeRef = z.infer<typeof CodeRef>;

export const CandidateFix = z.strictObject({
  rank: z.int().positive(),
  summary: z.string().min(1),
  /** Keeps the fix falsifiable. */
  expectedEffect: z.string().min(1),
  cost: z.enum(["small", "medium", "large"]),
  risk: z.string().min(1).optional(),
});
export type CandidateFix = z.infer<typeof CandidateFix>;

/** DEFECT: a benchmark found something wrong in the system under test. */
export const DefectPayload = z
  .strictObject({
    sites: z.array(CodeRef).min(1),
    repro: z.string().min(1),
    observed: z.string().min(1),
    expected: z.string().min(1),
    magnitude: z.string().min(1).optional(),
    fixes: z.array(CandidateFix).min(1),
  })
  .superRefine((payload, ctx) => {
    const ranks = payload.fixes.map((fix) => fix.rank).sort((a, b) => a - b);
    const contiguous = ranks.every((rank, index) => rank === index + 1);
    if (!contiguous) {
      ctx.addIssue({
        code: "custom",
        path: ["fixes"],
        message: `Ranks must be 1..${ranks.length} with no gaps or ties, got ${ranks.join(", ")}`,
      });
    }
  });
export type DefectPayload = z.infer<typeof DefectPayload>;

/** GAP: a measurement that does not exist yet. */
export const GapPayload = z.strictObject({
  question: z.string().min(1),
  /** The smallest experiment that would settle it. */
  experiment: z.string().min(1),
  whyItMatters: z.string().min(1),
  proposedKind: z
    .enum(BENCHMARK_KINDS as [BenchmarkKind, ...BenchmarkKind[]])
    .optional(),
  blockedBy: z.array(TaskId).default([]),
});
export type GapPayload = z.infer<typeof GapPayload>;

/** HARNESS: the apparatus is wrong, so numbers already recorded are suspect. */
export const HarnessPayload = z.strictObject({
  sites: z.array(CodeRef).min(1),
  defect: z.string().min(1),
  invalidates: z.array(BenchmarkId).default([]),
  biasDirection: z.enum(["overestimate", "underestimate", "unknown"]),
  remedy: z.string().min(1),
});
export type HarnessPayload = z.infer<typeof HarnessPayload>;

export const TASK_PAYLOADS = {
  DEFECT: DefectPayload,
  GAP: GapPayload,
  HARNESS: HarnessPayload,
} as const;

export type TaskKind = keyof typeof TASK_PAYLOADS;
export const TASK_KINDS = Object.keys(TASK_PAYLOADS) as TaskKind[];

const taskEnvelope = {
  id: TaskId,
  title: z.string().min(1),
  createdAt: z.iso.datetime(),
  status: TaskStatus.default("UNVERIFIED"),
  history: z.array(StatusEvent).min(1),
  priority: z.int().min(1).max(5),
  area: z.string().min(1),
  evidence: z.array(BenchmarkId).default([]),
  tags: z.array(z.string().min(1)).default([]),
};

/**
 * Both cross-field checks sit on the union rather than on each variant:
 * `discriminatedUnion` cannot introspect a variant wrapped in `superRefine`,
 * because the wrapper hides the discriminator.
 */
export const TaskEntry = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...taskEnvelope,
      kind: z.literal("DEFECT"),
      details: DefectPayload,
    }),
    z.strictObject({
      ...taskEnvelope,
      kind: z.literal("GAP"),
      details: GapPayload,
    }),
    z.strictObject({
      ...taskEnvelope,
      kind: z.literal("HARNESS"),
      details: HarnessPayload,
    }),
  ])
  .superRefine((task, ctx) => {
    // Refinements still run when the variant itself failed, so a history that
    // did not satisfy `min(1)` reaches here as an empty array.
    const head = task.history.at(-1);
    if (head === undefined) {
      return;
    }

    if (head.status !== task.status) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: `Status ${task.status} disagrees with the last history event (${head.status})`,
      });
    }

    for (let index = 1; index < task.history.length; index += 1) {
      const previous = Date.parse(task.history[index - 1].at);
      const current = Date.parse(task.history[index].at);
      if (current < previous) {
        ctx.addIssue({
          code: "custom",
          path: ["history", index, "at"],
          message: `History is out of order: ${task.history[index].at} precedes ${task.history[index - 1].at}`,
        });
      }
    }
  });
export type TaskEntry = z.infer<typeof TaskEntry>;
