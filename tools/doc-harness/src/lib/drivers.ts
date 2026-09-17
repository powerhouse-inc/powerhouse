/**
 * Builds the drivers and the default run context. The CLI registers a
 * context per run; a run started from Mastra Studio has no CLI, so the steps
 * fall back to this default, built from the workflow's own RunArgs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClaudeDriver } from "./claude-driver.js";
import { ClaudeCli } from "./claude.js";
import type { HarnessContext } from "./context.js";
import { FakeClaude } from "./fake-claude.js";
import {
  HARNESS_ROOT,
  MONOREPO_ROOT,
  recipesRoot,
  runLayout,
  RUNS_ROOT,
  type RunLayout,
} from "./paths.js";
import type { RunArgs } from "./schemas.js";
import { Semaphore } from "./semaphore.js";

export const BUILDER_FIXTURE = path.join(
  HARNESS_ROOT,
  "test/fixtures/fake-claude/ok.jsonl",
);
export const JUDGE_FIXTURE = path.join(
  HARNESS_ROOT,
  "test/fixtures/workflow/judge-empty.json",
);

export interface Drivers {
  driver: ClaudeDriver;
  judgeDriver: ClaudeDriver;
  semaphore: Semaphore;
}

/** Dry runs use fixture-backed fakes; real runs share one CLI and one bound. */
export function createDrivers(args: RunArgs, allowCliDrift: boolean): Drivers {
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
export function recordFiles(
  layout: RunLayout,
  dryRun: boolean,
): Pick<HarnessContext, "findingsFile" | "runsFile"> {
  if (!dryRun) return {};
  return {
    findingsFile: path.join(layout.root, "FINDINGS.jsonl"),
    runsFile: path.join(layout.root, "RUNS.jsonl"),
  };
}

export interface DefaultContextOptions {
  runsRoot?: string;
  recipesRoot?: string;
  allowCliDrift?: boolean;
  log?: (line: string) => void;
}

/** What a run gets when nothing registered a context for it (Studio, tests). */
export function defaultHarnessContext(
  runId: string,
  args: RunArgs,
  opts: DefaultContextOptions = {},
): HarnessContext {
  const runsRoot = opts.runsRoot ?? RUNS_ROOT;
  return {
    ...createDrivers(args, opts.allowCliDrift ?? false),
    ...recordFiles(runLayout(runId, runsRoot), args.dryRun),
    runsRoot,
    recipesRoot: opts.recipesRoot ?? recipesRoot(),
    monorepoRoot: MONOREPO_ROOT,
    dryRun: args.dryRun,
    log: opts.log ?? ((line) => process.stderr.write(`${line}\n`)),
  };
}
