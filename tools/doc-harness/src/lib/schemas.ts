/**
 * Every schema the harness persists or passes between workflow steps.
 *
 * Step payloads are deliberately small: Mastra persists each step's input and
 * output into the workflow snapshot, so anything large (transcripts, judge
 * prose, test output) lives on disk and only its path crosses a step boundary.
 */
import { z } from "zod";

export const Arm = z.enum(["A", "B"]);
export type Arm = z.infer<typeof Arm>;

export const AuthMode = z.enum(["bare", "oauth-isolated"]);
export type AuthMode = z.infer<typeof AuthMode>;

export const SandboxMode = z.enum(["dontAsk", "bypass"]);
export type SandboxMode = z.infer<typeof SandboxMode>;

/* ------------------------------------------------------------- claude -p */

/**
 * The final `{"type":"result"}` line of a `claude -p --output-format
 * stream-json` run. Passthrough because the format is internal to the CLI and
 * gains fields between versions; the named ones are what the harness reads.
 */
export const ResultRecord = z
  .object({
    type: z.literal("result"),
    subtype: z.string(),
    is_error: z.boolean(),
    duration_ms: z.number().optional(),
    duration_api_ms: z.number().optional(),
    num_turns: z.number().optional(),
    total_cost_usd: z.number().optional(),
    session_id: z.string().optional(),
    /** Absent on budget exhaustion (errors[] is set instead). */
    result: z.string().optional(),
    structured_output: z.unknown().optional(),
    /** completed | api_error | budget_exhausted (observed on 2.1.258). */
    terminal_reason: z.string().optional(),
    api_error_status: z.number().nullable().optional(),
    errors: z.array(z.string()).optional(),
    permission_denials: z.array(z.record(z.string(), z.unknown())).optional(),
    usage: z.record(z.string(), z.unknown()).optional(),
    modelUsage: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type ResultRecord = z.infer<typeof ResultRecord>;

export const ClaudeFailureReason = z.enum([
  "no-result-record",
  "api-error",
  "budget-exhausted",
  "wall-clock",
  "nonzero-exit",
  "spawn-error",
  "cli-version-drift",
]);
export type ClaudeFailureReason = z.infer<typeof ClaudeFailureReason>;

/** What the driver reports; written to build.json / judge.json / verify.json. */
export const ClaudeOutcome = z.object({
  ok: z.boolean(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  killedByWallClock: z.boolean(),
  failureReason: ClaudeFailureReason.optional(),
  resultRecord: ResultRecord.nullable(),
  structuredOutput: z.unknown().nullable(),
  transcriptPath: z.string(),
  sessionJsonlPath: z.string().nullable(),
  stderrPath: z.string(),
  stderrTail: z.string(),
  durationMs: z.number(),
  costUsd: z.number().nullable(),
  turns: z.number().nullable(),
  model: z.string(),
  cliVersion: z.string(),
  argv: z.array(z.string()),
});
export type ClaudeOutcome = z.infer<typeof ClaudeOutcome>;

/* ------------------------------------------------------------ metrics */

export const EscapeKind = z.enum([
  "dts-read",
  "outside-root-read",
  "network-bash",
  "denied-path-bash",
  "dep-change",
]);
export type EscapeKind = z.infer<typeof EscapeKind>;

export const Escape = z.object({
  kind: EscapeKind,
  turn: z.number(),
  detail: z.string(),
});
export type Escape = z.infer<typeof Escape>;

export const DocPageRead = z.object({
  /** Relative to the docs snapshot root. */
  rel: z.string(),
  firstTurn: z.number(),
  via: z.enum(["Read", "Grep", "Glob", "Bash"]),
});
export type DocPageRead = z.infer<typeof DocPageRead>;

export const BashCommand = z.object({
  turn: z.number(),
  cmd: z.string(),
  isError: z.boolean(),
  exitCodeInferred: z.number().nullable(),
  stderrHead: z.string(),
});
export type BashCommand = z.infer<typeof BashCommand>;

export const SymbolUse = z.object({
  pkg: z.string(),
  name: z.string(),
  firstUseTurn: z.number(),
  firstDocReadTurn: z.number().nullable(),
  docPage: z.string().nullable(),
  documentedAnywhere: z.boolean(),
});
export type SymbolUse = z.infer<typeof SymbolUse>;

export const TokenUsage = z.object({
  input: z.number(),
  output: z.number(),
  cacheCreation: z.number(),
  cacheRead: z.number(),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

/** Deterministic extraction from a transcript. Written to metrics.json. */
export const Metrics = z.object({
  format: z.enum(["stream-json", "session"]),
  cliVersion: z.string().nullable(),
  model: z.string().nullable(),
  turns: z.number(),
  assistantMessages: z.number(),
  tokens: TokenUsage,
  costUsd: z.number().nullable(),
  durationMs: z.number().nullable(),
  toolHistogram: z.record(z.string(), z.number()),
  docPagesRead: z.array(DocPageRead),
  escapes: z.array(Escape),
  bashCommands: z.array(BashCommand),
  errorToolResults: z.number(),
  retryLoops: z.array(z.object({ cmd: z.string(), count: z.number() })),
  symbols: z.array(SymbolUse),
  finalText: z.string(),
  docGapsStated: z.string().nullable(),
  contaminated: z.boolean(),
});
export type Metrics = z.infer<typeof Metrics>;

/* --------------------------------------------------------- acceptance */

export const AcceptanceKind = z.enum(["vitest", "tsc-only", "none"]);
export type AcceptanceKind = z.infer<typeof AcceptanceKind>;

/** Written to tests.json. */
export const TestsResult = z.object({
  kind: AcceptanceKind,
  tscOk: z.boolean().nullable(),
  tscOutputPath: z.string().nullable(),
  /** True when vitest ran and wrote its JSON report; null when it did not run. */
  vitestOk: z.boolean().nullable(),
  passed: z.number(),
  failed: z.number(),
  total: z.number(),
  timedOut: z.boolean(),
  durationMs: z.number(),
  vitestJsonPath: z.string().nullable(),
});
export type TestsResult = z.infer<typeof TestsResult>;

/* -------------------------------------------------------------- judge */

export const FindingKind = z.enum(["WRONG", "STALE", "MISSING", "UNCLEAR"]);
export type FindingKind = z.infer<typeof FindingKind>;

export const Finding = z.object({
  kind: FindingKind,
  /** Relative to the docs snapshot root; null only for MISSING. */
  docPath: z.string().nullable(),
  line: z.number().nullable(),
  /** Verbatim contiguous text from the doc; required unless kind is MISSING. */
  quote: z.string().nullable(),
  /** e.g. "ReactorBuilder.withReadModel" */
  symbol: z.string(),
  claim: z.string(),
  evidence: z.array(
    z.object({ turn: z.number(), uuid: z.string().nullable() }),
  ),
  proposedEdit: z.string(),
  confidence: z.number().min(0).max(1),
});
export type Finding = z.infer<typeof Finding>;

/** The judge's structured output (validated by --json-schema, re-validated here). */
export const JudgeOutput = z.object({
  findings: z.array(Finding),
  summary: z.string().max(1500),
  buildQualityNotes: z.string().max(1500),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

export const DropReason = z.enum(["unlocatable", "duplicate"]);
export type DropReason = z.infer<typeof DropReason>;

/** Written to judge.json: the raw output plus what the post-checks did. */
export const JudgeStepResult = z.object({
  claude: ClaudeOutcome.nullable(),
  raw: JudgeOutput.nullable(),
  kept: z.array(Finding),
  dropped: z.array(z.object({ finding: Finding, reason: DropReason })),
  relabelled: z.array(
    z.object({ index: z.number(), from: FindingKind, to: FindingKind }),
  ),
});
export type JudgeStepResult = z.infer<typeof JudgeStepResult>;

/* ----------------------------------------------------------- verifier */

export const VerifyStatus = z.enum(["VERIFIED", "REFUTED", "UNVERIFIED"]);
export type VerifyStatus = z.infer<typeof VerifyStatus>;

export const VerifyResult = z.object({
  /** Index into JudgeStepResult.kept. */
  index: z.number(),
  status: VerifyStatus,
  prediction: z.string(),
  observation: z.string(),
  note: z.string(),
  /** True when a deterministic pre-check decided it, no model involved. */
  byPrecheck: z.boolean().default(false),
});
export type VerifyResult = z.infer<typeof VerifyResult>;

export const VerifyOutput = z.object({ results: z.array(VerifyResult) });
export type VerifyOutput = z.infer<typeof VerifyOutput>;

/** Written to verify.json. */
export const VerifyStepResult = z.object({
  claude: ClaudeOutcome.nullable(),
  results: z.array(VerifyResult),
});
export type VerifyStepResult = z.infer<typeof VerifyStepResult>;

/* ------------------------------------------------------------ records */

/** One line of FINDINGS.jsonl. */
export const FindingRecord = Finding.extend({
  /** sha1(normalize(docPath)|symbol|kind).slice(0,12) */
  key: z.string(),
  status: VerifyStatus,
  verifierNote: z.string(),
  runId: z.string(),
  taskId: z.string(),
  arm: Arm,
  n: z.number(),
  docsSha: z.string(),
  pin: z.string(),
  cliVersion: z.string(),
  recordedAt: z.string(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

export const AttemptStatus = z.enum([
  "complete",
  "infra-fail",
  "build-fail",
  "contaminated",
  "skipped",
]);
export type AttemptStatus = z.infer<typeof AttemptStatus>;

/** Written to attempt.json and embedded in RUNS.jsonl. */
export const AttemptSummary = z.object({
  taskId: z.string(),
  arm: Arm,
  n: z.number(),
  status: AttemptStatus,
  buildOk: z.boolean(),
  buildFailureReason: ClaudeFailureReason.nullable(),
  tscOk: z.boolean().nullable(),
  /** The acceptance verdict for the task kind; null when nothing was graded. */
  acceptanceOk: z.boolean().nullable(),
  testsPassed: z.number(),
  testsTotal: z.number(),
  turns: z.number().nullable(),
  costUsd: z.number(),
  durationMs: z.number(),
  escapes: z.partialRecord(EscapeKind, z.number()),
  docPagesRead: z.number(),
  contaminated: z.boolean(),
  findingsKept: z.number(),
  findingsVerified: z.number(),
  findingsRefuted: z.number(),
});
export type AttemptSummary = z.infer<typeof AttemptSummary>;

export const RunArgs = z.object({
  tasks: z.array(z.string()),
  arms: z.array(Arm),
  n: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  dryRun: z.boolean(),
  sandbox: SandboxMode,
  auth: AuthMode,
  skipVerify: z.boolean(),
  keepWorkspaces: z.boolean(),
  builderModel: z.string(),
  judgeModel: z.string(),
});
export type RunArgs = z.infer<typeof RunArgs>;

/** run.json, and one line of RUNS.jsonl once the run finishes. */
export const RunRecord = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  cliVersion: z.string(),
  docsSha: z.string(),
  docsHash: z.string(),
  docsFileCount: z.number(),
  pin: z.string(),
  catalogHash: z.string(),
  args: RunArgs,
  attempts: z.array(AttemptSummary),
});
export type RunRecord = z.infer<typeof RunRecord>;

/* -------------------------------------------------------- step outputs */

export const PrepareWorkspaceOutput = z.object({
  workspaceDir: z.string(),
  installOk: z.boolean(),
  installMs: z.number(),
  installLogPath: z.string(),
  installedVersion: z.string().nullable(),
});
export type PrepareWorkspaceOutput = z.infer<typeof PrepareWorkspaceOutput>;

export const BuildOutput = z.object({
  ok: z.boolean(),
  skipped: z.boolean(),
  failureReason: ClaudeFailureReason.nullable(),
  transcriptPath: z.string().nullable(),
  sessionJsonlPath: z.string().nullable(),
  costUsd: z.number(),
  durationMs: z.number(),
  turns: z.number().nullable(),
  exitCode: z.number().nullable(),
  killedByWallClock: z.boolean(),
});
export type BuildOutput = z.infer<typeof BuildOutput>;

export const AcceptanceOutput = TestsResult.pick({
  kind: true,
  tscOk: true,
  vitestOk: true,
  passed: true,
  failed: true,
  total: true,
  timedOut: true,
}).extend({ testsPath: z.string(), skipped: z.boolean() });
export type AcceptanceOutput = z.infer<typeof AcceptanceOutput>;

export const ExtractOutput = z.object({
  metricsPath: z.string(),
  compactPath: z.string(),
  skipped: z.boolean(),
  docPagesRead: z.number(),
  escapes: z.number(),
  bashErrors: z.number(),
  contaminated: z.boolean(),
});
export type ExtractOutput = z.infer<typeof ExtractOutput>;

export const JudgeOutputSummary = z.object({
  judgePath: z.string(),
  skipped: z.boolean(),
  rawFindings: z.number(),
  kept: z.number(),
  dropped: z.number(),
  costUsd: z.number(),
});
export type JudgeOutputSummary = z.infer<typeof JudgeOutputSummary>;

export const VerifyOutputSummary = z.object({
  verifyPath: z.string(),
  skipped: z.boolean(),
  verified: z.number(),
  refuted: z.number(),
  unverified: z.number(),
  costUsd: z.number(),
});
export type VerifyOutputSummary = z.infer<typeof VerifyOutputSummary>;

export const RecordOutput = z.object({
  attemptPath: z.string(),
  status: AttemptStatus,
  findingsAppended: z.number(),
});
export type RecordOutput = z.infer<typeof RecordOutput>;
