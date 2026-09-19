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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeReport } from "../src/commands/report.js";
import { runLayout } from "../src/lib/paths.js";
import {
  loadAttemptMetrics,
  loadPhLoraMapping,
  matrixSize,
  renderReport,
  sectionRel,
  withAttemptsOnDisk,
  type PhLoraMapping,
} from "../src/lib/report.js";
import { AttemptSummary, RunRecord } from "../src/lib/schemas.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures/report");
const RUN_ID = "2026-09-17T10-00-00Z";

const mapping: PhLoraMapping = {
  sections: [
    {
      id: "reference-reactor",
      label: "Reactor",
      docPath: "docs/academy/04-Reference/01-Reactor",
    },
    {
      id: "build-work-with-data",
      label: "Data",
      docPath: "docs/academy/03-Build/04-WorkWithData",
    },
    {
      id: "reference-cli",
      label: "CLI",
      docPath: "docs/academy/04-Reference/07-CLITooling",
    },
  ],
};
const tasks = [
  {
    id: "custom-read-model",
    docSections: [
      "reference-reactor",
      "build-work-with-data",
      "reference-cli",
      "nope",
    ],
  },
];

let runsRoot: string;
beforeAll(() => {
  runsRoot = mkdtempSync(path.join(tmpdir(), "doc-harness-report-"));
  cpSync(path.join(FIXTURES, "runs"), runsRoot, { recursive: true });
});
afterAll(() => {
  rmSync(runsRoot, { recursive: true, force: true });
});

describe("loadAttemptMetrics", () => {
  it("reads metrics.json and tolerates a missing file", () => {
    const layout = runLayout(RUN_ID, runsRoot);
    const a1 = loadAttemptMetrics(layout, {
      taskId: "custom-read-model",
      arm: "A",
      n: 1,
    });
    expect(a1?.docPagesRead).toHaveLength(4);
    expect(
      loadAttemptMetrics(layout, {
        taskId: "custom-read-model",
        arm: "B",
        n: 1,
      }),
    ).toBeNull();
  });
});

describe("ph-lora mapping", () => {
  it("parses the real file", () => {
    const real = loadPhLoraMapping();
    expect(real.sections.map((s) => s.id)).toContain("reference-reactor");
  });

  it("maps section docPath to a docs snapshot relative path", () => {
    expect(sectionRel("docs/academy/04-Reference/01-Reactor")).toBe(
      "04-Reference/01-Reactor",
    );
  });
});

describe("writeReport", () => {
  let report: string;
  let target: string;

  beforeAll(() => {
    target = writeReport({
      runId: RUN_ID,
      runsRoot,
      findingsFile: path.join(FIXTURES, "FINDINGS.jsonl"),
      tasks,
      mapping,
    });
    report = readFileSync(target, "utf8");
  });

  it("writes REPORT.md into the run directory by default", () => {
    expect(target).toBe(runLayout(RUN_ID, runsRoot).reportMd);
    expect(existsSync(target)).toBe(true);
  });

  it("renders the header", () => {
    expect(report).toContain(`# doc-harness report: ${RUN_ID}`);
    // Finished: 5 attempts against a 2x2x2 matrix is not partial.
    expect(report).not.toContain("partial");
    expect(report).toContain("docsSha: `abc1234def5678`");
    expect(report).toContain("pin: `6.2.2-dev.62`");
    expect(report).toContain("cliVersion: `2.1.258`");
    expect(report).toContain(
      "attempts: 5 (1 contaminated, 0 rate-limited; both excluded from rates); 0 truncated",
    );
    expect(report).toContain("unmetered (killed) attempts: 1");
  });

  it("renders one attempts row per task and arm", () => {
    expect(report).toContain(
      "| custom-read-model | A | 2 | 2/2 | 0 | 4/6 | 32.0 | $3.75 | 2 ok | dts-read: 2 | 0 | 0 |",
    );
    expect(report).toContain(
      "| custom-read-model | B | 1 | 1/1 | 0 | 3/3 | 18.0 | $1.00 | 1 ok | none | 0 | 0 |",
    );
    // A#2 was killed by the wall clock: its recorded cost is not trusted.
    expect(report).toContain(
      "| batch-progress | A | 2 | 1/2 | 0 | 0/0 | 12.0 | $0.40 (+1 unmetered) | 2 ok | dts-read: 6, denied-path-bash: 1 | 1 | 0 |",
    );
  });

  it("computes pass rates without contaminated attempts and the dts-read headline", () => {
    expect(report).toContain("| A | 33% (1/3) | 3 | 1.00 |");
    expect(report).toContain("| B | 100% (1/1) | 0 | 0.00 |");
    expect(report).toContain("| custom-read-model | 50% (1/2) | 100% (1/1) |");
    expect(report).toContain("| batch-progress | 0% (0/1) | n/a |");
  });

  it("groups findings by key, most recurrent first, with the latest proposed edit", () => {
    expect(report).toContain("3 records, 2 distinct keys");
    const a = report.indexOf(
      "### aaaaaaaaaaaa WRONG `ReactorBuilder.withReadModel`",
    );
    const b = report.indexOf("### bbbbbbbbbbbb MISSING `IReadModel.query`");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(report).toContain("occurrences: 2 (VERIFIED 1, UNVERIFIED 1)");
    expect(report).toContain(
      "attempts: custom-read-model/A/1, custom-read-model/A/2",
    );
    expect(report).toContain(
      "> Pass a factory function:\n>\n> .withReadModel(() => new DocumentCountReadModel())",
    );
    expect(report).not.toContain("cccccccccccc");
  });

  it("marks doc coverage from arm A metrics", () => {
    expect(report).toContain(
      "| custom-read-model | reference-reactor | `04-Reference/01-Reactor` | yes | 2 of 4 pages read (2/2 arm A attempts with metrics) |",
    );
    expect(report).toContain(
      "| custom-read-model | build-work-with-data | `03-Build/04-WorkWithData` | yes |",
    );
    expect(report).toContain(
      "| custom-read-model | reference-cli | `04-Reference/07-CLITooling` | no |",
    );
    expect(report).toContain(
      "| custom-read-model | nope | (unknown section) | - | - |",
    );
    expect(report).toContain(
      "| batch-progress | (not in catalog) | - | - | - |",
    );
  });

  it("honours --out", () => {
    const out = path.join(runsRoot, "elsewhere", "R.md");
    expect(
      writeReport({
        runId: RUN_ID,
        runsRoot,
        findingsFile: path.join(FIXTURES, "FINDINGS.jsonl"),
        out,
        tasks,
        mapping,
      }),
    ).toBe(out);
    expect(existsSync(out)).toBe(true);
  });

  it("fails on an unknown run", () => {
    expect(() => writeReport({ runId: "nope", runsRoot })).toThrow(/not found/);
  });
});

