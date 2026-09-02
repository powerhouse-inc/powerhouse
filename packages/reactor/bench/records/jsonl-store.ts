import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { z } from "zod";
import type { ZodType } from "zod";
import { RECORDS_EXIT } from "./records-options.js";

/** Carries the exit code the entrypoint reports, so mapping stays in one place. */
export class RecordsError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "RecordsError";
    this.exitCode = exitCode;
  }
}

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

/**
 * Reads and validates every line, collecting problems rather than throwing on
 * the first: `verify` exists to list them all in one pass. A missing file reads
 * as empty, because the files are created on first write.
 */
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

/**
 * Replaces the file with these entries, serialised as the schema's own output
 * so defaults are materialised and keys are ordered the same way every time.
 * Temp file plus fsync plus rename, for appends as well as rewrites: the
 * torn-line failure an append leaves open is not worth the saved bytes.
 */
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

/** `max(existing) + 1`, zero-padded to three. Gaps are allowed. */
export function nextId(prefix: string, existing: string[]): string {
  let highest = 0;
  for (const id of existing) {
    const digits = id.slice(prefix.length + 1);
    const value = Number.parseInt(digits, 10);
    if (Number.isFinite(value) && value > highest) {
      highest = value;
    }
  }

  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Holds an O_EXCL lockfile for the duration. Whole-file rewrites mean two
 * concurrent invocations would clobber rather than interleave. A lockfile left
 * behind by a killed process is reported, not cleared: guessing that a lock is
 * stale is how the clobber comes back.
 */
export function withLock<T>(lockPath: string, run: () => T): T {
  let handle: number;
  try {
    handle = openSync(lockPath, "wx");
  } catch {
    throw new RecordsError(
      `Another records command holds ${lockPath}. Remove it if no command is running.`,
      RECORDS_EXIT.error,
    );
  }

  closeSync(handle);
  try {
    return run();
  } finally {
    unlinkSync(lockPath);
  }
}
