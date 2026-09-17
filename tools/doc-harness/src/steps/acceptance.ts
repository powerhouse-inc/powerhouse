/** Hidden tests plus the .d.ts collection the judge reads. */
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { runAcceptance } from "../lib/acceptance.js";
import { AcceptanceOutput, BuildOutput, TestsResult } from "../lib/schemas.js";
import { collectDts } from "../lib/workspace.js";
import {
  attemptLabel,
  attemptScope,
  readCached,
  type TaskRunInput,
  writeJson,
} from "./shared.js";

/** tests.json: TestsResult plus whether the step ran at all. */
export const TestsJson = TestsResult.extend({ skipped: z.boolean() });
export type TestsJson = z.infer<typeof TestsJson>;

function toOutput(json: TestsJson, testsPath: string): AcceptanceOutput {
  return {
    kind: json.kind,
    tscOk: json.tscOk,
    vitestOk: json.vitestOk,
    passed: json.passed,
    failed: json.failed,
    total: json.total,
    timedOut: json.timedOut,
    testsPath,
    skipped: json.skipped,
  };
}

export const acceptance = createStep({
  id: "acceptance",
  inputSchema: BuildOutput,
  outputSchema: AcceptanceOutput,
  retries: 0,
  execute: async (params) => {
    const { inputData } = params;
    const { input, ctx, task, layout } = attemptScope(
      params.getInitData<TaskRunInput>(),
    );
    const cached = readCached(layout.testsJson, TestsJson);
    if (cached) return toOutput(cached, layout.testsJson);

    let json: TestsJson;
    if (inputData.skipped) {
      json = {
        kind: task.acceptance.kind,
        tscOk: null,
        tscOutputPath: null,
        vitestOk: null,
        passed: 0,
        failed: 0,
        total: 0,
        timedOut: false,
        durationMs: 0,
        vitestJsonPath: null,
        skipped: true,
      };
    } else {
      const result = await runAcceptance({
        task,
        layout,
        timeoutMs: task.timeouts.acceptanceMs,
        pinnedRoot: ctx.pinnedRoot,
        dryRun: ctx.dryRun,
      });
      const dts = collectDts(layout.workspaceDir, task.packages, layout.dtsDir);
      ctx.log(
        `${attemptLabel(input)} acceptance ${result.kind} tsc=${String(result.tscOk)} tests ${result.passed}/${result.total}${result.timedOut ? " TIMEOUT" : ""} dts=${dts}`,
      );
      json = { ...result, skipped: false };
    }
    writeJson(layout.testsJson, json);
    return toOutput(json, layout.testsJson);
  },
});