describe("renderReport with rate-limited and truncated attempts", () => {
  const run = RunRecord.parse(
    JSON.parse(
      readFileSync(path.join(FIXTURES, "runs", RUN_ID, "run.json"), "utf8"),
    ),
  );
  const base = run.attempts[2];
  run.attempts.push(
    {
      ...base,
      n: 2,
      status: "complete",
      buildOk: false,
      buildFailureReason: "budget-exhausted",
      truncated: true,
      acceptanceOk: true,
      testsPassed: 3,
      testsTotal: 3,
      costUsd: 3.0,
      judgeFailed: "budget-exhausted",
    },
    {
      ...base,
      taskId: "batch-progress",
      n: 1,
      status: "rate-limited",
      buildOk: false,
      buildFailureReason: "rate-limited",
      acceptanceOk: null,
      testsPassed: 0,
      testsTotal: 0,
      turns: null,
      costUsd: 0,
      buildTokens: 2_800_000,
      findingsKept: 0,
    },
  );
  const md = renderReport(run, [], { mapping, tasks });

  it("excludes rate-limited attempts from the rates and says so", () => {
    expect(md).toContain(
      "attempts: 7 (1 contaminated, 1 rate-limited; both excluded from rates); 1 truncated",
    );
    expect(md).toContain("unmetered (killed) attempts: 2");
    // B: the truncated build passed its tests and is counted, marked; the rate-limited one is not counted.
    expect(md).toContain("| B | 100% (2/2, 1 truncated) | 0 | 0.00 |");
    expect(md).toContain(
      "| custom-read-model | 50% (1/2) | 100% (2/2, 1 truncated) |",
    );
    expect(md).toContain("| batch-progress | 0% (0/1) | n/a |");
    expect(md).toContain(
      "how many of its passes were builds that hit their budget",
    );
    expect(md).toContain("excluded from the rates below");
  });

  it("shows the truncated marker, the judge column and tokens for unmetered cost", () => {
    expect(md).toContain(
      "| custom-read-model | B | 2 | 1/2 | 1 | 6/6 | 18.0 | $4.00 | 1 ok, 1 budget-exhausted | none | 0 | 0 |",
    );
    expect(md).toContain(
      "| batch-progress | B | 1 | 0/1 | 0 | 0/0 | - | $0.00 (+1 unmetered, 2.8M tok) | 1 skipped | none | 0 | 1 |",
    );
  });

  it("parses attempt.json files written before the new fields existed", () => {
    const { truncated: _t, buildTokens: _b, judgeFailed: _j, ...old } = base;
    const parsed = AttemptSummary.parse(old);
    expect(parsed).toMatchObject({
      truncated: false,
      buildTokens: null,
      judgeFailed: null,
    });
  });
});

