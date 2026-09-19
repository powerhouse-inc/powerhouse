/** FINDINGS.jsonl and RUNS.jsonl; no lockfile since the workflow is the single writer. */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { z } from "zod";
import type { ZodType } from "zod";
import { FINDINGS_FILE, RUNS_FILE } from "./paths.js";
import {
  FindingRecord,
  RunRecord,
  VerifyStatus,
  type Finding,
  type FindingKind,
  type VerifyResult,
} from "./schemas.js";

/* --------------------------------------------------------------- store */

/** A line that did not parse, or that parsed and then failed the schema. */
export type LineProblem = {
  /** 1-indexed, so it matches what an editor shows. */
  line: number;
  message: string;
};

export type ReadResult<T> = {
  entries: T[];
  problems: LineProblem[];
};

/** Collects every bad line instead of throwing; a missing file reads as empty. */
export function readEntries<T>(
  path: string,
  schema: ZodType<T>,
): ReadResult<T> {
  const result: ReadResult<T> = { entries: [], problems: [] };
  if (!existsSync(path)) {
    return result;
  }

  const contents = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (raw.length === 0) {
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      result.problems.push({
        line: index + 1,
        message: `not JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      result.problems.push({
        line: index + 1,
        message: z.prettifyError(parsed.error),
      });
      continue;
    }

    result.entries.push(parsed.data);
  }

  return result;
}

/** Replaces the file with these entries: temp file, fsync, rename. */
export function writeEntries(path: string, entries: unknown[]): void {
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const contents = entries.length === 0 ? "" : `${body}\n`;
  const temporary = `${path}.tmp-${process.pid}`;

  const handle = openSync(temporary, "w");
  try {
    writeSync(handle, contents);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }

  renameSync(temporary, path);
}

/** Validates before opening, so a bad entry never touches the file. */
export function appendEntry<T>(
  path: string,
  schema: ZodType<T>,
  entry: unknown,
): T {
  const parsed = schema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(
      `invalid entry for ${path}: ${z.prettifyError(parsed.error)}`,
    );
  }

  const handle = openSync(path, "a");
  try {
    writeSync(handle, `${JSON.stringify(parsed.data)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }

  return parsed.data;
}

export type VerifyFileResult = {
  count: number;
  problems: LineProblem[];
};

export function verifyFile<T>(
  path: string,
  schema: ZodType<T>,
): VerifyFileResult {
  const { entries, problems } = readEntries(path, schema);
  return { count: entries.length, problems };
}

/* ------------------------------------------------------------------ key */

/** Lowercase, no leading ./, single slashes, no .md/.mdx extension. */
export function normalizeDocPath(docPath: string): string {
  return docPath
    .trim()
    .toLowerCase()
    .replace(/^(\.\/)+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\.mdx?$/, "");
}

/** sha1(normalize(docPath)|symbol|kind).hex.slice(0, 12) */
export function findingKey(
  f: Pick<Finding, "docPath" | "symbol" | "kind">,
): string {
  const input = `${normalizeDocPath(f.docPath ?? "")}|${f.symbol.trim()}|${f.kind}`;
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

/* -------------------------------------------------------------- records */

export type FindingContext = {
  runId: string;
  taskId: string;
  arm: FindingRecord["arm"];
  n: number;
  docsSha: string;
  pin: string;
  cliVersion: string;
  recordedAt: string;
};

export function toFindingRecord(
  finding: Finding,
  verify: Pick<VerifyResult, "status" | "note">,
  ctx: FindingContext,
): FindingRecord {
  return FindingRecord.parse({
    ...finding,
    key: findingKey(finding),
    status: verify.status,
    verifierNote: verify.note,
    ...ctx,
  });
}

/** Appends each record; returns how many were written. */
export function appendFindings(
  records: FindingRecord[],
  file: string = FINDINGS_FILE,
): number {
  for (const record of records) {
    appendEntry(file, FindingRecord, record);
  }
  return records.length;
}

export function appendRun(run: RunRecord, file: string = RUNS_FILE): void {
  appendEntry(file, RunRecord, run);
}

/* -------------------------------------------------------------- summary */

export type FindingSummary = {
  key: string;
  kind: FindingKind;
  docPath: string | null;
  symbol: string;
  occurrences: number;
  runs: string[];
  statuses: Record<VerifyStatus, number>;
  latest: FindingRecord;
};

function emptyStatuses(): Record<VerifyStatus, number> {
  const counts = {} as Record<VerifyStatus, number>;
  for (const status of VerifyStatus.options) {
    counts[status] = 0;
  }
  return counts;
}

/** Groups by key; sorted by occurrences desc, then key asc. */
export function summarizeFindings(records: FindingRecord[]): FindingSummary[] {
  const byKey = new Map<string, FindingSummary>();

  for (const record of records) {
    let summary = byKey.get(record.key);
    if (!summary) {
      summary = {
        key: record.key,
        kind: record.kind,
        docPath: record.docPath,
        symbol: record.symbol,
        occurrences: 0,
        runs: [],
        statuses: emptyStatuses(),
        latest: record,
      };
      byKey.set(record.key, summary);
    }

    summary.occurrences += 1;
    summary.statuses[record.status] += 1;
    if (!summary.runs.includes(record.runId)) {
      summary.runs.push(record.runId);
    }
    if (record.recordedAt >= summary.latest.recordedAt) {
      summary.latest = record;
    }
  }

  return [...byKey.values()].sort(
    (a, b) => b.occurrences - a.occurrences || a.key.localeCompare(b.key),
  );
}
