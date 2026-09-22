/** HTML for the Studio routes; only the `list*` helpers touch the disk. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import type { AttemptLayout } from "../lib/paths.js";
import type { Arm, AttemptSummary, RunRecord } from "../lib/schemas.js";
import { RunRecord as RunRecordSchema } from "../lib/schemas.js";

/** One directory or file name: no separators, no `..`, no percent escapes. */
export function isSafeSegment(s: string): boolean {
  return (
    s.length > 0 &&
    s !== "." &&
    !s.includes("/") &&
    !s.includes("\\") &&
    !s.includes("..") &&
    /^[A-Za-z0-9._-]+$/.test(s)
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:|#|\/|\.)/i.test(h)) return h;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(h)) return h;
  return null;
}

/** Raw HTML in the report is model-written text: show it, never run it. */
const markdown = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const h = safeHref(href);
      if (h === null) return inner;
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(h)}"${t}>${inner}</a>`;
    },
    image({ href, text }) {
      return `<code>${escapeHtml(`![${text}](${href})`)}</code>`;
    },
  },
});

export function renderMarkdown(md: string): string {
  return markdown.parse(md, { async: false });
}

const STYLE = `
:root { color-scheme: light; }
body { margin: 0 auto; padding: 1.5rem 1rem 4rem; max-width: 64rem; color: #1b1b1b; background: #fff;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
nav { font-size: 0.9rem; margin-bottom: 1rem; color: #555; }
nav a { color: #0b57d0; }
h1, h2, h3 { line-height: 1.25; }
h1 { font-size: 1.6rem; } h2 { font-size: 1.25rem; margin-top: 2rem; } h3 { font-size: 1.05rem; margin-top: 1.5rem; }
a { color: #0b57d0; }
code, pre { font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
code { background: #f3f3f3; padding: 0 0.25em; border-radius: 3px; }
pre { background: #f6f6f6; border: 1px solid #ddd; padding: 0.75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 1rem 0; display: block; overflow-x: auto; }
th, td { border: 1px solid #ccc; padding: 0.3rem 0.6rem; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
ul.files { list-style: none; padding: 0; } ul.files li { margin: 0.15rem 0; }
.muted { color: #777; }
.hint { border-left: 3px solid #e0a800; background: #fff8e1; padding: 0.5rem 0.75rem; }
`;

export interface PageOptions {
  title: string;
  body: string;
  /** Already-escaped HTML for the breadcrumb line. */
  nav?: string;
}

export function page(o: PageOptions): string {
  const nav = o.nav ? `<nav>${o.nav}</nav>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(o.title)}</title>
<style>${STYLE}</style>
</head>
<body>
${nav}
${o.body}
</body>
</html>
`;
}

const INDEX_HREF = "/doc-harness";

export function runHref(runId: string): string {
  return `${INDEX_HREF}/runs/${encodeURIComponent(runId)}`;
}

export function reportHref(runId: string): string {
  return `${runHref(runId)}/report`;
}

export function attemptFileHref(
  runId: string,
  taskId: string,
  arm: Arm,
  n: number,
  file: string,
): string {
  return `${runHref(runId)}/attempts/${encodeURIComponent(taskId)}/${arm}/${n}/${encodeURIComponent(file)}`;
}

function crumbs(...parts: [string, string | null][]): string {
  return parts
    .map(([label, href]) =>
      href === null
        ? escapeHtml(label)
        : `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`,
    )
    .join(" / ");
}

export function renderMarkdownPage(
  title: string,
  md: string,
  nav?: string,
): string {
  return page({ title, body: renderMarkdown(md), nav });
}

export function renderPrePage(
  title: string,
  text: string,
  nav?: string,
): string {
  return page({
    title,
    body: `<h1>${escapeHtml(title)}</h1>\n<pre>${escapeHtml(text)}</pre>`,
    nav,
  });
}

export function renderNotFoundPage(title: string, hint: string): string {
  return page({
    title,
    body: `<h1>${escapeHtml(title)}</h1>\n<p class="hint">${escapeHtml(hint)}</p>`,
    nav: crumbs(["doc-harness", INDEX_HREF]),
  });
}

/* --------------------------------------------------------------- index */

export interface RunListEntry {
  runId: string;
  finishedAt: string | null;
  attempts: number;
  pass: number;
  rateLimited: number;
  reportExists: boolean;
}

/** `complete (truncated; judge budget-exhausted)` style label for one attempt. */
export function attemptStatusLabel(
  a: Pick<AttemptSummary, "status" | "truncated" | "judgeFailed">,
): string {
  const notes: string[] = [];
  if (a.truncated) notes.push("truncated");
  if (a.judgeFailed !== null) notes.push(`judge ${a.judgeFailed}`);
  return notes.length === 0 ? a.status : `${a.status} (${notes.join("; ")})`;
}

