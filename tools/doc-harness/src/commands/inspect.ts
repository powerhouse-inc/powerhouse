import type { Command } from "commander";
import { STATE_DIR } from "../lib/paths.js";
import { createMastra } from "../mastra/create.js";

interface Options {
  stateDir: string;
}

/** What listWorkflowRuns() returns; its declared type does not resolve under eslint. */
type ListedRuns = {
  runs: { runId: string; snapshot: unknown; createdAt: Date | string }[];
  total: number;
};

const OUTPUT_CHARS = 120;

function oneLine(value: unknown): string {
  if (value === undefined) return "";
  const text = JSON.stringify(value);
  return text.length > OUTPUT_CHARS
    ? `${text.slice(0, OUTPUT_CHARS - 3)}...`
    : text;
}

function snapshotStatus(snapshot: unknown): string {
  let value = snapshot;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return "?";
    }
  }
  if (typeof value === "object" && value !== null && "status" in value) {
    return String((value as { status: unknown }).status);
  }
  return "?";
}

function iso(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : String(date);
}

async function inspect(
  runId: string | undefined,
  opts: Options,
): Promise<number> {
  const mastra = createMastra(opts.stateDir);
  try {
    const workflow = mastra.getWorkflow("harnessRun");
    if (runId === undefined) {
      const listed: unknown = await workflow.listWorkflowRuns();
      const { runs, total } = listed as ListedRuns;
      process.stdout.write(`${total} harnessRun runs\n`);
      for (const run of runs) {
        process.stdout.write(
          `${run.runId.padEnd(24)} ${snapshotStatus(run.snapshot).padEnd(10)} ${iso(run.createdAt)}\n`,
        );
      }
      return 0;
    }

    const state = await workflow.getWorkflowRunById(runId);
    if (state === null) {
      process.stderr.write(`run ${runId} not found in ${opts.stateDir}\n`);
      return 1;
    }
    process.stdout.write(
      `${state.runId} ${state.status} created ${iso(state.createdAt)} updated ${iso(state.updatedAt)}\n`,
    );
    if (state.error) process.stdout.write(`error: ${state.error.message}\n`);
    for (const [id, entry] of Object.entries(state.steps ?? {})) {
      const results = Array.isArray(entry) ? entry : [entry];
      results.forEach((step, i) => {
        const label = results.length > 1 ? `${id}[${i}]` : id;
        const output: unknown = "output" in step ? step.output : undefined;
        process.stdout.write(
          `${label.padEnd(36)} ${step.status.padEnd(10)} ${oneLine(output)}\n`,
        );
      });
    }
    return 0;
  } finally {
    await mastra.shutdown().catch(() => undefined);
  }
}

export function register(program: Command): void {
  program
    .command("inspect [runId]")
    .description("List harnessRun runs in the Mastra store, or one run's steps")
    .option("--state-dir <dir>", "Mastra state directory", STATE_DIR)
    .action(async (runId: string | undefined, opts: Options) => {
      const code = await inspect(runId, opts);
      // Mastra keeps handles open.
      process.exit(code);
    });
}
