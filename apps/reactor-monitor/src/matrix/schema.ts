// Matrix wire shapes. Browser-safe: no node:, no reactor root.
import { reactorBackendKindSchema } from "@powerhousedao/host-core/schema";
import { z } from "zod";
import { envSchema, hostIssueSchema } from "../controller/api.js";

export const MATRIX_FORMAT = "ph-monitor-matrix";
export const MATRIX_RUN_FORMAT = "ph-monitor-matrix-run";

export const MATRIX_LIMITS = {
  axes: 6,
  values: 16,
  cells: 1024,
  rules: 32,
  setters: 32,
  instances: 64,
  repetitions: 5,
  concurrency: { remote: 4, browser: 2 },
  settleMs: { min: 5_000, max: 300_000, default: 60_000 },
  diskBudgetMb: { min: 64, max: 5_120, default: 2_048 },
  setterValueBytes: 8_192,
  pathSegments: 32,
} as const;

export const MATRIX_TIMEOUTS_MS = {
  check: 60_000,
  ready: 90_000,
  instance: 300_000,
} as const;

/** Each mode's pool, one instance timeout per slot, summed. */
export function runTimeoutMs(
  instances: { remote: number; browser: number },
  concurrency: { remote: number; browser: number },
): number {
  const slots =
    Math.ceil(instances.remote / concurrency.remote) +
    Math.ceil(instances.browser / concurrency.browser);
  return slots * MATRIX_TIMEOUTS_MS.instance;
}

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, "lowercase letters, digits, - and _");

const labelSchema = z.string().min(1).max(128);

export const deleteMarkerSchema = z.strictObject({ $delete: z.literal(true) });

export const setterSchema = z.strictObject({
  path: z.string().min(1).max(512),
  value: z.union([deleteMarkerSchema, z.json()]),
});
export type Setter = z.infer<typeof setterSchema>;

export function isDelete(value: Setter["value"]): value is { $delete: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    (value as Record<string, unknown>).$delete === true
  );
}

export const requirementSchema = z.enum(["postgres"]);
export type Requirement = z.infer<typeof requirementSchema>;

export const storageEngineSchema = z.enum(["pglite", "postgres"]);

/** remote: a controller-spawned host. in-process/worker: provisioned in the tab. */
export const attachSchema = reactorBackendKindSchema;
export type Attach = z.infer<typeof attachSchema>;
export type AttachMode = "controller" | "browser";

export function attachMode(attach: Attach): AttachMode {
  return attach === "remote" ? "controller" : "browser";
}

export const credentialVerificationSchema = z.enum(["skipped", "enforced"]);
export type CredentialVerification = z.infer<
  typeof credentialVerificationSchema
>;

export const axisValueSchema = z.strictObject({
  key: slugSchema,
  label: labelSchema.optional(),
  setters: z.array(setterSchema).max(MATRIX_LIMITS.setters).default([]),
  env: envSchema.default({}),
  attach: attachSchema.optional(),
  requires: z.array(requirementSchema).default([]),
  expect: z
    .strictObject({ storageEngine: storageEngineSchema.optional() })
    .default({}),
});
export type AxisValue = z.output<typeof axisValueSchema>;

export const axisSchema = z
  .strictObject({
    key: slugSchema,
    label: labelSchema.optional(),
    values: z.array(axisValueSchema).min(1).max(MATRIX_LIMITS.values),
  })
  .superRefine((axis, ctx) => {
    duplicates(axis.values.map((value) => value.key)).forEach((index) =>
      ctx.addIssue({
        code: "custom",
        path: ["values", index, "key"],
        message: `value "${axis.values[index].key}" appears twice in axis "${axis.key}"`,
      }),
    );
  });
export type Axis = z.output<typeof axisSchema>;

/** Axis key → the value key, or any of the value keys, it must hold. */
export const matchSchema = z
  .record(slugSchema, z.union([slugSchema, z.array(slugSchema).min(1)]))
  .refine((match) => Object.keys(match).length > 0, {
    message: "a match names at least one axis",
  });
export type Match = z.infer<typeof matchSchema>;

export const ruleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("exclude"),
    when: matchSchema,
    reason: labelSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("require"),
    if: matchSchema,
    then: matchSchema,
    reason: labelSchema.optional(),
  }),
]);
export type Rule = z.infer<typeof ruleSchema>;

