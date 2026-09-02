import { readFileSync } from "node:fs";
import { RecordsError } from "./jsonl-store.js";
import type { CommandResult } from "./records-commands.js";
import { runRecordsCommand } from "./records-commands.js";
import type { RecordsOptions } from "./records-options.js";
import {
  parseRecordsOptions,
  RECORDS_EXIT,
  RECORDS_USAGE,
} from "./records-options.js";

function readInput(source: string): string {
  return source === "-"
    ? readFileSync(0, "utf8")
    : readFileSync(source, "utf8");
}

function report(options: RecordsOptions, result: CommandResult): void {
  if (options.json) {
    console.log(JSON.stringify({ ok: result.exit === 0, ...result.data }));
    return;
  }

  for (const line of result.lines) {
    if (result.exit === RECORDS_EXIT.ok) {
      console.log(line);
    } else {
      console.error(line);
    }
  }
}

function reportFailure(
  options: RecordsOptions,
  message: string,
  exitCode: number,
): void {
  if (options.json) {
    console.log(JSON.stringify({ ok: false, exit: exitCode, message }));
    return;
  }
  console.error(message);
}

function main(): void {
  let options: RecordsOptions;
  try {
    options = parseRecordsOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${RECORDS_USAGE}`);
    process.exit(RECORDS_EXIT.usage);
  }

  let result: CommandResult;
  try {
    result = runRecordsCommand(options, {
      readInput,
      now: () => new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof RecordsError) {
      reportFailure(options, error.message, error.exitCode);
      process.exit(error.exitCode);
    }
    reportFailure(
      options,
      error instanceof Error ? error.message : String(error),
      RECORDS_EXIT.error,
    );
    process.exit(RECORDS_EXIT.error);
  }

  report(options, result);
  process.exit(result.exit);
}

main();
