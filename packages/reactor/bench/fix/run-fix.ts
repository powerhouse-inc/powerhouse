import { RecordsError } from "../records/jsonl-store.js";
import type { CommandResult } from "../records/records-commands.js";
import { runCases, runCompare, runCriterion } from "./fix-bench.js";
import { runCi } from "./fix-ci.js";
import { runDistCheck } from "./fix-dist.js";
import { runGate } from "./fix-gate.js";
import { FIX_EXIT, FIX_USAGE, parseFixOptions } from "./fix-options.js";
import type { FixOptions } from "./fix-options.js";
import { runSites } from "./fix-sites.js";

function wantsJson(options: FixOptions): boolean {
  return "json" in options && options.json;
}

function report(options: FixOptions, result: CommandResult): void {
  if (wantsJson(options)) {
    console.log(JSON.stringify({ ok: result.exit === 0, ...result.data }));
    return;
  }
  for (const line of result.lines) {
    console.log(line);
  }
}

async function dispatch(options: FixOptions): Promise<CommandResult> {
  switch (options.subcommand) {
    case "gate":
      return runGate(options);
    case "sites":
      return runSites(options);
    case "cases":
      return runCases(options);
    case "criterion":
      return runCriterion(options);
    case "compare":
      return runCompare(options);
    case "dist-check":
      return runDistCheck(options);
    case "ci":
      return runCi(options);
  }
}

async function main(): Promise<void> {
  let options: FixOptions;
  try {
    options = parseFixOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${FIX_USAGE}`);
    process.exit(FIX_EXIT.usage);
  }

  let result: CommandResult;
  try {
    result = await dispatch(options);
  } catch (error) {
    const exit =
      error instanceof RecordsError ? error.exitCode : FIX_EXIT.error;
    const message = error instanceof Error ? error.message : String(error);
    if (wantsJson(options)) {
      console.log(JSON.stringify({ ok: false, exit, message }));
    } else {
      console.error(message);
    }
    process.exit(exit);
  }

  report(options, result);
  process.exit(result.exit);
}

void main();
