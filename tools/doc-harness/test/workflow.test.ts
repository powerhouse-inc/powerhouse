import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ClaudeDriver,
  ClaudeInvocation,
} from "../src/lib/claude-driver.js";
import {
  clearHarnessContext,
  deniedRoots,
  setHarnessContext,
  type HarnessContext,
} from "../src/lib/context.js";
import { FakeClaude } from "../src/lib/fake-claude.js";
import { runLayout } from "../src/lib/paths.js";
import {
  AttemptSummary,
  FindingRecord,
  RunRecord,
  type VerifyResult,
} from "../src/lib/schemas.js";
import { Semaphore } from "../src/lib/semaphore.js";
import { pathRule } from "../src/lib/settings.js";
import { createMastra } from "../src/mastra/create.js";
import { mergeVerifyResults } from "../src/steps/verify.js";
import type { HarnessRunInput } from "../src/workflows/harness-run.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const OK_TRANSCRIPT = path.join(FIXTURES, "fake-claude/ok.jsonl");
const RUN_ID = "2026-09-17T12-00-00Z";

/** The judge and the verifier share one driver; route on the schema file. */
class RoutingDriver implements ClaudeDriver {
  readonly name = "routing";
  constructor(
    readonly judge: FakeClaude,
    readonly verifier: FakeClaude,
  ) {}
  version(): Promise<string> {
    return this.judge.version();
  }
  run(inv: ClaudeInvocation) {
    return inv.jsonSchemaFile?.endsWith("verifier.schema.json") === true
      ? this.verifier.run(inv)
      : this.judge.run(inv);
  }
}

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  }).trim();
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const taskPrompt = "Build the thing the docs describe. ".repeat(8);

function catalogJson(): string {
  const base = {
    brief: null,
    difficulty: "S",
    taskPrompt,
    contract: [{ file: "src/index.ts", exports: ["run"] }],
    pinnedInputs: [],
    docSections: ["reference-reactor"],
    packages: ["@powerhousedao/reactor"],
    timeouts: { buildMs: 60_000, acceptanceMs: 60_000 },
    budgets: { buildUsd: 1, maxTurns: 10, judgeUsd: 1, verifyUsd: 1 },
  };
  return JSON.stringify({
    pin: "6.2.2-dev.62",
    tasks: [
      {
        ...base,
        id: "alpha",
        title: "Alpha",
        recipeDir: "alpha",
        acceptance: {
          kind: "vitest",
          files: [{ from: "tests/alpha.test.ts", to: "tests/alpha.test.ts" }],
        },
      },
      {
        ...base,
        id: "beta",
        title: "Beta",
        recipeDir: "beta",
        acceptance: { kind: "tsc-only", files: [] },
      },
    ],
  });
}

const judgeOutput = {
  findings: [
    {
      kind: "MISSING",
      docPath: null,
      line: null,
      quote: null,
      symbol: "withFrobnicator",
      claim: "No page explains how to register a frobnicator.",
      evidence: [{ turn: 2, uuid: null }],
      proposedEdit: "Add a section on withFrobnicator to reactor/builder.md.",
      confidence: 0.7,
    },
  ],
  summary: "One gap.",
  buildQualityNotes: "Fine.",
};

const verifierOutput = {
  results: [
    {
      index: 0,
      status: "VERIFIED",
      prediction: "grep finds no withFrobnicator in the docs",
      observation: "no hits",
      note: "reproduced",
    },
  ],
};

