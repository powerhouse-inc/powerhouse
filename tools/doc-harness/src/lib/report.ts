/**
 * REPORT.md for one run: attempts, pass rates, doc-escape headline, findings
 * by recurrence, and doc coverage against the ph-lora section mapping.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { formatTokens } from "./attempt-status.js";
import type { Task } from "./catalog.js";
import { summarizeFindings } from "./findings.js";
import { MONOREPO_ROOT, type RunLayout } from "./paths.js";
import { listAttemptDirs } from "./redo.js";
import {
  Arm,
  AttemptSummary,
  EscapeKind,
  Metrics,
  type FindingRecord,
  type RunArgs,
  type RunRecord,
  type VerifyStatus,
} from "./schemas.js";

/** What the report needs of a catalog task; arms only for the matrix size. */
export type ReportTask = Pick<Task, "id" | "docSections"> &
  Partial<Pick<Task, "arms">>;

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

/* ------------------------------------------------------ attempts on disk */

/**
 * run.json lists attempts only once `summarize` ran; mid-run, each recorded
 * attempt has an attempt.json of its own. Recorded entries win over disk.
 */
export function withAttemptsOnDisk(
  layout: RunLayout,
  recorded: readonly AttemptSummary[],
): AttemptSummary[] {
  const known = new Set(recorded.map((a) => `${a.taskId}/${a.arm}/${a.n}`));
  const found: AttemptSummary[] = [];
  for (const id of listAttemptDirs(layout)) {
    if (known.has(`${id.taskId}/${id.arm}/${id.n}`)) continue;
    const file = layout.attempt(id.taskId, id.arm, id.n).attemptJson;
    if (!existsSync(file)) continue;
    try {
      found.push(AttemptSummary.parse(JSON.parse(readFileSync(file, "utf8"))));
    } catch {
      // A half-written or pre-schema attempt.json: the summary will redo it.
    }
  }
  return [...recorded, ...found];
}

/**
 * Attempts the run's args call for; null when `tasks` is empty (every catalog
 * task) and no catalog is at hand to expand it.
 */
export function matrixSize(
  args: Pick<RunArgs, "tasks" | "arms" | "n">,
  tasks?: readonly ReportTask[],
): number | null {
  const ids = args.tasks.length > 0 ? args.tasks : tasks?.map((t) => t.id);
  if (ids === undefined) return null;
  const byId = new Map((tasks ?? []).map((t) => [t.id, t] as const));
  return ids.reduce((sum, id) => {
    const arms = byId.get(id)?.arms;
    const count = arms
      ? args.arms.filter((a) => arms.includes(a)).length
      : args.arms.length;
    return sum + count * args.n;
  }, 0);
}

/* ------------------------------------------------------------- helpers */

export interface ReportOptions {
  mapping?: PhLoraMapping;
  /** Catalog tasks, for docSections; tasks not listed get no coverage rows. */
  tasks?: readonly ReportTask[];
  /** Per-attempt metrics; defaults to none (coverage then reports unknown). */
  metrics?: (summary: AttemptSummary) => Metrics | null;
  /** Size of the run's matrix; the header says "partial" when attempts fall short. */
  expectedAttempts?: number | null;
}

/** Truncated builds count: the workspace was graded like any other. */
function passed(a: AttemptSummary): boolean {
  return (
    a.status === "complete" &&
    (a.buildOk || a.truncated) &&
    a.acceptanceOk !== false
  );
}

/** Contaminated and rate-limited attempts say nothing about the docs. */
export function countsForRates(a: AttemptSummary): boolean {
  return !a.contaminated && a.status !== "rate-limited";
}

/** The builder was killed, so the CLI never reported a cost. */
export function unmetered(a: AttemptSummary): boolean {
  return (
    a.buildFailureReason === "rate-limited" ||
    a.buildFailureReason === "wall-clock"
  );
}

function costCell(cell: AttemptSummary[]): string {
  const metered = cell.filter((a) => !unmetered(a));
  const killed = cell.filter(unmetered);
  const base = money(metered.reduce((s, a) => s + a.costUsd, 0));
  if (killed.length === 0) return base;
  const tokens = killed.reduce((s, a) => s + (a.buildTokens ?? 0), 0);
  const tok = tokens > 0 ? `, ${formatTokens(tokens)} tok` : "";
  return `${base} (+${killed.length} unmetered${tok})`;
}

