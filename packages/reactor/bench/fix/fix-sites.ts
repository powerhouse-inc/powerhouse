import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runRecordsCommand } from "../records/records-commands.js";
import type { CommandIo, CommandResult } from "../records/records-commands.js";
import { TaskEntry } from "../records/task-schema.js";
import type { CodeRef } from "../records/task-schema.js";
import { FIX_EXIT } from "./fix-options.js";
import type { SitesOptions } from "./fix-options.js";
import { git, nonEmptyLines, repoRoot } from "./repo.js";

export type SiteExcerpt = {
  site: CodeRef;
  exists: boolean;
  excerpt: string[];
  /** Where the symbol actually is, nearest to the cited line. */
  symbolLine: number | undefined;
  drift: string;
  callers: string[];
  callersTruncated: boolean;
};

const RECORDS_IO: CommandIo = {
  readInput: () => {
    throw new Error("sites never reads an entry");
  },
  now: () => new Date().toISOString(),
};

/** Numbered lines around `line`, the cited one marked, clipped to the file. */
export function excerpt(
  lines: string[],
  line: number,
  context: number,
): string[] {
  const first = Math.max(1, line - context);
  const last = Math.min(lines.length, line + context);
  const width = String(last).length;
  const out: string[] = [];
  for (let number = first; number <= last; number += 1) {
    const marker = number === line ? ">" : " ";
    out.push(
      `${marker} ${String(number).padStart(width)} | ${lines[number - 1]}`,
    );
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The occurrence of `symbol` closest to `line`, or the first when no line is cited. */
export function nearestSymbolLine(
  lines: string[],
  symbol: string,
  line: number | undefined,
): number | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
  let best: number | undefined;
  lines.forEach((text, index) => {
    if (!pattern.test(text)) {
      return;
    }
    const number = index + 1;
    if (best === undefined) {
      best = number;
      return;
    }
    if (line !== undefined && Math.abs(number - line) < Math.abs(best - line)) {
      best = number;
    }
  });
  return best;
}

export function describeDrift(
  site: CodeRef,
  exists: boolean,
  lineCount: number,
  symbolLine: number | undefined,
  context: number,
): string {
  if (!exists) {
    return "MISSING: the file is not in the tree";
  }
  if (site.line !== undefined && site.line > lineCount) {
    return `MOVED: the file has ${String(lineCount)} lines, the task cites ${String(site.line)}`;
  }
  if (site.symbol === undefined) {
    return "no symbol cited";
  }
  if (symbolLine === undefined) {
    return `MOVED: ${site.symbol} does not appear in the file`;
  }
  if (site.line === undefined) {
    return `${site.symbol} at line ${String(symbolLine)}`;
  }
  const distance = Math.abs(symbolLine - site.line);
  if (distance === 0) {
    return `${site.symbol} on the cited line`;
  }
  if (distance <= context) {
    return `${site.symbol} at line ${String(symbolLine)}, ${String(distance)} lines from the cited ${String(site.line)}`;
  }
  return `DRIFT: ${site.symbol} nearest at line ${String(symbolLine)}, ${String(distance)} lines from the cited ${String(site.line)}; the cited line is inside something else`;
}

function callersOf(
  root: string,
  symbol: string,
  limit: number,
): { callers: string[]; truncated: boolean } {
  const result = git(
    [
      "grep",
      "-n",
      "-w",
      "-e",
      symbol,
      "--",
      ".",
      ":!*.d.ts",
      ":!*.d.mts",
      ":!*.map",
      ":!**/dist/**",
      ":!**/node_modules/**",
      ":!**/*.jsonl",
      ":!**/*.md",
      ":!docs/**",
      ":!.claude/**",
    ],
    root,
  );
  const lines = nonEmptyLines(result.stdout);
  return { callers: lines.slice(0, limit), truncated: lines.length > limit };
}

export function readSite(
  root: string,
  site: CodeRef,
  context: number,
  callerLimit: number,
): SiteExcerpt {
  const path = join(root, site.file);
  const exists = existsSync(path);
  const lines = exists ? readFileSync(path, "utf8").split("\n") : [];
  const symbolLine =
    exists && site.symbol !== undefined
      ? nearestSymbolLine(lines, site.symbol, site.line)
      : undefined;
  const anchor = site.line ?? symbolLine;
  const callers =
    site.symbol === undefined
      ? { callers: [], truncated: false }
      : callersOf(root, site.symbol, callerLimit);
  return {
    site,
    exists,
    excerpt:
      exists && anchor !== undefined ? excerpt(lines, anchor, context) : [],
    symbolLine,
    drift: describeDrift(site, exists, lines.length, symbolLine, context),
    callers: callers.callers,
    callersTruncated: callers.truncated,
  };
}

export function formatSite(item: SiteExcerpt): string[] {
  const heading = `${item.site.file}${item.site.line === undefined ? "" : `:${String(item.site.line)}`}${item.site.symbol === undefined ? "" : ` ${item.site.symbol}`}`;
  const lines = [`== ${heading}`, `   ${item.drift}`];
  if (item.excerpt.length > 0) {
    lines.push(...item.excerpt);
  }
  if (item.site.symbol !== undefined) {
    lines.push(
      `   callers of ${item.site.symbol}: ${String(item.callers.length)}${item.callersTruncated ? "+ (truncated)" : ""}`,
    );
    lines.push(...item.callers.map((caller) => `     ${caller}`));
  }
  return lines;
}

export function runSites(options: SitesOptions): CommandResult {
  const root = repoRoot();
  const shown = runRecordsCommand(
    { subcommand: "show", id: options.taskId, dir: options.dir, json: true },
    RECORDS_IO,
  );
  const task = TaskEntry.parse(shown.data);
  if (task.kind === "GAP") {
    return {
      exit: FIX_EXIT.ok,
      lines: [`${task.id} is a GAP and cites no sites`],
      data: { taskId: task.id, sites: [] },
    };
  }

  const items = task.details.sites.map((site) =>
    readSite(root, site, options.context, options.callers),
  );
  const lines: string[] = [];
  for (const item of items) {
    lines.push(...formatSite(item));
  }
  const moved = items.filter(
    (item) =>
      item.drift.startsWith("MOVED") || item.drift.startsWith("MISSING"),
  );
  lines.push(
    moved.length === 0
      ? `sites: ${String(items.length)} cited, all present`
      : `sites: ${String(moved.length)} of ${String(items.length)} moved or missing; the task may need the verifier again, not a fix`,
  );
  return {
    exit: moved.length === 0 ? FIX_EXIT.ok : FIX_EXIT.notFound,
    lines,
    data: { taskId: task.id, sites: items },
  };
}
