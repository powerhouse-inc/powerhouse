/** Deterministic pre-checks, then one verifier `claude -p` for what is left. */
import { createStep } from "@mastra/core/workflows";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { scaledWallClockMs, verifyBudgetUsd } from "../lib/budgets.js";
import { buildDocsSymbolIndex } from "../lib/docs.js";
import { precheckVerify } from "../lib/judge-checks.js";
import { PROMPTS_ROOT } from "../lib/paths.js";
import { buildVerifierPrompt, type IndexedFinding } from "../lib/prompts.js";
import {
  JudgeOutputSummary,
  JudgeStepResult,
  VerifyOutput,
  VerifyOutputSummary,
  VerifyStepResult,
  type VerifyResult,
} from "../lib/schemas.js";
import { dtsHasSymbol, reinstallIfMissing } from "../lib/workspace.js";
import { REINSTALL_TIMEOUT_MS } from "./acceptance.js";
import { fileSize } from "./judge.js";
import {
  attemptLabel,
  attemptScope,
  type AttemptScope,
  type TaskRunInput,
  callClaude,
  readCached,
  readJson,
  writeJson,
  writeText,
} from "./shared.js";

const VERIFIER_TOOLS = ["Read", "Grep", "Glob", "Bash", "Write", "Edit"];
const VERIFIER_MAX_TURNS = 60;
export const VERIFIER_WALL_CLOCK_MS = 20 * 60_000;

export function verifierSchemaFile(promptsRoot: string = PROMPTS_ROOT) {
  return path.join(promptsRoot, "schemas", "verifier.schema.json");
}

function summarize(
  result: VerifyStepResult,
  verifyPath: string,
): VerifyOutputSummary {
  const count = (status: VerifyResult["status"]) =>
    result.results.filter((r) => r.status === status).length;
  return {
    verifyPath,
    skipped: false,
    verified: count("VERIFIED"),
    refuted: count("REFUTED"),
    unverified: count("UNVERIFIED"),
    costUsd: result.claude?.costUsd ?? 0,
  };
}

const SKIPPED: Omit<VerifyOutputSummary, "verifyPath"> = {
  skipped: true,
  verified: 0,
  refuted: 0,
  unverified: 0,
  costUsd: 0,
};

/** Pre-check results win; every pending index ends with exactly one result. */
export function mergeVerifyResults(
  prechecked: VerifyResult[],
  pending: number[],
  model: VerifyResult[] | null,
): VerifyResult[] {
  const byIndex = new Map<number, VerifyResult>();
  for (const r of prechecked) byIndex.set(r.index, r);
  const open = new Set(pending);
  for (const r of model ?? []) {
    if (!open.has(r.index) || byIndex.has(r.index)) continue;
    byIndex.set(r.index, r);
  }
  for (const index of pending) {
    if (byIndex.has(index)) continue;
    byIndex.set(index, {
      index,
      status: "UNVERIFIED",
      prediction: "",
      observation: "",
      note: "verifier returned no result",
      byPrecheck: false,
    });
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/** The step body, callable without Mastra. */
export async function verifyAttempt(
  scope: AttemptScope,
  inputData: JudgeOutputSummary,
): Promise<VerifyOutputSummary> {
  const { input, ctx, task, run, layout } = scope;
  const cached = readCached(layout.verifyJson, VerifyStepResult);
  if (cached) return summarize(cached, layout.verifyJson);

  if (input.args.skipVerify || inputData.skipped || inputData.kept === 0) {
    return { verifyPath: layout.verifyJson, ...SKIPPED };
  }

  const judged = readJson(layout.judgeJson, JudgeStepResult);
  const docs = buildDocsSymbolIndex(input.docsDir);
  const prechecked: VerifyResult[] = [];
  const pending: IndexedFinding[] = [];
  judged.kept.forEach((finding, index) => {
    const settled = precheckVerify(
      finding,
      {
        dtsHasSymbol: (s) => dtsHasSymbol(layout.dtsDir, s),
        docHasSymbol: (s) => docs.hasSymbol(s),
      },
      index,
    );
    if (settled) prechecked.push(settled);
    else pending.push({ index, finding });
  });

  let claude: VerifyStepResult["claude"] = null;
  let model: VerifyResult[] | null = null;
  const budgetUsd = verifyBudgetUsd(task.budgets.verifyUsd, judged.kept.length);
  const wallClockMs = scaledWallClockMs(
    VERIFIER_WALL_CLOCK_MS,
    fileSize(layout.compactMd),
  );
  if (pending.length > 0) {
    // The verifier compiles probes in the workspace; record.ts may have stripped it.
    if (!ctx.dryRun) {
      await reinstallIfMissing({
        workspaceDir: layout.workspaceDir,
        task,
        cacheDir: run.installCacheDir,
        logPath: layout.reinstallLogPath,
        timeoutMs: REINSTALL_TIMEOUT_MS,
        installer: ctx.installer,
      });
    }
    const prompts = buildVerifierPrompt(
      {
        taskId: input.taskId,
        arm: input.arm,
        pin: input.pin,
        workspaceDir: layout.workspaceDir,
        docsDir: input.docsDir,
        compactPath: layout.compactMd,
        findings: pending,
      },
      ctx.promptsRoot,
    );
    const systemPromptFile = path.join(layout.dir, "verifier.system.md");
    writeText(systemPromptFile, prompts.system);
    claude = await callClaude(ctx, ctx.judgeDriver, {
      cwd: layout.workspaceDir,
      prompt: prompts.task,
      systemPromptFile,
      model: input.args.judgeModel,
      settingsFile: layout.verifierSettingsFile,
      // The attempt dir holds the compact transcript the prompt points at.
      addDirs: [input.docsDir, layout.dir],
      tools: VERIFIER_TOOLS,
      permissionMode: "dontAsk",
      maxTurns: VERIFIER_MAX_TURNS,
      maxBudgetUsd: budgetUsd,
      wallClockMs,
      jsonSchemaFile: verifierSchemaFile(ctx.promptsRoot),
      sessionId: randomUUID(),
      authMode: input.args.auth,
      transcriptPath: layout.verifyTranscriptPath,
      stderrPath: layout.verifyStderrPath,
    });
    const parsed = claude.ok
      ? VerifyOutput.safeParse(claude.structuredOutput)
      : null;
    model = parsed?.success === true ? parsed.data.results : null;
  }

  const result: VerifyStepResult = {
    claude,
    budgetUsd,
    wallClockMs,
    results: mergeVerifyResults(
      prechecked,
      pending.map((p) => p.index),
      model,
    ),
  };
  writeJson(layout.verifyJson, result);
  const summary = summarize(result, layout.verifyJson);
  ctx.log(
    `${attemptLabel(input)} verify ${summary.verified}V/${summary.refuted}R/${summary.unverified}U prechecked=${prechecked.length} cost=$${summary.costUsd.toFixed(2)} budget=$${budgetUsd.toFixed(2)}`,
  );
  return summary;
}

export const verify = createStep({
  id: "verify",
  inputSchema: JudgeOutputSummary,
  outputSchema: VerifyOutputSummary,
  retries: 0,
  execute: (params) =>
    verifyAttempt(
      attemptScope(params.getInitData<TaskRunInput>()),
      params.inputData,
    ),
});
