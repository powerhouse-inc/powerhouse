import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEntries } from "../src/lib/findings.js";
import {
  runLayout,
  type AttemptLayout,
  type RunLayout,
} from "../src/lib/paths.js";
import {
  describeRedo,
  filesToReset,
  listAttemptDirs,
  parseRedoReasons,
  redoFailedAttempts,
  redoStepFor,
} from "../src/lib/redo.js";
import { FindingRecord, RunRecord } from "../src/lib/schemas.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures/report");
const RUN_ID = "2026-09-17T10-00-00Z";

let tmp: string;
let run: RunLayout;
let findingsFile: string;
let runsFile: string;

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A build.json in the shape the driver writes; only failureReason matters here. */
function buildJson(failureReason: string | null): string {
  return JSON.stringify({
    ok: failureReason === null,
    skipped: false,
    failureReason,
    transcriptPath: "x",
    costUsd: 0,
    durationMs: 1,
    turns: null,
    exitCode: 0,
    killedByWallClock: false,
    claude: {
      ok: failureReason === null,
      failureReason: failureReason ?? undefined,
    },
  });
}

function stepJson(failureReason: string | null): string {
  return JSON.stringify({
    claude:
      failureReason === null ? { ok: true } : { ok: false, failureReason },
    kept: [],
    results: [],
  });
}

/** tests.json as the acceptance step writes it; only the graded fields matter. */
function testsJson(o: {
  tscOk?: boolean | null;
  vitestOk?: boolean | null;
  suiteErrors?: number;
  skipped?: boolean;
}): string {
  return JSON.stringify({
    kind: "vitest",
    tscOk: o.tscOk ?? true,
    vitestOk: o.vitestOk ?? true,
    suiteErrors: o.suiteErrors ?? 0,
    skipped: o.skipped ?? false,
  });
}

