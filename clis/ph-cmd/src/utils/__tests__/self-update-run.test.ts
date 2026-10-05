import { describe, expect, it } from "vitest";
import { runSelfUpdate, type SelfUpdateDeps } from "../self-update.js";

const PNPM_PATH =
  "/home/u/.local/share/pnpm/global/node_modules/.pnpm/ph-cmd@6.2.2/node_modules/ph-cmd/dist/cli.mjs";

function makeDeps(overrides: Partial<SelfUpdateDeps> = {}): {
  deps: SelfUpdateDeps;
  spawnCalls: Array<[string, string[]]>;
  stdout: string[];
  stderr: string[];
  refreshCalls: string[];
} {
  const spawnCalls: Array<[string, string[]]> = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const refreshCalls: string[] = [];
  const deps: SelfUpdateDeps = {
    spawner: (argv) => {
      spawnCalls.push([argv[0], argv.slice(1)]);
      return Promise.resolve();
    },
    readFile: () =>
      Promise.resolve(JSON.stringify({ name: "ph-cmd", version: "6.3.0" })),
    stdout: (s) => stdout.push(s),
    stderr: (s) => stderr.push(s),
    refreshCache: (v) => {
      refreshCalls.push(v);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, spawnCalls, stdout, stderr, refreshCalls };
}

describe("runSelfUpdate", () => {
  it("runs the detected PM with the stream tag and reports the new version", async () => {
    const { deps, spawnCalls, stdout, refreshCalls } = makeDeps();
    const result = await runSelfUpdate({
      currentVersion: "6.2.2",
      realPath: PNPM_PATH,
      deps,
    });
    expect(result).toEqual({ ok: true, from: "6.2.2", to: "6.3.0" });
    expect(spawnCalls).toEqual([
      ["pnpm", ["add", "-g", "ph-cmd@latest"]], // stable build → latest stream
    ]);
    expect(stdout).toEqual([
      "Updating ph-cmd via pnpm (pnpm add -g ph-cmd@latest)...",
      "Updated ph-cmd from 6.2.2 to 6.3.0. The new version takes effect on your next 'ph' run.",
    ]);
    expect(refreshCalls).toEqual(["6.3.0"]);
  });

  it("uses an explicit --tag override instead of the derived stream", async () => {
    const { deps, spawnCalls } = makeDeps();
    await runSelfUpdate({
      currentVersion: "6.2.2",
      tag: "dev",
      realPath: PNPM_PATH,
      deps,
    });
    expect(spawnCalls[0]).toEqual(["pnpm", ["add", "-g", "ph-cmd@dev"]]);
  });

  it("resolves the dev stream for a prerelease current version", async () => {
    const { deps, spawnCalls } = makeDeps();
    await runSelfUpdate({
      currentVersion: "6.2.3-dev.1",
      realPath: PNPM_PATH,
      deps,
    });
    expect(spawnCalls[0]).toEqual(["pnpm", ["add", "-g", "ph-cmd@dev"]]);
  });

  it("reports a failed install with the manual command for that PM", async () => {
    const { deps, spawnCalls, stderr } = makeDeps({
      spawner: (argv) => {
        spawnCalls.push([argv[0], argv.slice(1)]);
        return Promise.reject(new Error("pnpm exited with code 1"));
      },
    });
    const result = await runSelfUpdate({
      currentVersion: "6.2.2",
      realPath: PNPM_PATH,
      deps,
    });
    expect(spawnCalls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("pnpm add -g ph-cmd@latest");
    }
    expect(stderr.length).toBeGreaterThan(0);
  });

  it("refuses on a source-checkout run without spawning anything", async () => {
    const { deps, spawnCalls, stderr } = makeDeps();
    const result = await runSelfUpdate({
      currentVersion: "6.2.2",
      realPath: "/repo/clis/ph-cmd/dist/cli.mjs",
      deps,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("source checkout");
    }
    expect(spawnCalls).toHaveLength(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it("refuses on an unrecognized layout with manual commands for all PMs", async () => {
    const { deps, spawnCalls, stderr } = makeDeps();
    const result = await runSelfUpdate({
      currentVersion: "6.2.2",
      realPath: "/opt/nowhere/cli.mjs",
      deps,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const cmd of [
        "npm install -g ph-cmd@latest",
        "pnpm add -g ph-cmd@latest",
        "bun add -g ph-cmd@latest",
        "yarn global add ph-cmd@latest",
      ]) {
        expect(result.message).toContain(cmd);
      }
    }
    expect(spawnCalls).toHaveLength(0);
    expect(stderr.length).toBeGreaterThan(0);
  });
});
