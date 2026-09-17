import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { WorkflowStreamEvent } from "@mastra/core/workflows";
import {
  MODEL_IDS,
  VALIDATED_CLI_VERSION,
  type ClaudeDriver,
} from "../lib/claude-driver.js";
import { ClaudeCli, parseCliVersion } from "../lib/claude.js";
import { selectTasks, type Task } from "../lib/catalog.js";
import {
  catalogOf,
  clearHarnessContext,
  setHarnessContext,
  type HarnessContext,
} from "../lib/context.js";
import { FakeClaude } from "../lib/fake-claude.js";
import {
  HARNESS_ROOT,
  MONOREPO_ROOT,
  newRunId,
  recipesRoot,
  runLayout,
  RUNS_ROOT,
  STATE_DIR,
  type RunLayout,
} from "../lib/paths.js";
import {
  Arm,
  AttemptStatus,
  RunArgs,
  RunRecord,
  SandboxMode,
  AuthMode,
} from "../lib/schemas.js";
import { Semaphore } from "../lib/semaphore.js";
import { createMastra } from "../mastra/create.js";
import type { HarnessRunInput } from "../workflows/harness-run.js";

const BUILDER_FIXTURE = path.join(
  HARNESS_ROOT,
  "test/fixtures/fake-claude/ok.jsonl",
);
const JUDGE_FIXTURE = path.join(
  HARNESS_ROOT,
  "test/fixtures/workflow/judge-empty.json",
);

interface RunOptions {
  tasks?: string;
  arms: string;
  n: string;
  concurrency: string;
  docsSha: string;
  pin?: string;
  runId?: string;
  dryRun?: boolean;
  sandbox: string;
  auth: string;
  skipVerify?: boolean;
  keepWorkspaces?: boolean;
  allowCliDrift?: boolean;
  builderModel: string;
  judgeModel: string;
  runsRoot: string;
  stateDir: string;
  recipesRoot?: string;
}

interface ResumeOptions {
  runsRoot: string;
  stateDir: string;
  recipesRoot?: string;
  allowCliDrift?: boolean;
}

function positiveInt(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--${name} must be a positive integer, got ${value}`);
  }
  return n;
}

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Dry runs use fixture-backed fakes; real runs share one CLI and one bound. */
function drivers(
  args: RunArgs,
  allowCliDrift: boolean,
): { driver: ClaudeDriver; judgeDriver: ClaudeDriver; semaphore: Semaphore } {
  const semaphore = new Semaphore(args.concurrency);
  if (args.dryRun) {
    return {
      driver: new FakeClaude({ transcriptFixture: BUILDER_FIXTURE }),
      judgeDriver: new FakeClaude({
        transcriptFixture: BUILDER_FIXTURE,
        structuredOutput: JSON.parse(readFileSync(JUDGE_FIXTURE, "utf8")),
      }),
      semaphore,
    };
  }
  // The CLI's own semaphore never contends: callClaude already holds a slot.
  const cli = new ClaudeCli({
    semaphore: new Semaphore(args.concurrency),
    allowVersionDrift: allowCliDrift,
  });
  return { driver: cli, judgeDriver: cli, semaphore };
}

/** A dry run's fake findings stay inside its run directory, never in the committed records. */
function recordFiles(
  layout: RunLayout,
  dryRun: boolean,
): Pick<HarnessContext, "findingsFile" | "runsFile"> {
  if (!dryRun) return {};
  return {
    findingsFile: path.join(layout.root, "FINDINGS.jsonl"),
    runsFile: path.join(layout.root, "RUNS.jsonl"),
  };
}

async function checkCliVersion(
  driver: ClaudeDriver,
  allowCliDrift: boolean,
): Promise<void> {
  const version = parseCliVersion(await driver.version());
  if (version !== VALIDATED_CLI_VERSION && !allowCliDrift) {
    throw new Error(
      `claude ${version} != validated ${VALIDATED_CLI_VERSION}; pass --allow-cli-drift to run anyway`,
    );
  }
}

function matrix(tasks: Task[], arms: Arm[], n: number, skipVerify: boolean) {
  const rows: { task: Task; arm: Arm }[] = [];
  for (const task of tasks) {
    for (const arm of arms) {
      if (task.arms.includes(arm)) rows.push({ task, arm });
    }
  }
  const ceiling = rows.reduce(
    (sum, { task }) =>
      sum +
      n *
        (task.budgets.buildUsd +
          task.budgets.judgeUsd +
          (skipVerify ? 0 : task.budgets.verifyUsd)),
    0,
  );
  return { rows, attempts: rows.length * n, ceiling };
}

function describeChunk(chunk: WorkflowStreamEvent): string | null {
  switch (chunk.type) {
    case "workflow-step-start":
      return chunk.payload.id === "taskRun" ? null : `> ${chunk.payload.id}`;
    case "workflow-step-result":
      return `< ${chunk.payload.id} ${chunk.payload.status}`;
    case "workflow-step-progress": {
      const out = chunk.payload.iterationOutput ?? {};
      const label = `${String(out.taskId)} ${String(out.arm)}#${String(out.n)}`;
      return `[${chunk.payload.completedCount}/${chunk.payload.totalCount}] ${label} ${String(out.status ?? chunk.payload.iterationStatus)}`;
    }
    case "workflow-finish":
      return `workflow ${chunk.payload.workflowStatus}`;
    default:
      return null;
  }
}

