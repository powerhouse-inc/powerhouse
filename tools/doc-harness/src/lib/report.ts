/**
 * REPORT.md for one run: attempts, pass rates, doc-escape headline, findings
 * by recurrence, and doc coverage against the ph-lora section mapping.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Task } from "./catalog.js";
import { summarizeFindings } from "./findings.js";
import { MONOREPO_ROOT, type RunLayout } from "./paths.js";
import {
  Arm,
  EscapeKind,
  Metrics,
  type AttemptSummary,
  type FindingRecord,
  type RunRecord,
  type VerifyStatus,
} from "./schemas.js";

/* --------------------------------------------------------- ph-lora map */

/** The subset of test/ph-lora/ph-lora-mapping.json the report reads. */
export const PhLoraMapping = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      /** e.g. docs/academy/04-Reference/01-Reactor, relative to apps/academy. */
      docPath: z.string(),
    }),
  ),
});
export type PhLoraMapping = z.infer<typeof PhLoraMapping>;

export const PH_LORA_MAPPING_FILE = path.join(
  MONOREPO_ROOT,
  "test/ph-lora/ph-lora-mapping.json",
);

export function loadPhLoraMapping(
  file: string = PH_LORA_MAPPING_FILE,
): PhLoraMapping {
  return PhLoraMapping.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Mapping docPath -> path relative to the docs snapshot root. */
export function sectionRel(docPath: string): string {
  return docPath.replace(/^docs\/academy\/?/, "").replace(/\/+$/, "");
}

/* ------------------------------------------------------------- metrics */

/** metrics.json for one attempt; null when absent or unreadable. */
export function loadAttemptMetrics(
  layout: RunLayout,
  summary: Pick<AttemptSummary, "taskId" | "arm" | "n">,
): Metrics | null {
  const file = layout.attempt(
    summary.taskId,
    summary.arm,
    summary.n,
  ).metricsJson;
  if (!existsSync(file)) return null;
  try {
    return Metrics.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- helpers */

export interface ReportOptions {
  mapping?: PhLoraMapping;
  /** Catalog tasks, for docSections; tasks not listed get no coverage rows. */
  tasks?: Pick<Task, "id" | "docSections">[];
  /** Per-attempt metrics; defaults to none (coverage then reports unknown). */
  metrics?: (summary: AttemptSummary) => Metrics | null;
}

function passed(a: AttemptSummary): boolean {
  return a.status === "complete" && a.buildOk && a.acceptanceOk !== false;
}

function pct(num: number, den: number): string {
  return den === 0
    ? "n/a"
    : `${Math.round((num / den) * 100)}% (${num}/${den})`;
}

function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function mean(values: number[]): string {
  if (values.length === 0) return "-";
  return (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
}

function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

function escapeTotals(attempts: AttemptSummary[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const kind of EscapeKind.options) totals[kind] = 0;
  for (const a of attempts) {
    for (const [kind, count] of Object.entries(a.escapes)) {
      totals[kind] = (totals[kind] ?? 0) + count;
    }
  }
  return totals;
}

function escapeCell(totals: Record<string, number>): string {
  const parts = Object.entries(totals)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}: ${n}`);
  return parts.length === 0 ? "none" : parts.join(", ");
}

const STATUS_ORDER: VerifyStatus[] = ["VERIFIED", "REFUTED", "UNVERIFIED"];

/* -------------------------------------------------------------- render */

export function renderReport(
  run: RunRecord,
  findings: FindingRecord[],
  opts: ReportOptions = {},
): string {
  const clean = run.attempts.filter((a) => !a.contaminated);
  const arms = Arm.options.filter((arm) =>
    run.attempts.some((a) => a.arm === arm),
  );
  const taskIds = [...new Set(run.attempts.map((a) => a.taskId))].sort();
  const out: string[] = [];

  out.push(`# doc-harness report: ${run.runId}`, "");
  out.push(
    `- docsSha: \`${run.docsSha}\` (${run.docsFileCount} files, hash \`${run.docsHash}\`)`,
    `- pin: \`${run.pin}\``,
    `- cliVersion: \`${run.cliVersion}\``,
    `- catalogHash: \`${run.catalogHash}\``,
    `- started: ${run.startedAt}; finished: ${run.finishedAt ?? "(unfinished)"}`,
    `- args: tasks ${run.args.tasks.join(",") || "(all)"}; arms ${run.args.arms.join(",")}; n ${run.args.n}; concurrency ${run.args.concurrency}; sandbox ${run.args.sandbox}; auth ${run.args.auth}; builder ${run.args.builderModel}; judge ${run.args.judgeModel}${run.args.dryRun ? "; dry run" : ""}${run.args.skipVerify ? "; verify skipped" : ""}`,
    `- attempts: ${run.attempts.length} (${run.attempts.length - clean.length} contaminated, excluded from rates)`,
    "",
  );

  out.push("## Attempts", "");
  const attemptRows: string[][] = [];
  for (const taskId of taskIds) {
    for (const arm of arms) {
      const cell = run.attempts.filter(
        (a) => a.taskId === taskId && a.arm === arm,
      );
      if (cell.length === 0) continue;
      const totals = escapeTotals(cell);
      attemptRows.push([
        taskId,
        arm,
        String(cell.length),
        `${cell.filter((a) => a.buildOk).length}/${cell.length}`,
        `${cell.reduce((s, a) => s + a.testsPassed, 0)}/${cell.reduce((s, a) => s + a.testsTotal, 0)}`,
        mean(cell.flatMap((a) => (a.turns === null ? [] : [a.turns]))),
        money(cell.reduce((s, a) => s + a.costUsd, 0)),
        escapeCell(totals),
        String(cell.filter((a) => a.contaminated).length),
      ]);
    }
  }
  out.push(
    table(
      [
        "task",
        "arm",
        "n",
        "buildOk",
        "tests",
        "turns (mean)",
        "cost",
        "escapes",
        "contaminated",
      ],
      attemptRows,
    ),
    "",
  );

  out.push("## Pass rate", "");
  out.push(
    table(
      ["arm", "pass rate", "dts-read escapes", "per attempt"],
      arms.map((arm) => {
        const cell = clean.filter((a) => a.arm === arm);
        const dts = escapeTotals(cell)["dts-read"];
        return [
          arm,
          pct(cell.filter(passed).length, cell.length),
          String(dts),
          cell.length === 0 ? "-" : (dts / cell.length).toFixed(2),
        ];
      }),
    ),
    "",
  );
  out.push(
    table(
      ["task", ...arms.map((arm) => `arm ${arm}`)],
      taskIds.map((taskId) => [
        taskId,
        ...arms.map((arm) => {
          const cell = clean.filter(
            (a) => a.taskId === taskId && a.arm === arm,
          );
          return pct(cell.filter(passed).length, cell.length);
        }),
      ]),
    ),
    "",
  );
  out.push(
    "`dts-read` counts builder reads of `node_modules/**/*.d.ts`: each is a question the docs did not answer.",
    "",
  );

  out.push("## Findings", "");
  const summaries = summarizeFindings(findings);
  if (summaries.length === 0) {
    out.push("No findings were recorded for this run.", "");
  } else {
    out.push(
      `${findings.length} records, ${summaries.length} distinct keys. Sorted by recurrence.`,
      "",
    );
    for (const s of summaries) {
      const where =
        s.docPath === null
          ? "(no page)"
          : `\`${s.docPath}\`${s.latest.line === null ? "" : `:${s.latest.line}`}`;
      const statuses = STATUS_ORDER.filter((st) => s.statuses[st] > 0)
        .map((st) => `${st} ${s.statuses[st]}`)
        .join(", ");
      out.push(`### ${s.key} ${s.kind} \`${s.symbol}\``, "");
      out.push(
        `- where: ${where}`,
        `- occurrences: ${s.occurrences} (${statuses})`,
        `- attempts: ${findings
          .filter((f) => f.key === s.key)
          .map((f) => `${f.taskId}/${f.arm}/${f.n}`)
          .join(", ")}`,
        `- confidence (latest): ${s.latest.confidence}`,
      );
      if (s.latest.quote !== null) {
        out.push(`- quote: ${JSON.stringify(s.latest.quote)}`);
      }
      out.push(`- claim: ${s.latest.claim}`);
      if (s.latest.verifierNote.length > 0) {
        out.push(`- verifier: ${s.latest.verifierNote}`);
      }
      out.push("", "Proposed edit:", "");
      out.push(
        ...s.latest.proposedEdit
          .split("\n")
          .map((line) => (line.length === 0 ? ">" : `> ${line}`)),
        "",
      );
    }
  }

  out.push("## Doc coverage", "");
  const sectionsById = new Map(
    (opts.mapping?.sections ?? []).map((s) => [s.id, s] as const),
  );
  const tasksById = new Map((opts.tasks ?? []).map((t) => [t.id, t] as const));
  const metricsFor = opts.metrics ?? (() => null);
  const coverageRows: string[][] = [];
  for (const taskId of taskIds) {
    const task = tasksById.get(taskId);
    if (!task) {
      coverageRows.push([taskId, "(not in catalog)", "-", "-", "-"]);
      continue;
    }
    const armA = clean.filter((a) => a.taskId === taskId && a.arm === "A");
    const loaded = armA.map((a) => metricsFor(a));
    const withMetrics = loaded.filter((m): m is Metrics => m !== null);
    const pages = new Set(
      withMetrics.flatMap((m) => m.docPagesRead.map((p) => p.rel)),
    );
    for (const sectionId of task.docSections) {
      const section = sectionsById.get(sectionId);
      if (!section) {
        coverageRows.push([taskId, sectionId, "(unknown section)", "-", "-"]);
        continue;
      }
      const rel = sectionRel(section.docPath);
      const hits = [...pages].filter(
        (p) => p === rel || p.startsWith(`${rel}/`),
      );
      const read =
        withMetrics.length === 0 ? "unknown" : hits.length > 0 ? "yes" : "no";
      coverageRows.push([
        taskId,
        sectionId,
        `\`${rel}\``,
        read,
        `${hits.length} of ${pages.size} pages read (${withMetrics.length}/${armA.length} arm A attempts with metrics)`,
      ]);
    }
  }
  if (coverageRows.length === 0) {
    out.push("No tasks with doc sections to cover.", "");
  } else {
    out.push(
      table(
        ["task", "section", "docPath", "read in arm A", "detail"],
        coverageRows,
      ),
      "",
    );
  }

  return `${out.join("\n").trimEnd()}\n`;
}