/** The judge never runs for these statuses. */
const JUDGE_SKIPPED_STATUSES: AttemptSummary["status"][] = [
  "rate-limited",
  "infra-fail",
  "skipped",
];

function judgeCell(cell: AttemptSummary[]): string {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const a of cell) {
    if (JUDGE_SKIPPED_STATUSES.includes(a.status)) bump("skipped");
    else if (a.judgeFailed === null) bump("ok");
    else bump(a.judgeFailed);
  }
  return [...counts.entries()].map(([k, n]) => `${n} ${k}`).join(", ");
}

function pct(num: number, den: number): string {
  return den === 0
    ? "n/a"
    : `${Math.round((num / den) * 100)}% (${num}/${den})`;
}

/** `67% (12/18, 7 truncated)`: how many of the passes were truncated builds. */
function passCell(cell: AttemptSummary[]): string {
  const passes = cell.filter(passed);
  const truncated = passes.filter((a) => a.truncated).length;
  const base = pct(passes.length, cell.length);
  return truncated === 0
    ? base
    : base.replace(/\)$/, `, ${truncated} truncated)`);
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
  const clean = run.attempts.filter(countsForRates);
  const contaminated = run.attempts.filter((a) => a.contaminated).length;
  const rateLimited = run.attempts.filter(
    (a) => a.status === "rate-limited",
  ).length;
  const killed = run.attempts.filter(unmetered).length;
  const truncated = run.attempts.filter((a) => a.truncated).length;
  const arms = Arm.options.filter((arm) =>
    run.attempts.some((a) => a.arm === arm),
  );
  const taskIds = [...new Set(run.attempts.map((a) => a.taskId))].sort();
  // A finished run's list is complete; the matrix only bounds an open one.
  const expected = opts.expectedAttempts ?? null;
  const partial =
    run.finishedAt === null &&
    expected !== null &&
    expected > run.attempts.length;
  const out: string[] = [];

  out.push(`# doc-harness report: ${run.runId}`, "");
  if (partial) {
    out.push(
      `**partial: ${run.attempts.length} of ${expected} attempts** recorded so far; the rest are still running or were reset.`,
      "",
    );
  }
  out.push(
    `- docsSha: \`${run.docsSha}\` (${run.docsFileCount} files, hash \`${run.docsHash}\`)`,
    `- pin: \`${run.pin}\``,
    `- cliVersion: \`${run.cliVersion}\``,
    `- catalogHash: \`${run.catalogHash}\``,
    `- started: ${run.startedAt}; finished: ${run.finishedAt ?? "(unfinished)"}`,
    `- args: tasks ${run.args.tasks.join(",") || "(all)"}; arms ${run.args.arms.join(",")}; n ${run.args.n}; concurrency ${run.args.concurrency}; sandbox ${run.args.sandbox}; auth ${run.args.auth}; builder ${run.args.builderModel}; judge ${run.args.judgeModel}${run.args.dryRun ? "; dry run" : ""}${run.args.skipVerify ? "; verify skipped" : ""}`,
    `- attempts: ${run.attempts.length}${partial ? ` of ${expected} (partial)` : ""} (${contaminated} contaminated, ${rateLimited} rate-limited; both excluded from rates); ${truncated} truncated (graded after the build hit its budget)`,
    `- unmetered (killed) attempts: ${killed} (cost unknown; tokens shown instead)`,
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
        String(cell.filter((a) => a.truncated).length),
        `${cell.reduce((s, a) => s + a.testsPassed, 0)}/${cell.reduce((s, a) => s + a.testsTotal, 0)}`,
        mean(cell.flatMap((a) => (a.turns === null ? [] : [a.turns]))),
        costCell(cell),
        judgeCell(cell),
        escapeCell(totals),
        String(cell.filter((a) => a.contaminated).length),
        String(cell.filter((a) => a.status === "rate-limited").length),
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
        "truncated",
        "tests",
        "turns (mean)",
        "cost",
        "judge",
        "escapes",
        "contaminated",
        "rate-limited",
      ],
      attemptRows,
    ),
    "",
    "`truncated` builds hit their budget and were graded anyway; `rate-limited` builds were killed while the CLI retried the API and are excluded from the rates below (redo them with `resume --redo-failed`).",
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
          passCell(cell),
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
          return passCell(cell);
        }),
      ]),
    ),
    "",
  );
  out.push(
    "`dts-read` counts builder reads of `node_modules/**/*.d.ts`: each is a question the docs did not answer. A pass rate's `truncated` count says how many of its passes were builds that hit their budget.",
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
