import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendEntry,
  appendFindings,
  appendRun,
  findingKey,
  normalizeDocPath,
  readEntries,
  summarizeFindings,
  toFindingRecord,
  verifyFile,
  writeEntries,
} from "../src/lib/findings.js";
import {
  FindingRecord,
  RunRecord,
  type AttemptSummary,
  type Finding,
} from "../src/lib/schemas.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    kind: "WRONG",
    docPath: "reactor/builder.md",
    line: 12,
    quote: "withReadModel(...)",
    symbol: "ReactorBuilder.withReadModel",
    claim: "The doc names a method that does not exist.",
    evidence: [{ turn: 3, uuid: null }],
    proposedEdit: "Rename to withReadModels.",
    confidence: 0.9,
    ...overrides,
  };
}

function findingRecord(overrides: Partial<FindingRecord> = {}): FindingRecord {
  const base = finding();
  return {
    ...base,
    key: findingKey(base),
    status: "VERIFIED",
    verifierNote: "",
    runId: "run-1",
    taskId: "task-a",
    arm: "A",
    n: 1,
    docsSha: "abc123",
    pin: "6.2.2-dev.62",
    cliVersion: "2.0.0",
    recordedAt: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

function attempt(overrides: Partial<AttemptSummary> = {}): AttemptSummary {
  return {
    taskId: "task-a",
    arm: "A",
    n: 1,
    status: "complete",
    buildOk: true,
    buildFailureReason: null,
    tscOk: true,
    testsPassed: 3,
    acceptanceOk: true,
    testsTotal: 3,
    turns: 20,
    costUsd: 1.5,
    durationMs: 60_000,
    escapes: {
      "dts-read": 0,
      "outside-root-read": 0,
      "network-bash": 0,
      "denied-path-bash": 0,
      "dep-change": 0,
    },
    docPagesRead: 4,
    contaminated: false,
    findingsKept: 1,
    findingsVerified: 1,
    findingsRefuted: 0,
    ...overrides,
  };
}

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: "run-1",
    startedAt: "2026-09-17T09:00:00Z",
    finishedAt: "2026-09-17T10:00:00Z",
    cliVersion: "2.0.0",
    docsSha: "abc123",
    docsHash: "deadbeef",
    docsFileCount: 40,
    pin: "6.2.2-dev.62",
    catalogHash: "cafe",
    args: {
      tasks: ["task-a"],
      arms: ["A"],
      n: 1,
      concurrency: 1,
      dryRun: false,
      sandbox: "dontAsk",
      auth: "bare",
      skipVerify: false,
      keepWorkspaces: false,
      builderModel: "sonnet",
      judgeModel: "opus",
    },
    attempts: [attempt()],
    ...overrides,
  };
}