/** Every file the pipeline writes for a finished attempt. */
function fullAttempt(
  layout: AttemptLayout,
  o: {
    build?: string | null;
    judge?: string | null;
    verify?: string | null;
    tests?: string;
  },
): void {
  write(layout.prepareJson, "{}");
  write(layout.installLogPath, "installed");
  write(path.join(layout.workspaceDir, "src/index.ts"), "export {};");
  write(path.join(layout.workspaceDir, "node_modules/x/package.json"), "{}");
  write(layout.buildJson, buildJson(o.build ?? null));
  write(layout.transcriptPath, '{"type":"system","subtype":"init"}\n');
  write(layout.sessionJsonlPath, "");
  write(layout.stderrPath, "");
  write(layout.testsJson, o.tests ?? testsJson({}));
  write(layout.vitestJsonPath, "{}");
  write(path.join(layout.dir, "vitest.log"), "");
  write(layout.tscOutputPath, "");
  write(layout.metricsJson, "{}");
  write(layout.compactMd, "# t");
  write(path.join(layout.dtsDir, "a.d.ts"), "");
  write(layout.judgeJson, stepJson(o.judge ?? null));
  write(layout.judgeTranscriptPath, "");
  write(layout.judgeStderrPath, "");
  write(layout.verifyJson, stepJson(o.verify ?? null));
  write(layout.verifyTranscriptPath, "");
  write(layout.attemptJson, "{}");
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-redo-"));
  const runsRoot = path.join(tmp, "runs");
  cpSync(path.join(FIXTURES, "runs"), runsRoot, { recursive: true });
  run = runLayout(RUN_ID, runsRoot);
  findingsFile = path.join(tmp, "FINDINGS.jsonl");
  cpSync(path.join(FIXTURES, "FINDINGS.jsonl"), findingsFile);
  runsFile = path.join(tmp, "RUNS.jsonl");
  const record = readFileSync(run.runJson, "utf8");
  writeFileSync(
    runsFile,
    `${JSON.stringify({ ...(JSON.parse(record) as object), runId: "other" })}\n${JSON.stringify(JSON.parse(record))}\n`,
  );
  // docs/ and .install-cache must not be mistaken for tasks.
  write(path.join(run.docsDir, "INDEX.md"), "# docs");
  mkdirSync(run.installCacheDir, { recursive: true });

  fullAttempt(run.attempt("custom-read-model", "A", 1), {
    tests: testsJson({ tscOk: false }),
  });
  fullAttempt(run.attempt("custom-read-model", "A", 2), {
    judge: "rate-limited",
    tests: testsJson({ vitestOk: false }),
  });
  fullAttempt(run.attempt("custom-read-model", "B", 1), {
    verify: "wall-clock",
    tests: testsJson({ suiteErrors: 1 }),
  });
  fullAttempt(run.attempt("batch-progress", "A", 1), {
    build: "budget-exhausted",
  });
  fullAttempt(run.attempt("batch-progress", "A", 2), {
    build: "wall-clock",
    tests: testsJson({ tscOk: null, vitestOk: null, skipped: true }),
  });
  fullAttempt(run.attempt("batch-progress", "B", 1), {
    build: "rate-limited",
    tests: testsJson({ tscOk: null, vitestOk: null, skipped: true }),
  });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("listAttemptDirs", () => {
  it("finds every task/arm/n directory and nothing else", () => {
    expect(
      listAttemptDirs(run).map((a) => `${a.taskId}/${a.arm}/${a.n}`),
    ).toEqual([
      "batch-progress/A/1",
      "batch-progress/A/2",
      "batch-progress/B/1",
      "custom-read-model/A/1",
      "custom-read-model/A/2",
      "custom-read-model/B/1",
    ]);
    expect(listAttemptDirs(runLayout("nope", tmp))).toEqual([]);
  });
});

describe("redoStepFor", () => {
  it("picks the earliest step whose failure is listed", () => {
    const reasons = parseRedoReasons("rate-limited,wall-clock");
    expect(
      redoStepFor(run.attempt("custom-read-model", "A", 1), reasons),
    ).toBeNull();
    expect(
      redoStepFor(run.attempt("custom-read-model", "A", 2), reasons),
    ).toEqual({
      step: "judge",
      reason: "rate-limited",
    });
    expect(
      redoStepFor(run.attempt("custom-read-model", "B", 1), reasons),
    ).toEqual({
      step: "verify",
      reason: "wall-clock",
    });
    expect(
      redoStepFor(run.attempt("batch-progress", "A", 1), reasons),
    ).toBeNull();
    expect(
      redoStepFor(
        run.attempt("batch-progress", "A", 1),
        parseRedoReasons("budget-exhausted"),
      ),
    ).toEqual({ step: "build", reason: "budget-exhausted" });
    expect(redoStepFor(run.attempt("batch-progress", "B", 1), reasons)).toEqual(
      {
        step: "build",
        reason: "rate-limited",
      },
    );
  });

  it("tolerates a missing attempt directory", () => {
    expect(
      redoStepFor(run.attempt("ghost", "A", 9), parseRedoReasons("wall-clock")),
    ).toBeNull();
    expect(
      redoStepFor(
        run.attempt("ghost", "A", 9),
        parseRedoReasons("acceptance:any"),
      ),
    ).toBeNull();
  });

  it("acceptance: reads the grade in tests.json", () => {
    const a1 = run.attempt("custom-read-model", "A", 1);
    const a2 = run.attempt("custom-read-model", "A", 2);
    const b1 = run.attempt("custom-read-model", "B", 1);
    expect(redoStepFor(a1, parseRedoReasons("acceptance:tsc"))).toEqual({
      step: "acceptance",
      reason: "tsc",
    });
    expect(redoStepFor(a1, parseRedoReasons("acceptance:vitest"))).toBeNull();
    expect(redoStepFor(a2, parseRedoReasons("acceptance:vitest"))).toEqual({
      step: "acceptance",
      reason: "vitest",
    });
    expect(redoStepFor(b1, parseRedoReasons("acceptance:vitest"))).toEqual({
      step: "acceptance",
      reason: "vitest",
    });
    expect(redoStepFor(b1, parseRedoReasons("acceptance:tsc"))).toBeNull();
    expect(redoStepFor(a1, parseRedoReasons("acceptance:any"))).toEqual({
      step: "acceptance",
      reason: "any",
    });
    // A failed step wins; a skipped grade has nothing to redo, so record: applies.
    expect(
      redoStepFor(a2, parseRedoReasons("rate-limited,acceptance:vitest")),
    ).toEqual({ step: "judge", reason: "rate-limited" });
    expect(
      redoStepFor(
        run.attempt("batch-progress", "A", 2),
        parseRedoReasons("acceptance:any"),
      ),
    ).toBeNull();
    expect(
      redoStepFor(
        run.attempt("batch-progress", "A", 1),
        parseRedoReasons("acceptance:tsc,record:budget-exhausted"),
      ),
    ).toEqual({ step: "record", reason: "budget-exhausted" });
  });
});

describe("filesToReset", () => {
  it("record only touches attempt.json", () => {
    const layout = run.attempt("t", "A", 1);
    expect(filesToReset(layout, "record")).toEqual([layout.attemptJson]);
  });

  it("acceptance takes the grade and attempt.json, not the judge", () => {
    const layout = run.attempt("t", "A", 1);
    expect(filesToReset(layout, "acceptance")).toEqual([
      layout.testsJson,
      layout.vitestJsonPath,
      path.join(layout.dir, "vitest.log"),
      layout.tscOutputPath,
      layout.reinstallLogPath,
      layout.attemptJson,
    ]);
    expect(filesToReset(layout, "build")).toEqual(
      expect.arrayContaining(filesToReset(layout, "acceptance")),
    );
  });

  it("is nested: verify within judge within build", () => {
    const layout = run.attempt("t", "A", 1);
    const verify = filesToReset(layout, "verify");
    const judge = filesToReset(layout, "judge");
    const build = filesToReset(layout, "build");
    expect(verify).toContain(layout.attemptJson);
    expect(verify).not.toContain(layout.judgeJson);
    expect(judge).toEqual(expect.arrayContaining(verify));
    expect(judge).toContain(layout.judgeJson);
    expect(judge).not.toContain(layout.buildJson);
    expect(build).toEqual(expect.arrayContaining(judge));
    expect(build).toEqual(
      expect.arrayContaining([
        layout.buildJson,
        layout.transcriptPath,
        layout.testsJson,
        layout.metricsJson,
        layout.compactMd,
        layout.prepareJson,
        layout.workspaceDir,
      ]),
    );
  });
});

describe("redoFailedAttempts", () => {
  it("moves the failed step and everything downstream aside, keeps the rest", () => {
    const result = redoFailedAttempts(run, { findingsFile, runsFile });
    expect(
      result.reset.map(
        (r) => `${r.taskId}/${r.arm}/${r.n}:${r.step}:${r.reason}`,
      ),
    ).toEqual([
      "batch-progress/A/2:build:wall-clock",
      "batch-progress/B/1:build:rate-limited",
      "custom-read-model/A/2:judge:rate-limited",
      "custom-read-model/B/1:verify:wall-clock",
    ]);

    // Untouched attempts keep every file.
    const a1 = run.attempt("custom-read-model", "A", 1);
    expect(existsSync(a1.attemptJson)).toBe(true);
    expect(existsSync(path.join(a1.dir, "previous"))).toBe(false);
    const bp1 = run.attempt("batch-progress", "A", 1);
    expect(existsSync(bp1.buildJson)).toBe(true);

    // Build redo: only the prompts and settings stay; the workspace goes aside without node_modules.
    const bp2 = run.attempt("batch-progress", "A", 2);
    for (const f of [
      bp2.buildJson,
      bp2.transcriptPath,
      bp2.testsJson,
      bp2.metricsJson,
      bp2.judgeJson,
      bp2.verifyJson,
      bp2.attemptJson,
      bp2.prepareJson,
      bp2.workspaceDir,
      bp2.dtsDir,
    ]) {
      expect(existsSync(f)).toBe(false);
    }
    const prev = path.join(bp2.dir, "previous", "1");
    expect(existsSync(path.join(prev, "transcript.stream.jsonl"))).toBe(true);
    expect(existsSync(path.join(prev, "build.json"))).toBe(true);
    expect(existsSync(path.join(prev, "workspace/src/index.ts"))).toBe(true);
    expect(existsSync(path.join(prev, "workspace/node_modules"))).toBe(false);
    expect(result.reset[0].previousDir).toBe(prev);
    expect(result.reset[0].moved).toContain("transcript.stream.jsonl");

    // Judge redo keeps the build and its grading.
    const a2 = run.attempt("custom-read-model", "A", 2);
    expect(existsSync(a2.buildJson)).toBe(true);
    expect(existsSync(a2.testsJson)).toBe(true);
    expect(existsSync(a2.metricsJson)).toBe(true);
    expect(existsSync(a2.compactMd)).toBe(true);
    expect(existsSync(a2.judgeJson)).toBe(false);
    expect(existsSync(a2.judgeTranscriptPath)).toBe(false);
    expect(existsSync(a2.verifyJson)).toBe(false);
    expect(existsSync(a2.attemptJson)).toBe(false);
    expect(existsSync(path.join(a2.dir, "previous/1/judge.stream.jsonl"))).toBe(
      true,
    );

    // Verify redo keeps the judge.
    const b1 = run.attempt("custom-read-model", "B", 1);
    expect(existsSync(b1.judgeJson)).toBe(true);
    expect(existsSync(b1.verifyJson)).toBe(false);
    expect(existsSync(b1.attemptJson)).toBe(false);
  });

  it("removes only the reset attempts' findings and the run's RUNS line, and reopens run.json", () => {
    const before = readEntries(findingsFile, FindingRecord).entries;
    expect(before).toHaveLength(4);
    const result = redoFailedAttempts(run, { findingsFile, runsFile });
    const after = readEntries(findingsFile, FindingRecord).entries;
    // A#2 (reset) had two findings; A#1 and the other run's line stay.
    expect(after.map((f) => `${f.runId} ${f.taskId}/${f.arm}/${f.n}`)).toEqual([
      `${RUN_ID} custom-read-model/A/1`,
      "other-run batch-progress/A/1",
    ]);
    const a2 = result.reset.find(
      (r) => r.taskId === "custom-read-model" && r.n === 2,
    );
    expect(a2?.findingsRemoved).toBe(2);

    expect(result.runLineRemoved).toBe(true);
    const runs = readEntries(runsFile, RunRecord).entries;
    expect(runs.map((r) => r.runId)).toEqual(["other"]);

    const record = RunRecord.parse(
      JSON.parse(readFileSync(run.runJson, "utf8")),
    );
    expect(record.finishedAt).toBeNull();
    expect(record.attempts.map((a) => `${a.taskId}/${a.arm}/${a.n}`)).toEqual([
      "custom-read-model/A/1",
      "batch-progress/A/1",
    ]);
  });

  it("record: moves only attempt.json aside and drops the findings", () => {
    const result = redoFailedAttempts(run, {
      reasons: parseRedoReasons("record:budget-exhausted"),
      findingsFile,
      runsFile,
    });
    expect(
      result.reset.map((r) => `${r.taskId}/${r.arm}/${r.n}:${r.step}`),
    ).toEqual(["batch-progress/A/1:record"]);
    const bp1 = run.attempt("batch-progress", "A", 1);
    expect(existsSync(bp1.attemptJson)).toBe(false);
    expect(existsSync(bp1.buildJson)).toBe(true);
    expect(existsSync(bp1.judgeJson)).toBe(true);
    expect(existsSync(bp1.verifyJson)).toBe(true);
    expect(result.reset[0].moved).toEqual(["attempt.json"]);
    expect(result.runLineRemoved).toBe(true);
  });

  it("acceptance: re-grades and re-records without re-judging", () => {
    const result = redoFailedAttempts(run, {
      reasons: parseRedoReasons("acceptance:tsc"),
      findingsFile,
      runsFile,
    });
    expect(
      result.reset.map(
        (r) => `${r.taskId}/${r.arm}/${r.n}:${r.step}:${r.reason}`,
      ),
    ).toEqual(["custom-read-model/A/1:acceptance:tsc"]);
    const a1 = run.attempt("custom-read-model", "A", 1);
    expect(result.reset[0].moved).toEqual([
      "tests.json",
      "vitest.json",
      "vitest.log",
      "tsc.log",
      "attempt.json",
    ]);
    for (const f of [
      a1.testsJson,
      a1.vitestJsonPath,
      a1.tscOutputPath,
      a1.attemptJson,
    ]) {
      expect(existsSync(f)).toBe(false);
    }
    for (const f of [
      a1.prepareJson,
      a1.buildJson,
      a1.transcriptPath,
      a1.metricsJson,
      a1.compactMd,
      a1.dtsDir,
      a1.judgeJson,
      a1.verifyJson,
      path.join(a1.workspaceDir, "src/index.ts"),
      path.join(a1.workspaceDir, "node_modules/x/package.json"),
    ]) {
      expect(existsSync(f)).toBe(true);
    }
    expect(existsSync(path.join(a1.dir, "previous/1/tests.json"))).toBe(true);

    expect(result.reset[0].findingsRemoved).toBe(1);
    const after = readEntries(findingsFile, FindingRecord).entries;
    expect(after.map((f) => `${f.runId} ${f.taskId}/${f.arm}/${f.n}`)).toEqual([
      `${RUN_ID} custom-read-model/A/2`,
      `${RUN_ID} custom-read-model/A/2`,
      "other-run batch-progress/A/1",
    ]);
    expect(result.runLineRemoved).toBe(true);
  });

  it("is a no-op when nothing matches, leaving the records alone", () => {
    const result = redoFailedAttempts(run, {
      reasons: parseRedoReasons("spawn-error"),
      findingsFile,
      runsFile,
    });
    expect(result).toEqual({ reset: [], runLineRemoved: false });
    expect(readEntries(runsFile, RunRecord).entries).toHaveLength(2);
    expect(describeRedo(result)).toEqual(["redo: nothing to reset"]);
    const record = RunRecord.parse(
      JSON.parse(readFileSync(run.runJson, "utf8")),
    );
    expect(record.finishedAt).not.toBeNull();
  });

  it("numbers previous/ so a second redo loses nothing", () => {
    redoFailedAttempts(run, { findingsFile, runsFile });
    const bp2 = run.attempt("batch-progress", "B", 1);
    write(bp2.buildJson, buildJson("rate-limited"));
    write(bp2.transcriptPath, "again");
    redoFailedAttempts(run, { findingsFile, runsFile });
    expect(existsSync(path.join(bp2.dir, "previous/1/build.json"))).toBe(true);
    expect(
      readFileSync(
        path.join(bp2.dir, "previous/2/transcript.stream.jsonl"),
        "utf8",
      ),
    ).toBe("again");
  });

  it("refuses to rewrite a records file with unparseable lines", () => {
    writeFileSync(
      findingsFile,
      `${readFileSync(findingsFile, "utf8")}{ not json\n`,
    );
    expect(() => redoFailedAttempts(run, { findingsFile, runsFile })).toThrow(
      /unparseable/,
    );
  });

  it("describes what it did", () => {
    const lines = describeRedo(
      redoFailedAttempts(run, { findingsFile, runsFile }),
    );
    expect(lines[0]).toMatch(
      /^redo batch-progress A#2: build wall-clock; moved \d+ file\(s\) to /,
    );
    expect(
      lines.find((l) => l.startsWith("redo custom-read-model A#2")),
    ).toContain("removed 2 finding(s)");
    expect(lines.at(-1)).toBe("redo: removed the run's RUNS.jsonl line");
  });
});

describe("parseRedoReasons", () => {
  const any = (reason: string) => ({ step: null, reason });

  it("defaults to rate-limited and wall-clock in any step", () => {
    expect(parseRedoReasons(undefined)).toEqual([
      any("rate-limited"),
      any("wall-clock"),
    ]);
    expect(parseRedoReasons(true)).toEqual(parseRedoReasons(undefined));
  });

  it("parses a comma list with optional step prefixes and rejects unknown names", () => {
    expect(
      parseRedoReasons("budget-exhausted, judge:api-error,record:wall-clock"),
    ).toEqual([
      any("budget-exhausted"),
      { step: "judge", reason: "api-error" },
      { step: "record", reason: "wall-clock" },
    ]);
    expect(() => parseRedoReasons("nope")).toThrow();
    expect(() => parseRedoReasons("extract:wall-clock")).toThrow();
  });

  it("scopes tsc, vitest and any to the acceptance step only", () => {
    expect(parseRedoReasons("acceptance:tsc,acceptance:vitest")).toEqual([
      { step: "acceptance", reason: "tsc" },
      { step: "acceptance", reason: "vitest" },
    ]);
    expect(parseRedoReasons("acceptance:any")).toEqual([
      { step: "acceptance", reason: "any" },
    ]);
    expect(() => parseRedoReasons("tsc")).toThrow();
    expect(() => parseRedoReasons("judge:tsc")).toThrow();
    expect(() => parseRedoReasons("acceptance:wall-clock")).toThrow();
  });
});