/** Operator checks are `unavailable` when credentials are verified. */
export const CHECKS = [
  { name: "info.storage", operator: false },
  { name: "drives.integrity", operator: false },
  { name: "storage.health", operator: true },
  { name: "processors", operator: true },
  { name: "catchUp", operator: true },
  { name: "sync.deadLetters", operator: true },
  { name: "queue.drained", operator: true },
] as const;
export type CheckName = (typeof CHECKS)[number]["name"];
export const CHECK_NAMES = CHECKS.map((check) => check.name) as [
  CheckName,
  ...CheckName[],
];
export const checkNameSchema = z.enum(CHECK_NAMES);

export const matrixDefinitionSchema = z
  .strictObject({
    format: z.literal(MATRIX_FORMAT),
    version: z.literal(1),
    name: labelSchema,
    base: z.strictObject({
      project: z.string().min(1).max(4096),
      host: z.string().min(1).max(255),
      exportHash: z.string().min(1).max(128).optional(),
    }),
    attach: attachSchema.default("remote"),
    credentialVerification: credentialVerificationSchema.default("skipped"),
    /** Run built-in invalid combos; they pass when refused. */
    negativeTests: z.boolean().default(false),
    axes: z.array(axisSchema).min(1).max(MATRIX_LIMITS.axes),
    rules: z.array(ruleSchema).max(MATRIX_LIMITS.rules).default([]),
    repetitions: z.int().min(1).max(MATRIX_LIMITS.repetitions).default(1),
    concurrency: z
      .strictObject({
        remote: z.int().min(1).max(MATRIX_LIMITS.concurrency.remote),
        browser: z.int().min(1).max(MATRIX_LIMITS.concurrency.browser),
      })
      .default({ remote: 2, browser: 1 }),
    checks: z
      .array(checkNameSchema)
      .min(1)
      .default([...CHECK_NAMES]),
    settleMs: z
      .int()
      .min(MATRIX_LIMITS.settleMs.min)
      .max(MATRIX_LIMITS.settleMs.max)
      .default(MATRIX_LIMITS.settleMs.default),
    diskBudgetMb: z
      .int()
      .min(MATRIX_LIMITS.diskBudgetMb.min)
      .max(MATRIX_LIMITS.diskBudgetMb.max)
      .default(MATRIX_LIMITS.diskBudgetMb.default),
  })
  .superRefine((definition, ctx) => {
    const axes = definition.axes;
    duplicates(axes.map((axis) => axis.key)).forEach((index) =>
      ctx.addIssue({
        code: "custom",
        path: ["axes", index, "key"],
        message: `axis "${axes[index].key}" appears twice`,
      }),
    );
    duplicates(definition.checks).forEach((index) =>
      ctx.addIssue({
        code: "custom",
        path: ["checks", index],
        message: `check "${definition.checks[index]}" appears twice`,
      }),
    );
    const cells = axes.reduce(
      (product, axis) => product * axis.values.length,
      1,
    );
    if (cells > MATRIX_LIMITS.cells) {
      ctx.addIssue({
        code: "custom",
        path: ["axes"],
        message: `${cells} cells; at most ${MATRIX_LIMITS.cells} before rules`,
      });
    }
    const valuesOf = new Map(
      axes.map((axis) => [axis.key, axis.values.map((value) => value.key)]),
    );
    definition.rules.forEach((rule, index) => {
      const matches: [string, Match][] =
        rule.kind === "exclude"
          ? [["when", rule.when]]
          : [
              ["if", rule.if],
              ["then", rule.then],
            ];
      for (const [field, match] of matches) {
        for (const [axisKey, wanted] of Object.entries(match)) {
          const known = valuesOf.get(axisKey);
          if (!known) {
            ctx.addIssue({
              code: "custom",
              path: ["rules", index, field, axisKey],
              message: `no axis "${axisKey}"`,
            });
            continue;
          }
          for (const valueKey of typeof wanted === "string"
            ? [wanted]
            : wanted) {
            if (known.includes(valueKey)) continue;
            ctx.addIssue({
              code: "custom",
              path: ["rules", index, field, axisKey],
              message: `axis "${axisKey}" has no value "${valueKey}"`,
            });
          }
        }
      }
    });
  });
export type MatrixDefinition = z.output<typeof matrixDefinitionSchema>;
export type MatrixDefinitionInput = z.input<typeof matrixDefinitionSchema>;

function duplicates(keys: readonly string[]): number[] {
  return keys.flatMap((key, index) =>
    keys.indexOf(key) === index ? [] : [index],
  );
}

