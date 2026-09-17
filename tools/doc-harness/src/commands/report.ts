import type { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadCatalog, type Task } from "../lib/catalog.js";
import { readEntries } from "../lib/findings.js";
import { FINDINGS_FILE, RUNS_ROOT, runLayout } from "../lib/paths.js";
import {
  loadAttemptMetrics,
  loadPhLoraMapping,
  renderReport,
  type PhLoraMapping,
} from "../lib/report.js";
import { FindingRecord, RunRecord } from "../lib/schemas.js";

export interface ReportInput {
  runId: string;
  runsRoot?: string;
  findingsFile?: string;
  out?: string;
  /** Overrides; the command loads the catalog and mapping, tolerating failure. */
  tasks?: Pick<Task, "id" | "docSections">[];
  mapping?: PhLoraMapping;
}

function tryLoad<T>(load: () => T): T | undefined {
  try {
    return load();
  } catch {
    return undefined;
  }
}

/** Writes REPORT.md and returns its path. */
export function writeReport(input: ReportInput): string {
  const layout = runLayout(input.runId, input.runsRoot ?? RUNS_ROOT);
  if (!existsSync(layout.runJson)) {
    throw new Error(`run ${input.runId} not found at ${layout.runJson}`);
  }
  const run = RunRecord.parse(JSON.parse(readFileSync(layout.runJson, "utf8")));

  const { entries, problems } = readEntries(
    input.findingsFile ?? FINDINGS_FILE,
    FindingRecord,
  );
  for (const p of problems) {
    process.stderr.write(`FINDINGS.jsonl line ${p.line}: ${p.message}\n`);
  }
  const findings = entries.filter((f) => f.runId === run.runId);

  const tasks = input.tasks ?? tryLoad(() => loadCatalog().tasks);
  const mapping = input.mapping ?? tryLoad(() => loadPhLoraMapping());
  const markdown = renderReport(run, findings, {
    tasks,
    mapping,
    metrics: (summary) => loadAttemptMetrics(layout, summary),
  });

  const target = input.out ?? layout.reportMd;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, markdown);
  return target;
}

export function register(program: Command): void {
  program
    .command("report <runId>")
    .description(
      "Render runs/<runId>/REPORT.md from run.json and FINDINGS.jsonl",
    )
    .option("--out <file>", "where to write (default runs/<runId>/REPORT.md)")
    .option("--runs-root <dir>", "runs directory", RUNS_ROOT)
    .action((runId: string, opts: { out?: string; runsRoot: string }) => {
      const target = writeReport({
        runId,
        out: opts.out,
        runsRoot: opts.runsRoot,
      });
      process.stdout.write(`${target}\n`);
    });
}