describe("findings store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "doc-harness-findings-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends then reads back in order", () => {
    const file = path.join(dir, "FINDINGS.jsonl");
    const a = findingRecord({ runId: "run-1" });
    const b = findingRecord({ runId: "run-2", symbol: "Other" });
    const c = findingRecord({ runId: "run-3", kind: "STALE" });

    expect(appendFindings([a, b, c], file)).toBe(3);

    const { entries, problems } = readEntries(file, FindingRecord);
    expect(problems).toEqual([]);
    expect(entries.map((e) => e.runId)).toEqual(["run-1", "run-2", "run-3"]);
    expect(entries[1].symbol).toBe("Other");
  });

  it("appendRun writes a RunRecord line", () => {
    const file = path.join(dir, "RUNS.jsonl");
    appendRun(runRecord(), file);
    appendRun(runRecord({ runId: "run-2" }), file);

    const { entries, problems } = readEntries(file, RunRecord);
    expect(problems).toEqual([]);
    expect(entries.map((r) => r.runId)).toEqual(["run-1", "run-2"]);
  });

  it("reads a missing file as empty", () => {
    const { entries, problems } = readEntries(
      path.join(dir, "nope.jsonl"),
      FindingRecord,
    );
    expect(entries).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("reports malformed and schema-failing lines with 1-indexed numbers", () => {
    const file = path.join(dir, "FINDINGS.jsonl");
    const good = findingRecord();
    const bad = { ...findingRecord(), kind: "BOGUS" };
    writeFileSync(
      file,
      [
        JSON.stringify(good),
        "{not json",
        JSON.stringify(bad),
        "",
        JSON.stringify(good),
      ].join("\n") + "\n",
    );

    const { entries, problems } = readEntries(file, FindingRecord);
    expect(entries).toHaveLength(2);
    expect(problems.map((p) => p.line)).toEqual([2, 3]);
    expect(problems[0].message).toMatch(/^not JSON/);
    expect(problems[1].message).toMatch(/kind/);

    const verified = verifyFile(file, FindingRecord);
    expect(verified.count).toBe(2);
    expect(verified.problems).toHaveLength(2);
  });

  it("writeEntries replaces the file", () => {
    const file = path.join(dir, "FINDINGS.jsonl");
    appendFindings([findingRecord(), findingRecord()], file);
    writeEntries(file, [findingRecord({ runId: "only" })]);

    const { entries } = readEntries(file, FindingRecord);
    expect(entries.map((e) => e.runId)).toEqual(["only"]);
  });

  it("appendEntry rejects an invalid entry without writing", () => {
    const file = path.join(dir, "FINDINGS.jsonl");
    appendFindings([findingRecord()], file);
    const before = readFileSync(file, "utf8");

    expect(() =>
      appendEntry(file, FindingRecord, { ...findingRecord(), status: "MAYBE" }),
    ).toThrow(/invalid entry/);

    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("appendEntry creates a missing file", () => {
    const file = path.join(dir, "RUNS.jsonl");
    appendEntry(file, RunRecord, runRecord());
    expect(readEntries(file, RunRecord).entries).toHaveLength(1);
  });
});

describe("findingKey", () => {
  it("is stable across docPath spellings", () => {
    const keys = ["./Foo/Bar.md", "foo//bar.mdx", "foo/bar", "FOO/BAR.MD"].map(
      (docPath) => findingKey({ docPath, symbol: "X", kind: "WRONG" }),
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{12}$/);
  });

  it("trims the symbol", () => {
    expect(findingKey({ docPath: "a", symbol: " X ", kind: "WRONG" })).toBe(
      findingKey({ docPath: "a", symbol: "X", kind: "WRONG" }),
    );
  });

  it("differs by kind, symbol and docPath", () => {
    const base = findingKey({ docPath: "a", symbol: "X", kind: "WRONG" });
    expect(findingKey({ docPath: "a", symbol: "X", kind: "STALE" })).not.toBe(
      base,
    );
    expect(findingKey({ docPath: "a", symbol: "Y", kind: "WRONG" })).not.toBe(
      base,
    );
    expect(findingKey({ docPath: "b", symbol: "X", kind: "WRONG" })).not.toBe(
      base,
    );
  });

  it("treats a null docPath as empty", () => {
    expect(findingKey({ docPath: null, symbol: "X", kind: "MISSING" })).toBe(
      findingKey({ docPath: "", symbol: "X", kind: "MISSING" }),
    );
  });

  it("normalizeDocPath", () => {
    expect(normalizeDocPath("./Foo//Bar.MDX")).toBe("foo/bar");
    expect(normalizeDocPath("a/b.md")).toBe("a/b");
    expect(normalizeDocPath("a/b.markdown")).toBe("a/b.markdown");
  });
});

describe("toFindingRecord", () => {
  it("copies the finding, verify status and context", () => {
    const f = finding();
    const record = toFindingRecord(
      f,
      { status: "REFUTED", note: "doc is right" },
      {
        runId: "r",
        taskId: "t",
        arm: "B",
        n: 2,
        docsSha: "s",
        pin: "p",
        cliVersion: "c",
        recordedAt: "2026-09-17T10:00:00Z",
      },
    );
    expect(record.key).toBe(findingKey(f));
    expect(record.status).toBe("REFUTED");
    expect(record.verifierNote).toBe("doc is right");
    expect(record.arm).toBe("B");
    expect(record.n).toBe(2);
    expect(record.claim).toBe(f.claim);
    expect(FindingRecord.safeParse(record).success).toBe(true);
  });
});

describe("summarizeFindings", () => {
  it("groups by key and sorts by occurrences then key", () => {
    const one = findingRecord({
      runId: "run-1",
      status: "VERIFIED",
      recordedAt: "2026-09-17T10:00:00Z",
    });
    const oneAgain = findingRecord({
      runId: "run-2",
      status: "UNVERIFIED",
      recordedAt: "2026-09-18T10:00:00Z",
      proposedEdit: "newer edit",
    });
    const oneThird = findingRecord({
      runId: "run-2",
      status: "VERIFIED",
      recordedAt: "2026-09-16T10:00:00Z",
    });
    const otherFinding = finding({ symbol: "Other", kind: "MISSING" });
    const other = findingRecord({
      ...otherFinding,
      key: findingKey(otherFinding),
      runId: "run-1",
      status: "REFUTED",
    });

    const rows = summarizeFindings([other, one, oneAgain, oneThird]);
    expect(rows).toHaveLength(2);

    expect(rows[0].key).toBe(one.key);
    expect(rows[0].occurrences).toBe(3);
    expect(rows[0].runs).toEqual(["run-1", "run-2"]);
    expect(rows[0].statuses).toEqual({
      VERIFIED: 2,
      REFUTED: 0,
      UNVERIFIED: 1,
    });
    expect(rows[0].latest.proposedEdit).toBe("newer edit");

    expect(rows[1].key).toBe(other.key);
    expect(rows[1].kind).toBe("MISSING");
    expect(rows[1].symbol).toBe("Other");
    expect(rows[1].statuses.REFUTED).toBe(1);
  });

  it("breaks ties by key ascending", () => {
    const a = findingRecord({ key: "bbb" });
    const b = findingRecord({ key: "aaa" });
    expect(summarizeFindings([a, b]).map((r) => r.key)).toEqual(["aaa", "bbb"]);
  });

  it("returns empty for no records", () => {
    expect(summarizeFindings([])).toEqual([]);
  });
});
