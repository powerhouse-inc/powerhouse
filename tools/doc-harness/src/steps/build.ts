/** The builder `claude -p`; skipped when the install failed. */
import { createStep } from "@mastra/core/workflows";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { z } from "zod";
import { costLabel, totalTokens } from "../lib/attempt-status.js";
import {
  BuildOutput,
  ClaudeOutcome,
  PrepareWorkspaceOutput,
} from "../lib/schemas.js";
import {
  attemptLabel,
  attemptScope,
  type TaskRunInput,
  callClaude,
  readCached,
  writeJson,
} from "./shared.js";

const BUILDER_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];

/** build.json: the step output plus the driver's full outcome. */
export const BuildJson = BuildOutput.extend({
  claude: ClaudeOutcome.nullable(),
});
export type BuildJson = z.infer<typeof BuildJson>;

function stripClaude(json: BuildJson): BuildOutput {
  const { claude: _claude, ...out } = json;
  return out;
}

export const build = createStep({
  id: "build",
  inputSchema: PrepareWorkspaceOutput,
  outputSchema: BuildOutput,
  retries: 0,
  execute: async (params) => {
    const { inputData } = params;
    const scope = attemptScope(params.getInitData<TaskRunInput>());
    const { input, ctx, task, layout } = scope;
    const cached = readCached(layout.buildJson, BuildJson);
    if (cached) return stripClaude(cached);

    if (!inputData.installOk) {
      const skipped: BuildJson = {
        ok: false,
        skipped: true,
        failureReason: null,
        transcriptPath: null,
        sessionJsonlPath: null,
        costUsd: 0,
        durationMs: 0,
        turns: null,
        exitCode: null,
        killedByWallClock: false,
        tokens: null,
        apiRetries: 0,
        claude: null,
      };
      writeJson(layout.buildJson, skipped);
      return stripClaude(skipped);
    }

    const outcome = await callClaude(ctx, ctx.driver, {
      cwd: layout.workspaceDir,
      prompt: readFileSync(layout.taskPromptFile, "utf8"),
      systemPromptFile: layout.systemPromptFile,
      model: input.args.builderModel,
      settingsFile: layout.settingsFile,
      addDirs: [input.docsDir],
      tools: BUILDER_TOOLS,
      permissionMode:
        input.args.sandbox === "bypass" ? "bypassPermissions" : "dontAsk",
      maxTurns: task.budgets.maxTurns,
      maxBudgetUsd: task.budgets.buildUsd,
      wallClockMs: task.timeouts.buildMs,
      sessionId: randomUUID(),
      authMode: input.args.auth,
      transcriptPath: layout.transcriptPath,
      stderrPath: layout.stderrPath,
      sessionJsonlCopyPath: layout.sessionJsonlPath,
    });
    const retries =
      outcome.apiRetries > 0 ? ` apiRetries=${outcome.apiRetries}` : "";
    const stalled =
      outcome.stalledMs === null ? "" : ` stalled=${outcome.stalledMs}ms`;
    ctx.log(
      `${attemptLabel(input)} build ${outcome.ok ? "ok" : `FAILED (${outcome.failureReason ?? "?"})`} turns=${outcome.turns ?? "?"} ${costLabel(outcome)} ${outcome.durationMs}ms${retries}${stalled}`,
    );

    const json: BuildJson = {
      ok: outcome.ok,
      skipped: false,
      failureReason: outcome.failureReason ?? null,
      transcriptPath: outcome.transcriptPath,
      sessionJsonlPath: outcome.sessionJsonlPath,
      costUsd: outcome.costUsd ?? 0,
      durationMs: outcome.durationMs,
      turns: outcome.turns,
      exitCode: outcome.exitCode,
      killedByWallClock: outcome.killedByWallClock,
      tokens: totalTokens(outcome.tokens),
      apiRetries: outcome.apiRetries,
      claude: outcome,
    };
    writeJson(layout.buildJson, json);
    return stripClaude(json);
  },
});