describe("harnessRun dry run", () => {
  let tmp: string;
  let ctx: HarnessContext;
  let builder: FakeClaude;
  let judge: FakeClaude;
  let verifier: FakeClaude;
  let input: HarnessRunInput;
  let mastra: ReturnType<typeof createMastra>;
  let stateDir: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-workflow-"));
    const monorepoRoot = path.join(tmp, "monorepo");
    write(
      path.join(monorepoRoot, "apps/academy/docs/academy/reactor/builder.md"),
      "# ReactorBuilder\n\nUse `ReactorBuilder` to build a reactor.\n",
    );
    write(
      path.join(monorepoRoot, "apps/academy/docs/academy/img/x.png"),
      "not a docs page",
    );
    git(monorepoRoot, "init", "-q");
    git(monorepoRoot, "add", "-A");
    git(monorepoRoot, "commit", "-q", "-m", "docs");

    const recipesRoot = path.join(tmp, "recipes");
    write(
      path.join(recipesRoot, "alpha/src/index.ts"),
      "export const run = 1;\n",
    );
    write(
      path.join(recipesRoot, "beta/src/index.ts"),
      "export const run = 2;\n",
    );
    const pinnedRoot = path.join(tmp, "pinned");
    write(path.join(pinnedRoot, "alpha/tests/alpha.test.ts"), "// hidden\n");
    const catalogFile = path.join(tmp, "tasks.json");
    writeFileSync(catalogFile, catalogJson());
    stateDir = path.join(tmp, "state");

    builder = new FakeClaude({ transcriptFixture: OK_TRANSCRIPT });
    judge = new FakeClaude({
      transcriptFixture: OK_TRANSCRIPT,
      structuredOutput: judgeOutput,
    });
    verifier = new FakeClaude({
      transcriptFixture: OK_TRANSCRIPT,
      structuredOutput: verifierOutput,
    });
    ctx = {
      driver: builder,
      judgeDriver: new RoutingDriver(judge, verifier),
      runsRoot: path.join(tmp, "runs"),
      recipesRoot,
      monorepoRoot,
      pinnedRoot,
      catalogFile,
      findingsFile: path.join(tmp, "FINDINGS.jsonl"),
      runsFile: path.join(tmp, "RUNS.jsonl"),
      dryRun: true,
      semaphore: new Semaphore(2),
      log: () => undefined,
    };
    input = {
      runId: RUN_ID,
      tasks: ["alpha", "beta"],
      arms: ["A", "B"],
      n: 1,
      docsSha: "HEAD",
      pin: "6.2.2-dev.62",
      args: {
        tasks: ["alpha", "beta"],
        arms: ["A", "B"],
        n: 1,
        concurrency: 2,
        dryRun: true,
        sandbox: "dontAsk",
        auth: "oauth-isolated",
        skipVerify: false,
        keepWorkspaces: false,
        builderModel: "claude-sonnet-5",
        judgeModel: "claude-opus-5",
      },
    };
    setHarnessContext(RUN_ID, ctx);
    mastra = createMastra(stateDir);
  });

  afterAll(async () => {
    clearHarnessContext(RUN_ID);
    await mastra.shutdown().catch(() => undefined);
    rmSync(tmp, { recursive: true, force: true });
  });

  async function drive() {
    const run = await mastra
      .getWorkflow("harnessRun")
      .createRun({ runId: RUN_ID });
    return run.start({ inputData: input });
  }

  function lines(file: string): string[] {
    return existsSync(file)
      ? readFileSync(file, "utf8")
          .split("\n")
          .filter((l) => l.length > 0)
      : [];
  }

  it("runs 2 tasks x 2 arms end to end on fakes", async () => {
    const startedAt = Date.now();
    const result = await drive();
    const wallMs = Date.now() - startedAt;
    if (result.status !== "success") throw new Error(JSON.stringify(result));
    expect(result.result).toMatchObject({
      attempts: 4,
      complete: 4,
      failed: 0,
      contaminated: 0,
      findingsAppended: 4,
    });

    const layout = runLayout(RUN_ID, ctx.runsRoot);
    expect(existsSync(layout.docsIndex)).toBe(true);
    expect(existsSync(path.join(layout.docsDir, "img/x.png"))).toBe(false);
    const run = RunRecord.parse(
      JSON.parse(readFileSync(layout.runJson, "utf8")),
    );
    expect(run.attempts).toHaveLength(4);
    expect(run.finishedAt).not.toBeNull();
    expect(run.docsFileCount).toBe(1);
    expect(run.cliVersion).toBe("2.1.258");
    expect(existsSync(layout.reportMd)).toBe(true);
    expect(lines(ctx.runsFile!)).toHaveLength(1);

    const findings = lines(ctx.findingsFile!).map((l) =>
      FindingRecord.parse(JSON.parse(l)),
    );
    expect(findings).toHaveLength(4);
    expect(new Set(findings.map((f) => f.status))).toEqual(
      new Set(["VERIFIED"]),
    );
    expect(findings[0]).toMatchObject({
      runId: RUN_ID,
      symbol: "withFrobnicator",
      pin: "6.2.2-dev.62",
      docsSha: run.docsSha,
    });

    for (const taskId of ["alpha", "beta"]) {
      for (const arm of ["A", "B"] as const) {
        const attempt = layout.attempt(taskId, arm, 1);
        const summary = AttemptSummary.parse(
          JSON.parse(readFileSync(attempt.attemptJson, "utf8")),
        );
        expect(summary).toMatchObject({
          taskId,
          arm,
          status: "complete",
          buildOk: true,
          tscOk: null,
          findingsKept: 1,
          findingsVerified: 1,
        });
        expect(existsSync(attempt.metricsJson)).toBe(true);
        expect(existsSync(attempt.compactMd)).toBe(true);
        expect(existsSync(attempt.judgeJson)).toBe(true);
        expect(existsSync(attempt.verifyJson)).toBe(true);
        expect(
          existsSync(path.join(attempt.workspaceDir, "package.json")),
        ).toBe(true);
        expect(
          existsSync(path.join(attempt.referenceDir, "src/index.ts")),
        ).toBe(arm === "B");
        const settings = JSON.parse(
          readFileSync(attempt.settingsFile, "utf8"),
        ) as {
          permissions: { deny: string[] };
        };
        const refRule = pathRule("Read", attempt.referenceDir);
        expect(settings.permissions.deny.includes(refRule)).toBe(arm === "A");
        expect(settings.permissions.deny).toContain(
          pathRule("Read", ctx.monorepoRoot),
        );
        expect(settings.permissions.deny).toContain(
          pathRule("Read", ctx.recipesRoot),
        );
      }
    }
    expect(
      existsSync(
        path.join(
          layout.attempt("alpha", "A", 1).workspaceDir,
          "tests/alpha.test.ts",
        ),
      ),
    ).toBe(true);

    expect(builder.invocations).toHaveLength(4);
    for (const inv of builder.invocations) {
      expect(inv.addDirs).toEqual([layout.docsDir]);
      expect(inv.tools).toEqual([
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
      ]);
      expect(inv.permissionMode).toBe("dontAsk");
      expect(inv.model).toBe("claude-sonnet-5");
      expect(inv.cwd).toMatch(/\/workspace$/);
    }
    expect(judge.invocations).toHaveLength(4);
    expect(verifier.invocations).toHaveLength(4);
    expect(judge.invocations[0].tools).toEqual(["Read", "Grep", "Glob"]);
    expect(verifier.invocations[0].cwd).toMatch(/\/workspace$/);

    const listed: unknown = await mastra
      .getWorkflow("harnessRun")
      .listWorkflowRuns();
    const { runs } = listed as { runs: { runId: string }[] };
    expect(runs.map((r) => r.runId)).toContain(RUN_ID);
    const dbBytes = ["harness.db", "harness.db-wal"]
      .map((f) => path.join(stateDir, f))
      .filter((f) => existsSync(f))
      .reduce((s, f) => s + statSync(f).size, 0);
    process.stdout.write(`dry run: ${wallMs}ms, state ${dbBytes} bytes\n`);
    expect(dbBytes).toBeLessThan(8 * 1024 * 1024);
  }, 60_000);

  it("re-driving the same runId performs no work", async () => {
    const before = {
      builder: builder.invocations.length,
      judge: judge.invocations.length,
      verifier: verifier.invocations.length,
      runs: lines(ctx.runsFile!).length,
      findings: lines(ctx.findingsFile!).length,
    };
    const result = await drive();
    if (result.status !== "success") throw new Error(JSON.stringify(result));
    expect(result.result).toMatchObject({
      attempts: 4,
      complete: 4,
      findingsAppended: 0,
    });
    expect(builder.invocations).toHaveLength(before.builder);
    expect(judge.invocations).toHaveLength(before.judge);
    expect(verifier.invocations).toHaveLength(before.verifier);
    expect(lines(ctx.runsFile!)).toHaveLength(before.runs);
    expect(lines(ctx.findingsFile!)).toHaveLength(before.findings);
  }, 60_000);
});

