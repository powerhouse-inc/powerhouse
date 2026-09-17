/** attempt.json, the FINDINGS.jsonl lines, and the workspace cleanup. */
import { createStep } from "@mastra/core/workflows";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { attemptStatus, isTruncated } from "../lib/attempt-status.js";
import { appendFindings, toFindingRecord } from "../lib/findings.js";
import {
  type AcceptanceOutput,
  Arm,
  AttemptSummary,
  JudgeStepResult,
  Metrics,
  RecordOutput,
  VerifyOutputSummary,
  VerifyStepResult,
  type EscapeKind,
  type FindingRecord,
} from "../lib/schemas.js";
import { acceptance } from "./acceptance.js";
import { build } from "./build.js";
import { extract } from "./extract.js";
import { judge } from "./judge.js";
import { prepareWorkspace } from "./prepare-workspace.js";
import {
  attemptLabel,
  attemptScope,
  type TaskRunInput,
  readCached,
  readJson,
  writeJson,
} from "./shared.js";

export const TaskRunOutput = RecordOutput.extend({
  taskId: z.string(),
  arm: Arm,
  n: z.number(),
});
export type TaskRunOutput = z.infer<typeof TaskRunOutput>;

export const record = createStep({
  id: "record",
  inputSchema: VerifyOutputSummary,
  outputSchema: TaskRunOutput,
  retries: 0,
  execute: (params) => {
    const { inputData } = params;
    const { input, ctx, layout } = attemptScope(
      params.getInitData<TaskRunInput>(),
    );
    const ids = { taskId: input.taskId, arm: input.arm, n: input.n };
    const cached = readCached(layout.attemptJson, AttemptSummary);
    if (cached) {
      return Promise.resolve({
        attemptPath: layout.attemptJson,
        status: cached.status,
        findingsAppended: 0,
        ...ids,
      });
    }

    const prepared = params.getStepResult(prepareWorkspace);
    const built = params.getStepResult(build);
    const tests = params.getStepResult(acceptance);
    const extracted = params.getStepResult(extract);
    const judged = params.getStepResult(judge);
    const verified = inputData;
    const metrics = readCached(layout.metricsJson, Metrics);

    const status = attemptStatus({
      installOk: prepared.installOk,
      buildSkipped: built.skipped,
      buildOk: built.ok,
      buildFailureReason: built.failureReason,
      contaminated: extracted.contaminated,
    });

    const escapes: Partial<Record<EscapeKind, number>> = {};
    for (const e of metrics?.escapes ?? []) {
      escapes[e.kind] = (escapes[e.kind] ?? 0) + 1;
    }

    const summary: AttemptSummary = {
      ...ids,
      status,
      buildOk: built.ok,
      buildFailureReason: built.failureReason,
      tscOk: tests.tscOk,
      acceptanceOk: acceptanceVerdict(tests),
      testsPassed: tests.passed,
      testsTotal: tests.total,
      turns: built.turns,
      costUsd: built.costUsd + judged.costUsd + verified.costUsd,
      durationMs: built.durationMs,
      escapes,
      docPagesRead: extracted.docPagesRead,
      contaminated: extracted.contaminated,
      findingsKept: judged.kept,
      findingsVerified: verified.verified,
      findingsRefuted: verified.refuted,
      truncated: isTruncated({
        buildOk: built.ok,
        buildFailureReason: built.failureReason,
      }),
      buildTokens: built.tokens,
      judgeFailed: judged.failureReason,
    };

    let findingsAppended = 0;
    if (
      !summary.contaminated &&
      status !== "rate-limited" &&
      !verified.skipped
    ) {
      const { kept } = readJson(layout.judgeJson, JudgeStepResult);
      const { results } = readJson(layout.verifyJson, VerifyStepResult);
      const recordedAt = new Date().toISOString();
      const records: FindingRecord[] = [];
      for (const r of results) {
        const finding = kept.at(r.index);
        if (finding === undefined) continue;
        records.push(
          toFindingRecord(finding, r, {
            runId: input.runId,
            ...ids,
            docsSha: input.docsSha,
            pin: input.pin,
            cliVersion: input.cliVersion,
            recordedAt,
          }),
        );
      }
      findingsAppended = appendFindings(records, ctx.findingsFile);
    }

    writeJson(layout.attemptJson, summary);

    // node_modules is the bulk of an attempt; the sources stay for inspection.
    if (!input.args.keepWorkspaces) {
      const modules = path.join(layout.workspaceDir, "node_modules");
      if (existsSync(modules))
        rmSync(modules, { recursive: true, force: true });
    }
    ctx.log(
      `${attemptLabel(input)} ${status}${summary.truncated ? " (truncated)" : ""}${summary.judgeFailed ? ` judge=${summary.judgeFailed}` : ""} findings=${summary.findingsKept} appended=${findingsAppended} cost=$${summary.costUsd.toFixed(2)}`,
    );
    return Promise.resolve({
      attemptPath: layout.attemptJson,
      status,
      findingsAppended,
      ...ids,
    });
  },
});

/** tsc-only grades on tsc; vitest needs a report with tests and no failures. */
function acceptanceVerdict(tests: AcceptanceOutput): boolean | null {
  if (tests.skipped || tests.kind === "none") return null;
  if (tests.kind === "tsc-only") return tests.tscOk;
  // vitest never ran (dry run, or tsc timed out first): not graded.
  if (tests.vitestOk === null && tests.tscOk === null) return null;
  return (
    tests.tscOk !== false &&
    tests.vitestOk === true &&
    tests.suiteErrors === 0 &&
    tests.total > 0 &&
    tests.failed === 0
  );
}
