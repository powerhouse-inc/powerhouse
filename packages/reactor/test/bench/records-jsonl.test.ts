import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  nextId,
  readEntries,
  RecordsError,
  withLock,
  writeEntries,
} from "../../bench/records/jsonl-store.js";

const Row = z.strictObject({ id: z.string(), n: z.int() });

let directory = "";

function scratch(): string {
  directory = mkdtempSync(join(tmpdir(), "records-jsonl-"));
  return directory;
}

afterEach(() => {
  directory = "";
});

describe("readEntries", () => {
  it("reads a missing file as empty, because the file is created on first write", () => {
    const result = readEntries(join(scratch(), "TASKS.jsonl"), Row);

    expect(result.entries).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it("tolerates a BOM, CRLF line endings and a trailing blank line", () => {
    const path = join(scratch(), "rows.jsonl");
    writeFileSync(
      path,
      '﻿{"id":"T-001","n":1}\r\n{"id":"T-002","n":2}\r\n\r\n',
    );

    const result = readEntries(path, Row);

    expect(result.problems).toEqual([]);
    expect(result.entries).toEqual([
      { id: "T-001", n: 1 },
      { id: "T-002", n: 2 },
    ]);
  });

  it("collects every problem with a 1-indexed line, rather than stopping at the first", () => {
    const path = join(scratch(), "rows.jsonl");
    writeFileSync(
      path,
      ['{"id":"T-001","n":1}', "not json", '{"id":"T-003","n":"three"}'].join(
        "\n",
      ),
    );

    const result = readEntries(path, Row);

    expect(result.entries).toEqual([{ id: "T-001", n: 1 }]);
    expect(result.problems.map((problem) => problem.line)).toEqual([2, 3]);
    expect(result.problems[0].message).toContain("not JSON");
    expect(result.problems[1].message).toContain(
      "expected number, received string",
    );
  });
});

describe("writeEntries", () => {
  it("ends the file with a newline and leaves no temp file behind", () => {
    const path = join(scratch(), "rows.jsonl");

    writeEntries(path, [
      { id: "T-001", n: 1 },
      { id: "T-002", n: 2 },
    ]);

    expect(readFileSync(path, "utf8")).toBe(
      '{"id":"T-001","n":1}\n{"id":"T-002","n":2}\n',
    );
    expect(readdirSync(directory)).toEqual(["rows.jsonl"]);
  });

  it("writes an empty file as empty, not as a blank line", () => {
    const path = join(scratch(), "rows.jsonl");

    writeEntries(path, []);

    expect(readFileSync(path, "utf8")).toBe("");
    expect(readEntries(path, Row).entries).toEqual([]);
  });

  it("replaces the whole file, so a rewrite is as safe as an append", () => {
    const path = join(scratch(), "rows.jsonl");
    writeEntries(path, [{ id: "T-001", n: 1 }]);

    writeEntries(path, [{ id: "T-001", n: 9 }]);

    expect(readEntries(path, Row).entries).toEqual([{ id: "T-001", n: 9 }]);
  });
});

describe("nextId", () => {
  it("counts from one when nothing exists", () => {
    expect(nextId("B", [])).toBe("B-001");
    expect(nextId("T", [])).toBe("T-001");
  });

  it("takes the highest and allows gaps", () => {
    expect(nextId("T", ["T-001", "T-004"])).toBe("T-005");
    expect(nextId("T", ["T-010", "T-002"])).toBe("T-011");
  });

  it("keeps padding past three digits", () => {
    expect(nextId("B", ["B-999"])).toBe("B-1000");
  });
});

describe("withLock", () => {
  it("removes the lock when the body succeeds", () => {
    const path = join(scratch(), ".records.lock");

    expect(withLock(path, () => "done")).toBe("done");
    expect(readdirSync(directory)).toEqual([]);
  });

  it("removes the lock when the body throws", () => {
    const path = join(scratch(), ".records.lock");

    expect(() =>
      withLock(path, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(readdirSync(directory)).toEqual([]);
  });

  it("refuses to run while another command holds the lock", () => {
    const path = join(scratch(), ".records.lock");

    const failure = withLock(path, () => {
      try {
        withLock(path, () => "never");
      } catch (error) {
        return error;
      }
      return undefined;
    });

    expect(failure).toBeInstanceOf(RecordsError);
    expect((failure as RecordsError).exitCode).toBe(68);
    expect((failure as RecordsError).message).toContain(
      "Remove it if no command is running",
    );
  });
});