describe("deniedRoots", () => {
  it("denies the monorepo and recipes when runs live outside", () => {
    expect(
      deniedRoots({ monorepoRoot: "/m", recipesRoot: "/r", runsRoot: "/runs" }),
    ).toEqual(["/m", "/r"]);
  });

  it("denies the siblings down the path when runs live inside the monorepo", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-denied-"));
    try {
      for (const d of [
        "apps",
        "packages",
        "tools/other",
        "tools/doc-harness/src",
        "tools/doc-harness/runs",
      ]) {
        mkdirSync(path.join(tmp, d), { recursive: true });
      }
      writeFileSync(path.join(tmp, "package.json"), "{}");
      const roots = deniedRoots({
        monorepoRoot: tmp,
        recipesRoot: "/r",
        runsRoot: path.join(tmp, "tools/doc-harness/runs"),
      });
      expect(roots.sort()).toEqual(
        [
          path.join(tmp, "apps"),
          path.join(tmp, "packages"),
          path.join(tmp, "tools/other"),
          path.join(tmp, "tools/doc-harness/src"),
          "/r",
        ].sort(),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("mergeVerifyResults", () => {
  const model = (
    index: number,
    status: VerifyResult["status"],
  ): VerifyResult => ({
    index,
    status,
    prediction: "p",
    observation: "o",
    note: "n",
    byPrecheck: false,
  });

  it("keeps pre-checks, takes model results for pending indexes, fills the rest", () => {
    const pre = { ...model(0, "REFUTED"), byPrecheck: true };
    const merged = mergeVerifyResults(
      [pre],
      [1, 2],
      [model(0, "VERIFIED"), model(1, "VERIFIED"), model(7, "VERIFIED")],
    );
    expect(merged.map((r) => [r.index, r.status])).toEqual([
      [0, "REFUTED"],
      [1, "VERIFIED"],
      [2, "UNVERIFIED"],
    ]);
    expect(merged[2].note).toBe("verifier returned no result");
  });

  it("a failed verifier call leaves every pending finding UNVERIFIED", () => {
    const merged = mergeVerifyResults([], [0, 1], null);
    expect(merged.map((r) => r.status)).toEqual(["UNVERIFIED", "UNVERIFIED"]);
  });
});
