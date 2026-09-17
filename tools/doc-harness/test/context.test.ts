import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearHarnessContext, getHarnessContext } from "../src/lib/context.js";
import { defaultHarnessContext } from "../src/lib/drivers.js";
import { FakeClaude } from "../src/lib/fake-claude.js";
import type { RunArgs } from "../src/lib/schemas.js";

const args: RunArgs = {
  tasks: ["custom-read-model"],
  arms: ["A"],
  n: 1,
  concurrency: 2,
  dryRun: true,
  sandbox: "dontAsk",
  auth: "oauth-isolated",
  skipVerify: false,
  keepWorkspaces: false,
  builderModel: "claude-sonnet-5",
  judgeModel: "claude-opus-5",
  throttleAt: 0.9,
};

const tmp = mkdtempSync(path.join(os.tmpdir(), "doc-harness-ctx-"));
afterEach(() => {
  clearHarnessContext("studio-1");
});

describe("getHarnessContext", () => {
  it("throws without args when nothing is registered", () => {
    expect(() => getHarnessContext("nobody")).toThrow(/no harness context/);
  });

  it("builds and registers a default context from RunArgs", () => {
    const ctx = getHarnessContext("studio-1", args);
    expect(ctx.dryRun).toBe(true);
    expect(ctx.driver).toBeInstanceOf(FakeClaude);
    expect(getHarnessContext("studio-1")).toBe(ctx);
  });

  it("keeps a dry run's records inside its run directory", () => {
    const ctx = defaultHarnessContext("studio-2", args, { runsRoot: tmp });
    expect(ctx.findingsFile).toBe(path.join(tmp, "studio-2", "FINDINGS.jsonl"));
    expect(ctx.runsFile).toBe(path.join(tmp, "studio-2", "RUNS.jsonl"));
    expect(ctx.semaphore.limit).toBe(2);
  });

  it("uses the committed records for a real run", () => {
    const real = defaultHarnessContext("studio-3", { ...args, dryRun: false });
    expect(real.findingsFile).toBeUndefined();
    expect(real.driver.name).not.toBe("fake");
    rmSync(tmp, { recursive: true, force: true });
  });
});
