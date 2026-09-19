import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Task } from "../src/lib/catalog.js";
import type { HarnessContext } from "../src/lib/context.js";
import { FakeClaude } from "../src/lib/fake-claude.js";
import { runLayout } from "../src/lib/paths.js";
import type { JudgeStepResult } from "../src/lib/schemas.js";
import { Semaphore } from "../src/lib/semaphore.js";
import type { InstallOptions, Installer } from "../src/lib/workspace.js";
import { REINSTALL_TIMEOUT_MS } from "../src/steps/acceptance.js";
import type { AttemptScope, TaskRunInput } from "../src/steps/shared.js";
import { verifyAttempt } from "../src/steps/verify.js";

const OK_TRANSCRIPT = path.join(
  import.meta.dirname,
  "fixtures/fake-claude/ok.jsonl",
);
const RUN_ID = "2026-09-17T12-00-00Z";

const task: Task = {
  id: "alpha",
  title: "Alpha",
  recipeDir: "alpha",
  brief: null,
  difficulty: "S",
  taskPrompt: "x".repeat(200),
  contract: [],
  pinnedInputs: [],
  acceptance: { kind: "tsc-only", files: [], vitestConfig: false },
  docSections: [],
  packages: ["@powerhousedao/reactor"],
  extraDeps: {},
  arms: ["A", "B"],
  timeouts: { buildMs: 60_000, acceptanceMs: 60_000 },
  budgets: { buildUsd: 1, maxTurns: 10, judgeUsd: 1, verifyUsd: 1 },
};

function judgeJson(symbol: string): JudgeStepResult {
  return {
    claude: null,
    budgetUsd: 1,
    wallClockMs: 1,
    raw: null,
    kept: [
      {
        kind: "MISSING",
        docPath: null,
        line: null,
        quote: null,
        symbol,
        claim: `No page explains ${symbol}.`,
        evidence: [{ turn: 2, uuid: null }],
        proposedEdit: `Document ${symbol}.`,
        confidence: 0.7,
      },
    ],
    dropped: [],
    relabelled: [],
  };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-verify-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function fakeInstaller() {
  const calls: InstallOptions[] = [];
  const installer: Installer = (o) => {
    calls.push(o);
    mkdirSync(path.join(o.dir, "node_modules"), { recursive: true });
    return Promise.resolve({
      ok: true,
      ms: 1,
      installedVersion: "1.0.0",
      fromCache: true,
    });
  };
  return { installer, calls };
}

/** A recorded attempt: judge done, workspace stripped of node_modules. */
function scope(o: { dryRun?: boolean; symbol?: string; installer: Installer }) {
  const run = runLayout(RUN_ID, path.join(tmp, "runs"));
  const layout = run.attempt("alpha", "A", 1);
  const docsDir = path.join(run.root, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    path.join(docsDir, "builder.md"),
    "# ReactorBuilder\n\nUse `ReactorBuilder`.\n",
  );
  mkdirSync(layout.workspaceDir, { recursive: true });
  mkdirSync(layout.dtsDir, { recursive: true });
  writeFileSync(layout.compactMd, "# transcript\n");
  writeFileSync(
    layout.judgeJson,
    JSON.stringify(judgeJson(o.symbol ?? "withFrobnicator")),
  );
  const verifier = new FakeClaude({
    transcriptFixture: OK_TRANSCRIPT,
    structuredOutput: {
      results: [
        {
          index: 0,
          status: "VERIFIED",
          prediction: "no hits",
          observation: "no hits",
          note: "reproduced",
        },
      ],
    },
  });
  const ctx: HarnessContext = {
    driver: verifier,
    judgeDriver: verifier,
    runsRoot: run.root,
    recipesRoot: path.join(tmp, "recipes"),
    monorepoRoot: path.join(tmp, "monorepo"),
    dryRun: o.dryRun ?? false,
    installer: o.installer,
    semaphore: new Semaphore(1),
    log: () => undefined,
  };
  const input: TaskRunInput = {
    runId: RUN_ID,
    taskId: "alpha",
    arm: "A",
    n: 1,
    docsDir,
    docsSha: "abc",
    pin: "6.2.2-dev.62",
    cliVersion: "2.1.258",
    args: {
      tasks: ["alpha"],
      arms: ["A"],
      n: 1,
      concurrency: 1,
      dryRun: o.dryRun ?? false,
      sandbox: "dontAsk",
      auth: "oauth-isolated",
      skipVerify: false,
      keepWorkspaces: false,
      builderModel: "claude-sonnet-5",
      judgeModel: "claude-opus-5",
      throttleAt: 0,
    },
  };
  const s: AttemptScope = { input, ctx, task, run, layout };
  return { scope: s, verifier, layout, run };
}

const judged = {
  judgePath: "judge.json",
  skipped: false,
  failureReason: null,
  rawFindings: 1,
  kept: 1,
  dropped: 0,
  costUsd: 0,
};

describe("verifyAttempt", () => {
  it("reinstalls a stripped workspace before the verifier runs in it", async () => {
    const { installer, calls } = fakeInstaller();
    const { scope: s, verifier, layout, run } = scope({ installer });
    const out = await verifyAttempt(s, judged);
    expect(calls).toEqual([
      {
        dir: layout.workspaceDir,
        task,
        cacheDir: run.installCacheDir,
        logPath: layout.reinstallLogPath,
        timeoutMs: REINSTALL_TIMEOUT_MS,
      },
    ]);
    expect(verifier.invocations).toHaveLength(1);
    expect(verifier.invocations[0].cwd).toBe(layout.workspaceDir);
    expect(out).toMatchObject({ verified: 1, refuted: 0, unverified: 0 });
  });

  it("leaves a present node_modules alone", async () => {
    const { installer, calls } = fakeInstaller();
    const { scope: s, verifier, layout } = scope({ installer });
    mkdirSync(path.join(layout.workspaceDir, "node_modules"));
    await verifyAttempt(s, judged);
    expect(calls).toEqual([]);
    expect(verifier.invocations).toHaveLength(1);
  });

  it("installs nothing in a dry run", async () => {
    const { installer, calls } = fakeInstaller();
    const { scope: s, verifier } = scope({ installer, dryRun: true });
    await verifyAttempt(s, judged);
    expect(calls).toEqual([]);
    expect(verifier.invocations).toHaveLength(1);
  });

  it("installs nothing when every finding is settled by precheck", async () => {
    const { installer, calls } = fakeInstaller();
    // MISSING, yet the docs name the symbol: refuted without the verifier.
    const { scope: s, verifier } = scope({
      installer,
      symbol: "ReactorBuilder",
    });
    const out = await verifyAttempt(s, judged);
    expect(calls).toEqual([]);
    expect(verifier.invocations).toHaveLength(0);
    expect(out).toMatchObject({ verified: 0, refuted: 1 });
  });
});