/** Drives harnessRun to completion and returns the process exit code. */
async function drive(o: {
  input: HarnessRunInput;
  ctx: HarnessContext;
  stateDir: string;
}): Promise<number> {
  setHarnessContext(o.input.runId, o.ctx);
  const mastra = createMastra(o.stateDir);
  try {
    const workflow = mastra.getWorkflow("harnessRun");
    const run = await workflow.createRun({ runId: o.input.runId });
    const stream = run.stream({ inputData: o.input });
    for await (const chunk of stream.fullStream) {
      const line = describeChunk(chunk);
      if (line !== null) o.ctx.log(line);
    }
    const result = await stream.result;
    if (result.status !== "success") {
      const detail =
        result.status === "failed" ? result.error.message : result.status;
      process.stderr.write(`run ${o.input.runId} ${detail}\n`);
      return 1;
    }
    const s = result.result;
    o.ctx.log(
      `run ${o.input.runId}: ${s.attempts} attempts, ${s.complete} complete, ${s.failed} failed, ${s.contaminated} contaminated, ${s.findingsAppended} findings appended`,
    );
    o.ctx.log(`report ${s.reportPath}`);
    return s.failed > 0 ? 1 : 0;
  } finally {
    clearHarnessContext(o.input.runId);
    await mastra.shutdown().catch(() => undefined);
  }
}

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function runCommand(opts: RunOptions): Promise<never> {
  const args = RunArgs.parse({
    tasks: csv(opts.tasks),
    arms: csv(opts.arms).map((a) => Arm.parse(a)),
    n: positiveInt(opts.n, "n"),
    concurrency: positiveInt(opts.concurrency, "concurrency"),
    dryRun: opts.dryRun === true,
    sandbox: SandboxMode.parse(opts.sandbox),
    auth: AuthMode.parse(opts.auth),
    skipVerify: opts.skipVerify === true,
    keepWorkspaces: opts.keepWorkspaces === true,
    builderModel: opts.builderModel,
    judgeModel: opts.judgeModel,
  });
  if (args.arms.length === 0) throw new Error("--arms must name A, B or A,B");

  const catalog = catalogOf({});
  const tasks = selectTasks(catalog, args.tasks);
  const pin = opts.pin ?? catalog.pin;
  const runId = opts.runId ?? newRunId();
  const layout = runLayout(runId, opts.runsRoot);
  if (existsSync(layout.runJson)) {
    throw new Error(`run ${runId} exists; use resume ${runId}`);
  }

  const { driver, judgeDriver, semaphore } = drivers(
    args,
    opts.allowCliDrift === true,
  );
  await checkCliVersion(driver, opts.allowCliDrift === true);

  const m = matrix(tasks, args.arms, args.n, args.skipVerify);
  log(`run ${runId}${args.dryRun ? " (dry run)" : ""}`);
  log(`pin ${pin}  docs ${opts.docsSha}  concurrency ${args.concurrency}`);
  for (const { task, arm } of m.rows) {
    log(`  ${task.id.padEnd(28)} ${arm} x${args.n}  ${task.acceptance.kind}`);
  }
  log(`${m.attempts} attempts, budget ceiling $${m.ceiling.toFixed(2)}`);

  const code = await drive({
    input: {
      runId,
      tasks: tasks.map((t) => t.id),
      arms: args.arms,
      n: args.n,
      docsSha: opts.docsSha,
      pin,
      args,
    },
    ctx: {
      driver,
      judgeDriver,
      runsRoot: opts.runsRoot,
      recipesRoot: opts.recipesRoot ?? recipesRoot(),
      monorepoRoot: MONOREPO_ROOT,
      ...recordFiles(layout, args.dryRun),
      dryRun: args.dryRun,
      semaphore,
      log,
    },
    stateDir: opts.stateDir,
  });
  // Mastra keeps handles open after the run.
  process.exit(code);
}