/** `postgres`: the controller has PH_MONITOR_PG_URL. */
export const capabilitiesSchema = z.object({
  postgres: z.boolean(),
  maxInstances: z.int().min(0),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

/** Engine stages come first; checkHost's stages follow. */
export const MATRIX_STAGES = [
  "policy",
  "conflict",
  "setter",
  "shape",
  "capability",
] as const;
export const matrixIssueSchema = z.object({
  stage: z.enum([...MATRIX_STAGES, ...hostIssueSchema.shape.stage.options]),
  path: z.string(),
  message: z.string(),
  file: z.string().optional(),
  hint: z.string().optional(),
  axis: z.string().optional(),
  value: z.string().optional(),
});
export type MatrixIssue = z.infer<typeof matrixIssueSchema>;
export type MatrixStage = MatrixIssue["stage"];

export const comboSchema = z.object({
  rule: z.enum(["ladder", "storage-mode"]),
  path: z.string(),
  message: z.string(),
});
export type Combo = z.infer<typeof comboSchema>;

export const unavailableReasonSchema = z.enum([
  "credential-verification-enforced",
]);
export type UnavailableReason = z.infer<typeof unavailableReasonSchema>;

export const checkResultSchema = z.object({
  name: checkNameSchema,
  status: z.enum(["pass", "fail", "unavailable"]),
  reason: unavailableReasonSchema.optional(),
  detail: z.string().optional(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const outcomeSchema = z.enum([
  "skipped-constraint",
  "invalid-static",
  "invalid-boot",
  "pass",
  "fail",
  "inconclusive",
  "error",
]);
export type Outcome = z.infer<typeof outcomeSchema>;

export const repOutcomeSchema = z.enum([
  "pass",
  "fail",
  "inconclusive",
  "error",
]);
export type RepOutcome = z.infer<typeof repOutcomeSchema>;

/** refusal: a negative test, which passes when refused. */
export const expectationSchema = z.enum(["accept", "refusal"]);
export type Expectation = z.infer<typeof expectationSchema>;

const durationSchema = z.number().nonnegative();

export const repSchema = z.object({
  rep: z.int().min(1),
  status: z.enum(["queued", "running", "done"]),
  instanceId: z.string().optional(),
  outcome: repOutcomeSchema.optional(),
  checks: z.array(checkResultSchema),
  issues: z.array(matrixIssueSchema),
  /** Never reached ready after a clean check: refused at boot. */
  spawnFailed: z.boolean().optional(),
  error: z.object({ message: z.string(), phase: z.string() }).optional(),
  timings: z.object({
    startMs: durationSchema.optional(),
    readyMs: durationSchema.optional(),
    probeMs: durationSchema.optional(),
    stopMs: durationSchema.optional(),
    totalMs: durationSchema.optional(),
  }),
  diskBytes: z.int().min(0).optional(),
});
export type Rep = z.infer<typeof repSchema>;

export const cellSchema = z.object({
  id: z.string(),
  values: z.record(z.string(), z.string()),
  attach: attachSchema,
  credentialVerification: credentialVerificationSchema,
  expect: expectationSchema,
  status: z.enum(["pending", "checking", "running", "done"]),
  outcome: outcomeSchema.optional(),
  reason: z.string().optional(),
  combos: z.array(comboSchema),
  issues: z.array(matrixIssueSchema),
  reps: z.array(repSchema),
  flaky: z.boolean(),
});
export type Cell = z.infer<typeof cellSchema>;

export const summarySchema = z.object({
  total: z.int(),
  done: z.int(),
  flaky: z.int(),
  outcomes: z.record(outcomeSchema, z.int()),
});
export type Summary = z.infer<typeof summarySchema>;

export const runStatusSchema = z.enum([
  "planning",
  "running",
  "done",
  "cancelled",
  "aborted",
  "interrupted",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const matrixRunSchema = z.object({
  format: z.literal(MATRIX_RUN_FORMAT),
  version: z.literal(1),
  id: z.string(),
  definition: matrixDefinitionSchema,
  baseExportHash: z.string(),
  capabilities: capabilitiesSchema,
  credentialVerification: credentialVerificationSchema,
  injectedEnvKeys: z.array(z.string()),
  status: runStatusSchema,
  reason: z.string().optional(),
  cells: z.array(cellSchema),
  summary: summarySchema,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
});
export type MatrixRun = z.infer<typeof matrixRunSchema>;
