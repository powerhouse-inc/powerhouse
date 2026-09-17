import {
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
import {
  parseVitestJson,
  runAcceptance,
  vitestLogPath,
  type Runner,
} from "../src/lib/acceptance.js";
import type { Task } from "../src/lib/catalog.js";
import { runLayout } from "../src/lib/paths.js";
import type { RunResult } from "../src/lib/process.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-acceptance-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const TEST_FILE = "tests/alpha.test.ts";

function task(kind: Task["acceptance"]["kind"]): Task {
  return {
    id: "alpha",
    title: "Alpha",
    recipeDir: "alpha",
    brief: null,
    difficulty: "S",
    taskPrompt: "x".repeat(200),
    contract: [],
    pinnedInputs: [],
    acceptance: {
      kind,
      files: kind === "vitest" ? [{ from: TEST_FILE, to: TEST_FILE }] : [],
      vitestConfig: false,
    },
    docSections: [],
    packages: ["@powerhousedao/reactor"],
    extraDeps: {},
    arms: ["A", "B"],
    timeouts: { buildMs: 60_000, acceptanceMs: 60_000 },
    budgets: { buildUsd: 1, maxTurns: 10, judgeUsd: 1, verifyUsd: 1 },
  };
}

function setup() {
  const pinnedRoot = path.join(tmp, "pinned");
  mkdirSync(path.join(pinnedRoot, "alpha", "tests"), { recursive: true });
  writeFileSync(path.join(pinnedRoot, "alpha", TEST_FILE), "// hidden test\n");
  const layout = runLayout("r1", path.join(tmp, "runs")).attempt(
    "alpha",
    "A",
    1,
  );
  mkdirSync(layout.workspaceDir, { recursive: true });
  return { pinnedRoot, layout };
}

type Call = { cmd: string; args: string[]; cwd: string };

/** Records calls; `onVitest` gets the --outputFile path to write, or not. */
function fakeRunner(o: {
  tsc?: RunResult["status"];
  vitest?: RunResult["status"];
  onVitest?: (outputFile: string) => void;
}): { runner: Runner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: Runner = (cmd, args, options) => {
    calls.push({ cmd, args, cwd: options.cwd });
    const isVitest = args[1] === "vitest";
    if (isVitest) {
      const flag = args.find((a) => a.startsWith("--outputFile="));
      if (flag !== undefined) o.onVitest?.(flag.slice("--outputFile=".length));
    }
    const status = (isVitest ? o.vitest : o.tsc) ?? "pass";
    return Promise.resolve({
      status,
      code: status === "pass" ? 0 : status === "fail" ? 1 : null,
      signal: null,
      durationMs: 5,
      output: `${isVitest ? "vitest" : "tsc"} output\n`,
    });
  };
  return { runner, calls };
}

describe("parseVitestJson", () => {
  it("reads the three counters and ignores the rest", () => {
    const text = JSON.stringify({
      numTotalTests: 5,
      numPassedTests: 3,
      numFailedTests: 2,
      testResults: [{ name: "x" }],
    });
    expect(parseVitestJson(text)).toEqual({ passed: 3, failed: 2, total: 5 });
  });

  it("returns null for non-JSON and for JSON without the counters", () => {
    expect(parseVitestJson("not json")).toBeNull();
    expect(parseVitestJson('{"numTotalTests":"5"}')).toBeNull();
    expect(parseVitestJson("[]")).toBeNull();
  });
});

describe("runAcceptance", () => {
  it("kind none copies nothing, runs nothing", async () => {
    const { pinnedRoot, layout } = setup();
    const { runner, calls } = fakeRunner({});
    const result = await runAcceptance({
      task: task("none"),
      layout,
      timeoutMs: 1000,
      pinnedRoot,
      runner,
    });
    expect(calls).toEqual([]);
    expect(result).toMatchObject({
      kind: "none",
      tscOk: null,
      passed: 0,
      total: 0,
      timedOut: false,
      vitestJsonPath: null,
    });
  });

  it("dry run copies the test files but runs nothing", async () => {
    const { pinnedRoot, layout } = setup();
    const { runner, calls } = fakeRunner({});
    const result = await runAcceptance({
      task: task("vitest"),
      layout,
      timeoutMs: 1000,
      pinnedRoot,
      dryRun: true,
      runner,
    });
    expect(calls).toEqual([]);
    expect(existsSync(path.join(layout.workspaceDir, TEST_FILE))).toBe(true);
    expect(result).toMatchObject({ kind: "vitest", tscOk: null, total: 0 });
  });

  it("tsc-only runs tsc in the workspace and records its log", async () => {
    const { pinnedRoot, layout } = setup();
    const { runner, calls } = fakeRunner({ tsc: "fail" });
    const result = await runAcceptance({
      task: task("tsc-only"),
      layout,
      timeoutMs: 1000,
      pinnedRoot,
      runner,
    });
    expect(calls).toEqual([
      {
        cmd: "pnpm",
        args: ["exec", "tsc", "--noEmit"],
        cwd: layout.workspaceDir,
      },
    ]);
    expect(result.tscOk).toBe(false);
    expect(result.tscOutputPath).toBe(layout.tscOutputPath);
    expect(readFileSync(layout.tscOutputPath, "utf8")).toBe("tsc output\n");
    expect(result.vitestJsonPath).toBeNull();
  });

  it("vitest runs after tsc and reads the JSON reporter file", async () => {
    const { pinnedRoot, layout } = setup();
    const { runner, calls } = fakeRunner({
      vitest: "fail",
      onVitest: (file) =>
        writeFileSync(
          file,
          JSON.stringify({
            numTotalTests: 4,
            numPassedTests: 3,
            numFailedTests: 1,
          }),
        ),
    });
    const result = await runAcceptance({
      task: task("vitest"),
      layout,
      timeoutMs: 1000,
      pinnedRoot,
      runner,
    });
    expect(calls.map((c) => c.args[1])).toEqual(["tsc", "vitest"]);
    expect(calls[1].args).toContain(`--outputFile=${layout.vitestJsonPath}`);
    expect(result).toMatchObject({
      kind: "vitest",
      tscOk: true,
      passed: 3,
      failed: 1,
      total: 4,
      timedOut: false,
      vitestJsonPath: layout.vitestJsonPath,
    });
    expect(readFileSync(vitestLogPath(layout), "utf8")).toBe("vitest output\n");
  });

  it("a killed vitest with no JSON reads as 0/0/0 and timedOut", async () => {
    const { pinnedRoot, layout } = setup();
    const { runner } = fakeRunner({ vitest: "timeout" });
    const result = await runAcceptance({
      task: task("vitest"),
      layout,
      timeoutMs: 1000,
      pinnedRoot,
      runner,
    });
    expect(result).toMatchObject({
      tscOk: true,
      passed: 0,
      failed: 0,
      total: 0,
      timedOut: true,
      vitestJsonPath: null,
    });
  });
});