async function resumeCommand(
  runId: string,
  opts: ResumeOptions,
): Promise<never> {
  const layout = runLayout(runId, opts.runsRoot);
  if (!existsSync(layout.runJson)) {
    throw new Error(`run ${runId} not found at ${layout.runJson}`);
  }
  const record = RunRecord.parse(
    JSON.parse(readFileSync(layout.runJson, "utf8")),
  );
  const { driver, judgeDriver, semaphore } = drivers(
    record.args,
    opts.allowCliDrift === true,
  );
  await checkCliVersion(driver, opts.allowCliDrift === true);

  const done = record.attempts.filter((a) =>
    AttemptStatus.options.includes(a.status),
  ).length;
  log(
    `resume ${runId}${record.args.dryRun ? " (dry run)" : ""}: ${done} attempts recorded${record.finishedAt ? ", already finished" : ""}`,
  );
  const code = await drive({
    input: {
      runId,
      tasks: record.args.tasks,
      arms: record.args.arms,
      n: record.args.n,
      docsSha: record.docsSha,
      pin: record.pin,
      args: record.args,
    },
    ctx: {
      driver,
      judgeDriver,
      runsRoot: opts.runsRoot,
      recipesRoot: opts.recipesRoot ?? recipesRoot(),
      monorepoRoot: MONOREPO_ROOT,
      ...recordFiles(layout, record.args.dryRun),
      dryRun: record.args.dryRun,
      semaphore,
      log,
    },
    stateDir: opts.stateDir,
  });
  process.exit(code);
}

export function register(program: Command): void {
  program
    .command("run")
    .description("Run the matrix of tasks x arms x n through the workflow")
    .option("--tasks <ids>", "comma-separated task ids (default: all)")
    .option("--arms <arms>", "A, B or A,B", "A,B")
    .option("--n <count>", "attempts per task and arm", "1")
    .option("--concurrency <count>", "parallel attempts", "2")
    .option("--docs-sha <rev>", "docs revision to snapshot", "HEAD")
    .option(
      "--pin <version>",
      "published package version (default: catalog pin)",
    )
    .option("--run-id <id>", "run directory name (default: timestamp)")
    .option("--dry-run", "fixture-backed fakes, no install, no tsc/vitest")
    .option("--sandbox <mode>", "dontAsk | bypass", "dontAsk")
    .option("--auth <mode>", "oauth-isolated | bare", "oauth-isolated")
    .option("--skip-verify", "record judge findings without the verifier")
    .option("--keep-workspaces", "keep each workspace's node_modules")
    .option(
      "--allow-cli-drift",
      "run on a claude version the extractor was not validated against",
    )
    .option("--builder-model <id>", "builder model", MODEL_IDS.builder)
    .option("--judge-model <id>", "judge and verifier model", MODEL_IDS.judge)
    .option("--runs-root <dir>", "runs directory", RUNS_ROOT)
    .option("--state-dir <dir>", "Mastra state directory", STATE_DIR)
    .option("--recipes-root <dir>", "recipes checkout (default: ../recipes)")
    .action((opts: RunOptions) => runCommand(opts));

  program
    .command("resume <runId>")
    .description(
      "Re-drive a run with its recorded args; finished steps are skipped",
    )
    .option("--runs-root <dir>", "runs directory", RUNS_ROOT)
    .option("--state-dir <dir>", "Mastra state directory", STATE_DIR)
    .option("--recipes-root <dir>", "recipes checkout (default: ../recipes)")
    .option(
      "--allow-cli-drift",
      "run on a claude version the extractor was not validated against",
    )
    .action((runId: string, opts: ResumeOptions) => resumeCommand(runId, opts));
}
