/** The whole run: docs snapshot, matrix, attempts in parallel, summary. */
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { existsSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { catalogHash, selectTasks } from "../lib/catalog.js";
import { parseCliVersion } from "../lib/claude.js";
import { catalogOf, getHarnessContext } from "../lib/context.js";
import { snapshotDocs, writeDocsIndex } from "../lib/docs.js";
import { appendRun } from "../lib/findings.js";
import { CATALOG_FILE, reportUrl, runLayout } from "../lib/paths.js";
import { writeReport } from "../commands/report.js";
import { Arm, AttemptSummary, RunArgs, RunRecord } from "../lib/schemas.js";
import { readCached, readJson, writeJson } from "../steps/shared.js";
import { TaskRunInput, TaskRunOutput, taskRun } from "./task-run.js";

export const HarnessRunInput = z.object({
  runId: z.string(),
  tasks: z.array(z.string()),
  arms: z.array(Arm),
  n: z.number().int().positive(),
  /** Any revision git resolves. */
  docsSha: z.string(),
  pin: z.string(),
  args: RunArgs,
});
export type HarnessRunInput = z.infer<typeof HarnessRunInput>;

const SnapshotOutput = z.object({
  docsDir: z.string(),
  docsSha: z.string(),
  docsHash: z.string(),
  fileCount: z.number(),
  cliVersion: z.string(),
  catalogHash: z.string(),
});

export const HarnessRunOutput = z.object({
  attempts: z.number(),
  complete: z.number(),
  /** complete attempts whose build hit its budget before finishing. */
  truncated: z.number(),
  failed: z.number(),
  /** Builders killed while the CLI retried the API; `resume --redo-failed` redoes them. */
  rateLimited: z.number(),
  contaminated: z.number(),
  findingsAppended: z.number(),
  reportPath: z.string(),
  reportUrl: z.string(),
});
export type HarnessRunOutput = z.infer<typeof HarnessRunOutput>;

const snapshotDocsStep = createStep({
  id: "snapshotDocs",
  inputSchema: HarnessRunInput,
  outputSchema: SnapshotOutput,
  retries: 0,
  execute: async (params) => {
    const { inputData } = params;
    const ctx = getHarnessContext(inputData.runId, inputData.args);
    const run = runLayout(inputData.runId, ctx.runsRoot);

    // run.json without an INDEX.md means the snapshot did not finish: redo it.
    const existing = readCached(run.runJson, RunRecord);
    if (existing && existsSync(run.docsIndex)) {
      return {
        docsDir: run.docsDir,
        docsSha: existing.docsSha,
        docsHash: existing.docsHash,
        fileCount: existing.docsFileCount,
        cliVersion: existing.cliVersion,
        catalogHash: existing.catalogHash,
      };
    }

    mkdirSync(run.root, { recursive: true });
    const snapshot = await snapshotDocs({
      monorepoRoot: ctx.monorepoRoot,
      sha: inputData.docsSha,
      outDir: run.docsDir,
    });
    writeDocsIndex(run.docsDir);
    const cliVersion = parseCliVersion(await ctx.driver.version());
    const hash = catalogHash(ctx.catalogFile ?? CATALOG_FILE);
    const record: RunRecord = {
      runId: inputData.runId,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      finishedAt: null,
      cliVersion,
      docsSha: snapshot.sha,
      docsHash: snapshot.hash,
      docsFileCount: snapshot.fileCount,
      pin: inputData.pin,
      catalogHash: hash,
      args: inputData.args,
      attempts: [],
    };
    writeJson(run.runJson, record);
    ctx.log(
      `docs ${snapshot.sha.slice(0, 12)} ${snapshot.fileCount} files -> ${run.docsDir}`,
    );
    return {
      docsDir: run.docsDir,
      docsSha: snapshot.sha,
      docsHash: snapshot.hash,
      fileCount: snapshot.fileCount,
      cliVersion,
      catalogHash: hash,
    };
  },
});

const expandMatrix = createStep({
  id: "expandMatrix",
  inputSchema: SnapshotOutput,
  outputSchema: z.object({ attempts: z.array(TaskRunInput) }),
  retries: 0,
  execute: (params) => {
    const { inputData } = params;
    const init = params.getInitData<HarnessRunInput>();
    const ctx = getHarnessContext(init.runId, init.args);
    const attempts: TaskRunInput[] = [];
    for (const task of selectTasks(catalogOf(ctx), init.tasks)) {
      for (const arm of init.arms) {
        if (!task.arms.includes(arm)) continue;
        for (let n = 1; n <= init.n; n += 1) {
          attempts.push({
            runId: init.runId,
            taskId: task.id,
            arm,
            n,
            docsDir: inputData.docsDir,
            docsSha: inputData.docsSha,
            pin: init.pin,
            cliVersion: inputData.cliVersion,
            args: init.args,
          });
        }
      }
    }
    return Promise.resolve({ attempts });
  },
});

const summarize = createStep({
  id: "summarize",
  inputSchema: z.array(TaskRunOutput),
  outputSchema: HarnessRunOutput,
  retries: 0,
  execute: (params) => {
    const { inputData } = params;
    const init = params.getInitData<HarnessRunInput>();
    const ctx = getHarnessContext(init.runId, init.args);
    const run = runLayout(init.runId, ctx.runsRoot);

    const record = readJson(run.runJson, RunRecord);
    const alreadyFinished = record.finishedAt !== null;
    record.attempts = inputData.map((o) =>
      readJson(o.attemptPath, AttemptSummary),
    );
    record.finishedAt ??= new Date().toISOString();
    writeJson(run.runJson, record);
    // One RUNS.jsonl line per run, however often it is re-driven.
    if (!alreadyFinished) appendRun(record, ctx.runsFile);

    const reportPath = writeReport({
      runId: init.runId,
      runsRoot: ctx.runsRoot,
      findingsFile: ctx.findingsFile,
      tasks: catalogOf(ctx).tasks,
    });

    const count = (pred: (a: AttemptSummary) => boolean) =>
      record.attempts.filter(pred).length;
    return Promise.resolve({
      attempts: record.attempts.length,
      complete: count((a) => a.status === "complete"),
      truncated: count((a) => a.status === "complete" && a.truncated),
      failed: count(
        (a) => a.status === "build-fail" || a.status === "infra-fail",
      ),
      rateLimited: count((a) => a.status === "rate-limited"),
      contaminated: count((a) => a.contaminated),
      findingsAppended: inputData.reduce((s, o) => s + o.findingsAppended, 0),
      reportPath,
      reportUrl: reportUrl(init.runId),
    });
  },
});

export const harnessRun = createWorkflow({
  id: "harnessRun",
  inputSchema: HarnessRunInput,
  outputSchema: HarnessRunOutput,
  options: { autoRestartActiveRuns: false },
})
  .then(snapshotDocsStep)
  .then(expandMatrix)
  // foreach needs the previous output to be the array itself.
  .map(({ inputData }) => Promise.resolve(inputData.attempts))
  .foreach(taskRun, {
    concurrency: ({ getInitData }) =>
      HarnessRunInput.parse(getInitData()).args.concurrency,
  })
  .then(summarize)
  .commit();
