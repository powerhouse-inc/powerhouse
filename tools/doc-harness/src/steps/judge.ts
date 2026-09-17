/** The judge `claude -p` with a JSON schema, then the deterministic post-checks. */
import { createStep } from "@mastra/core/workflows";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildDocsSymbolIndex } from "../lib/docs.js";
import { postCheckFindings } from "../lib/judge-checks.js";
import { PROMPTS_ROOT } from "../lib/paths.js";
import { buildJudgePrompt } from "../lib/prompts.js";
import {
  ExtractOutput,
  JudgeOutput,
  JudgeOutputSummary,
  JudgeStepResult,
} from "../lib/schemas.js";
import { acceptance } from "./acceptance.js";
import {
  attemptLabel,
  attemptScope,
  callClaude,
  readCached,
  writeJson,
  writeText,
} from "./shared.js";

const JUDGE_TOOLS = ["Read", "Grep", "Glob"];
const JUDGE_MAX_TURNS = 40;
const JUDGE_WALL_CLOCK_MS = 15 * 60_000;

export function judgeSchemaFile(promptsRoot: string = PROMPTS_ROOT): string {
  return path.join(promptsRoot, "schemas", "judge.schema.json");
}

function summarize(
  result: JudgeStepResult,
  judgePath: string,
): JudgeOutputSummary {
  return {
    judgePath,
    skipped: false,
    rawFindings: result.raw?.findings.length ?? 0,
    kept: result.kept.length,
    dropped: result.dropped.length,
    costUsd: result.claude?.costUsd ?? 0,
  };
}

export const judge = createStep({
  id: "judge",
  inputSchema: ExtractOutput,
  outputSchema: JudgeOutputSummary,
  retries: 0,
  execute: async (params) => {
    const { inputData } = params;
    const { input, ctx, task, run, layout } = attemptScope(
      params.getInitData(),
    );
    const cached = readCached(layout.judgeJson, JudgeStepResult);
    if (cached) return summarize(cached, layout.judgeJson);

    if (inputData.skipped) {
      return {
        judgePath: layout.judgeJson,
        skipped: true,
        rawFindings: 0,
        kept: 0,
        dropped: 0,
        costUsd: 0,
      };
    }

    const tests = params.getStepResult(acceptance);
    const prompts = buildJudgePrompt(
      task,
      {
        taskId: input.taskId,
        arm: input.arm,
        pin: input.pin,
        docsDir: input.docsDir,
        docsIndex: run.docsIndex,
        dtsDir: layout.dtsDir,
        metricsPath: inputData.metricsPath,
        compactPath: inputData.compactPath,
        testsPath: tests.testsPath,
        referenceDir: input.arm === "B" ? layout.referenceDir : undefined,
      },
      ctx.promptsRoot,
    );
    const systemPromptFile = path.join(layout.dir, "judge.system.md");
    writeText(systemPromptFile, prompts.system);

    const outcome = await callClaude(ctx, ctx.judgeDriver, {
      cwd: layout.dir,
      prompt: prompts.task,
      systemPromptFile,
      model: input.args.judgeModel,
      settingsFile: layout.judgeSettingsFile,
      addDirs: [input.docsDir],
      tools: JUDGE_TOOLS,
      permissionMode: "dontAsk",
      maxTurns: JUDGE_MAX_TURNS,
      maxBudgetUsd: task.budgets.judgeUsd,
      wallClockMs: JUDGE_WALL_CLOCK_MS,
      jsonSchemaFile: judgeSchemaFile(ctx.promptsRoot),
      sessionId: randomUUID(),
      authMode: input.args.auth,
      transcriptPath: layout.judgeTranscriptPath,
      stderrPath: layout.judgeStderrPath,
    });

    const parsed = outcome.ok
      ? JudgeOutput.safeParse(outcome.structuredOutput)
      : null;
    const raw = parsed?.success === true ? parsed.data : null;
    const docs = buildDocsSymbolIndex(input.docsDir);
    const checks = raw
      ? postCheckFindings(raw, {
          readDoc: (rel) => {
            const file = path.join(input.docsDir, rel);
            return existsSync(file) ? readFileSync(file, "utf8") : null;
          },
          docHasSymbol: (s) => docs.hasSymbol(s),
        })
      : { kept: [], dropped: [], relabelled: [] };

    const result: JudgeStepResult = { claude: outcome, raw, ...checks };
    writeJson(layout.judgeJson, result);
    ctx.log(
      `${attemptLabel(input)} judge ${outcome.ok ? "ok" : `FAILED (${outcome.failureReason ?? "?"})`} findings=${result.kept.length} dropped=${result.dropped.length} cost=$${(outcome.costUsd ?? 0).toFixed(2)}`,
    );
    return summarize(result, layout.judgeJson);
  },
});