/** Every `runs/<id>/run.json` that parses, newest first. */
export function listRuns(runsRoot: string): RunListEntry[] {
  if (!existsSync(runsRoot)) return [];
  const entries: RunListEntry[] = [];
  for (const d of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!d.isDirectory() || !isSafeSegment(d.name)) continue;
    const dir = path.join(runsRoot, d.name);
    const runJson = path.join(dir, "run.json");
    if (!existsSync(runJson)) continue;
    let record: RunRecord;
    try {
      record = RunRecordSchema.parse(JSON.parse(readFileSync(runJson, "utf8")));
    } catch {
      continue;
    }
    entries.push({
      runId: d.name,
      finishedAt: record.finishedAt,
      attempts: record.attempts.length,
      pass: record.attempts.filter((a) => a.acceptanceOk === true).length,
      rateLimited: record.attempts.filter((a) => a.status === "rate-limited")
        .length,
      reportExists: existsSync(path.join(dir, "REPORT.md")),
    });
  }
  return entries.sort((a, b) => {
    const ka = a.finishedAt ?? "~";
    const kb = b.finishedAt ?? "~";
    return kb.localeCompare(ka) || b.runId.localeCompare(a.runId);
  });
}

export function renderIndex(runs: RunListEntry[]): string {
  const rows = runs
    .map((r) => {
      const report = r.reportExists
        ? `<a href="${escapeHtml(reportHref(r.runId))}">report</a>`
        : `<span class="muted">no report</span>`;
      const limited =
        r.rateLimited > 0
          ? `<td>${r.rateLimited}</td>`
          : `<td class="muted">0</td>`;
      return `<tr><td><a href="${escapeHtml(runHref(r.runId))}">${escapeHtml(r.runId)}</a></td><td>${escapeHtml(r.finishedAt ?? "running")}</td><td>${r.attempts}</td><td>${r.pass}/${r.attempts}</td>${limited}<td>${report}</td></tr>`;
    })
    .join("\n");
  const table =
    runs.length === 0
      ? `<p class="muted">No runs yet.</p>`
      : `<table><thead><tr><th>run</th><th>finished</th><th>attempts</th><th>pass</th><th>rate-limited</th><th></th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
  return page({
    title: "doc-harness runs",
    body: `<h1>doc-harness runs</h1>\n${table}`,
  });
}

/* ----------------------------------------------------------------- run */

/** Attempt files worth a link, in display order. */
export const ATTEMPT_FILES = [
  "transcript.compact.md",
  "metrics.json",
  "judge.json",
  "verify.json",
  "attempt.json",
  "build.json",
  "tests.json",
  "tsc.log",
  "vitest.log",
] as const;

/** The linkable files present in an attempt directory. */
export function listAttemptFiles(layout: AttemptLayout): string[] {
  if (!existsSync(layout.dir)) return [];
  const present = new Set(
    readdirSync(layout.dir, { withFileTypes: true })
      .filter((d) => d.isFile() && isSafeSegment(d.name))
      .map((d) => d.name),
  );
  return ATTEMPT_FILES.filter((f) => present.has(f));
}

export interface AttemptEntry {
  taskId: string;
  arm: Arm;
  n: number;
  status: string;
  files: string[];
}

export function renderRunPage(
  runId: string,
  record: RunRecord | null,
  attempts: AttemptEntry[],
  reportExists: boolean,
): string {
  const nav = crumbs(["doc-harness", INDEX_HREF], [runId, null]);
  const head = record
    ? `<p>started ${escapeHtml(record.startedAt)}; finished ${escapeHtml(record.finishedAt ?? "running")}<br>pin <code>${escapeHtml(record.pin)}</code>; docs <code>${escapeHtml(record.docsSha.slice(0, 12))}</code>; claude <code>${escapeHtml(record.cliVersion)}</code></p>`
    : `<p class="hint">run.json is missing or invalid.</p>`;
  const report = reportExists
    ? `<p><a href="${escapeHtml(reportHref(runId))}">REPORT.md</a> (<a href="${escapeHtml(reportHref(runId))}.md">raw</a>)</p>`
    : `<p class="hint">No REPORT.md yet: run <code>doc-harness report ${escapeHtml(runId)}</code>.</p>`;
  const rows = attempts
    .map((a) => {
      const links = a.files
        .map(
          (f) =>
            `<a href="${escapeHtml(attemptFileHref(runId, a.taskId, a.arm, a.n, f))}">${escapeHtml(f)}</a>`,
        )
        .join(" ");
      return `<tr><td>${escapeHtml(a.taskId)}</td><td>${a.arm}</td><td>${a.n}</td><td>${escapeHtml(a.status)}</td><td>${links || '<span class="muted">none</span>'}</td></tr>`;
    })
    .join("\n");
  const table =
    attempts.length === 0
      ? `<p class="muted">No attempts recorded.</p>`
      : `<table><thead><tr><th>task</th><th>arm</th><th>n</th><th>status</th><th>files</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
  return page({
    title: `doc-harness ${runId}`,
    nav,
    body: `<h1>${escapeHtml(runId)}</h1>\n${head}\n${report}\n<h2>Attempts</h2>\n${table}`,
  });
}

export function reportNav(runId: string): string {
  return crumbs(
    ["doc-harness", INDEX_HREF],
    [runId, runHref(runId)],
    ["REPORT.md", null],
  );
}

export function attemptNav(
  runId: string,
  taskId: string,
  arm: Arm,
  n: number,
  file: string,
): string {
  return crumbs(
    ["doc-harness", INDEX_HREF],
    [runId, runHref(runId)],
    [`${taskId}/${arm}/${n}/${file}`, null],
  );
}