describe("renderReport without metrics or catalog", () => {
  it("reports coverage as unknown and no findings", () => {
    const run = RunRecord.parse(
      JSON.parse(
        readFileSync(path.join(FIXTURES, "runs", RUN_ID, "run.json"), "utf8"),
      ),
    );
    const md = renderReport(run, [], { mapping, tasks });
    expect(md).toContain("No findings were recorded for this run.");
    expect(md).toContain(
      "| custom-read-model | reference-reactor | `04-Reference/01-Reactor` | unknown |",
    );
  });
});

describe("report mid-run", () => {
  const fixture = RunRecord.parse(
    JSON.parse(
      readFileSync(path.join(FIXTURES, "runs", RUN_ID, "run.json"), "utf8"),
    ),
  );

  function openRun(dir: string, attempts: AttemptSummary[]) {
    const layout = runLayout(RUN_ID, dir);
    mkdirSync(layout.root, { recursive: true });
    writeFileSync(
      layout.runJson,
      JSON.stringify({ ...fixture, finishedAt: null, attempts: [] }),
    );
    for (const a of attempts) {
      const file = layout.attempt(a.taskId, a.arm, a.n).attemptJson;
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(a));
    }
    // A running attempt has no attempt.json yet; docs/ is not a task.
    mkdirSync(layout.attempt("batch-progress", "B", 1).workspaceDir, {
      recursive: true,
    });
    mkdirSync(layout.docsDir, { recursive: true });
    return layout;
  }

  it("withAttemptsOnDisk fills in what run.json lacks, recorded first", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-harness-midrun-"));
    try {
      const layout = openRun(dir, fixture.attempts.slice(0, 3));
      const broken = layout.attempt("custom-read-model", "B", 2).attemptJson;
      mkdirSync(path.dirname(broken), { recursive: true });
      writeFileSync(broken, "{ not json");
      const ids = (list: AttemptSummary[]) =>
        list.map((a) => `${a.taskId}/${a.arm}/${a.n}`);
      expect(ids(withAttemptsOnDisk(layout, []))).toEqual([
        "custom-read-model/A/1",
        "custom-read-model/A/2",
        "custom-read-model/B/1",
      ]);
      const recorded = {
        ...fixture.attempts[1],
        status: "build-fail" as const,
      };
      const merged = withAttemptsOnDisk(layout, [recorded]);
      expect(ids(merged)).toEqual([
        "custom-read-model/A/2",
        "custom-read-model/A/1",
        "custom-read-model/B/1",
      ]);
      expect(merged[0].status).toBe("build-fail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("matrixSize expands the args, honouring each task's arms", () => {
    const args = { tasks: ["a", "b"], arms: ["A", "B"] as const, n: 3 };
    expect(matrixSize({ ...args, arms: [...args.arms] })).toBe(12);
    expect(
      matrixSize({ ...args, arms: [...args.arms] }, [
        { id: "a", docSections: [], arms: ["A"] },
        { id: "b", docSections: [] },
      ]),
    ).toBe(9);
    expect(matrixSize({ tasks: [], arms: ["A"], n: 2 })).toBeNull();
    expect(
      matrixSize({ tasks: [], arms: ["A"], n: 2 }, [
        { id: "a", docSections: [], arms: ["A", "B"] },
        { id: "b", docSections: [], arms: ["B"] },
      ]),
    ).toBe(2);
  });

  it("writeReport reports the attempts on disk and says how partial it is", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-harness-midrun-"));
    try {
      const layout = openRun(dir, fixture.attempts.slice(0, 3));
      const md = readFileSync(
        writeReport({
          runId: RUN_ID,
          runsRoot: dir,
          findingsFile: path.join(FIXTURES, "FINDINGS.jsonl"),
          tasks,
          mapping,
        }),
        "utf8",
      );
      expect(md).toContain("**partial: 3 of 8 attempts**");
      expect(md).toContain("- attempts: 3 of 8 (partial) (0 contaminated");
      expect(md).toContain("finished: (unfinished)");
      expect(md).toContain(
        "| custom-read-model | A | 2 | 2/2 | 0 | 4/6 | 32.0 | $3.75 | 2 ok | dts-read: 2 | 0 | 0 |",
      );
      expect(md).toContain("| custom-read-model | B | 1 |");
      expect(md).not.toContain("| batch-progress |");
      // run.json itself is left for summarize to fill in.
      expect(
        RunRecord.parse(JSON.parse(readFileSync(layout.runJson, "utf8")))
          .attempts,
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
