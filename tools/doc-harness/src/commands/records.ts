import type { Command } from "commander";
import path from "node:path";
import type { ZodType } from "zod";
import { readEntries, summarizeFindings, verifyFile } from "../lib/findings.js";
import { FINDINGS_FILE, RUNS_FILE } from "../lib/paths.js";
import { FindingRecord, RunRecord, VerifyStatus } from "../lib/schemas.js";

function report<T>(file: string, schema: ZodType<T>): number {
  const { count, problems } = verifyFile(file, schema);
  process.stdout.write(
    `${path.basename(file)}: ${count} entries, ${problems.length} problems\n`,
  );
  for (const p of problems) {
    process.stdout.write(`line ${p.line}: ${p.message}\n`);
  }
  return problems.length;
}

export function register(program: Command): void {
  const records = program
    .command("records")
    .description("Inspect FINDINGS.jsonl and RUNS.jsonl");

  records
    .command("verify")
    .description("Schema-check every line of both files")
    .action(() => {
      const problems =
        report(FINDINGS_FILE, FindingRecord) + report(RUNS_FILE, RunRecord);
      if (problems > 0) process.exitCode = 2;
    });

  records
    .command("show <key>")
    .description("Print every finding record with this key, one JSON per line")
    .action((key: string) => {
      const { entries } = readEntries(FINDINGS_FILE, FindingRecord);
      const matching = entries.filter((r) => r.key === key);
      for (const r of matching) {
        process.stdout.write(`${JSON.stringify(r)}\n`);
      }
      if (matching.length === 0) process.exitCode = 1;
    });

  records
    .command("summary")
    .description("Findings grouped by key, most recurrent first")
    .action(() => {
      const { entries } = readEntries(FINDINGS_FILE, FindingRecord);
      const rows = summarizeFindings(entries);
      const header = [
        "key".padEnd(12),
        "kind".padEnd(7),
        "occ".padStart(4),
        ...VerifyStatus.options.map((s) => s.slice(0, 3).padStart(4)),
        "docPath",
        "symbol",
      ].join(" ");
      process.stdout.write(`${header}\n`);
      for (const row of rows) {
        const line = [
          row.key.padEnd(12),
          row.kind.padEnd(7),
          String(row.occurrences).padStart(4),
          ...VerifyStatus.options.map((s) =>
            String(row.statuses[s]).padStart(4),
          ),
          row.docPath ?? "-",
          row.symbol,
        ].join(" ");
        process.stdout.write(`${line}\n`);
      }
    });
}
