import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  formatOutdatedNotice,
  maybeNotifyOutdated,
  type VersionCheckDeps,
} from "../version-check.js";

function makeDeps(overrides: Partial<VersionCheckDeps> = {}): {
  deps: VersionCheckDeps;
  fetchCalls: string[];
  written: string[];
} {
  const fetchCalls: string[] = [];
  const written: string[] = [];
  const { cachePath = "", ...rest } = overrides;
  const deps: VersionCheckDeps = {
    fetch: (url) => {
      fetchCalls.push(String(url));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ version: "6.3.0" }),
      } as unknown as Response);
    },
    now: () => 1_000_000,
    readFile: () => Promise.reject(new Error("ENOENT")),
    writeFile: (_p, contents) => {
      written.push(String(contents));
      return Promise.resolve();
    },
    ...rest,
    cachePath,
  };
  return { deps, fetchCalls, written };
}

const freshCache = (target: string) => () =>
  Promise.resolve(
    JSON.stringify({
      checkedAt: new Date(999_000).toISOString(),
      stream: "latest",
      target,
    }),
  );

describe("maybeNotifyOutdated", () => {
  let dir: string;
  let lines: string[];
  let baseDeps: VersionCheckDeps;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ph-cmd-notify-"));
    lines = [];
    baseDeps = makeDeps({ cachePath: path.join(dir, "cache.json") }).deps;
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("skips no-arg invocations (top-level help)", async () => {
    await maybeNotifyOutdated({
      args: [],
      currentVersion: "6.2.2",
      deps: baseDeps,
      writeStderr: (l) => lines.push(l),
    });
    expect(lines).toHaveLength(0);
  });

  it("skips --version / -v", async () => {
    for (const args of [["--version"], ["-v"]]) {
      const { deps, fetchCalls } = makeDeps({
        cachePath: path.join(dir, "c.json"),
      });
      await maybeNotifyOutdated({
        args,
        currentVersion: "6.2.2",
        deps,
        writeStderr: (l) => lines.push(l),
      });
      expect(fetchCalls).toHaveLength(0);
    }
    expect(lines).toHaveLength(0);
  });

  it("skips --help / -h", async () => {
    for (const args of [["--help"], ["-h"]]) {
      const { deps, fetchCalls } = makeDeps({
        cachePath: path.join(dir, "c.json"),
      });
      await maybeNotifyOutdated({
        args,
        currentVersion: "6.2.2",
        deps,
        writeStderr: (l) => lines.push(l),
      });
      expect(fetchCalls).toHaveLength(0);
    }
    expect(lines).toHaveLength(0);
  });

  it("skips the self-update command itself", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath: path.join(dir, "c.json"),
    });
    await maybeNotifyOutdated({
      args: ["self-update"],
      currentVersion: "6.2.2",
      deps,
      writeStderr: (l) => lines.push(l),
    });
    expect(fetchCalls).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });

  it("skips in CI", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath: path.join(dir, "c.json"),
    });
    await maybeNotifyOutdated({
      args: ["list"],
      currentVersion: "6.2.2",
      env: { CI: "1" },
      deps,
      writeStderr: (l) => lines.push(l),
    });
    expect(fetchCalls).toHaveLength(0);
  });

  it("skips when PH_NO_UPDATE_CHECK=1", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath: path.join(dir, "c.json"),
    });
    await maybeNotifyOutdated({
      args: ["list"],
      currentVersion: "6.2.2",
      env: { PH_NO_UPDATE_CHECK: "1" },
      deps,
      writeStderr: (l) => lines.push(l),
    });
    expect(fetchCalls).toHaveLength(0);
  });

  it("prints nothing when not outdated", async () => {
    const { deps } = makeDeps({
      cachePath: path.join(dir, "c.json"),
      readFile: freshCache("6.2.2"),
    });
    await maybeNotifyOutdated({
      args: ["list"],
      currentVersion: "6.2.2",
      stderrIsTty: true,
      deps,
      writeStderr: (l) => lines.push(l),
    });
    expect(lines).toHaveLength(0);
  });

  it("prints the one-line notice when outdated on a TTY", async () => {
    const { deps } = makeDeps({
      cachePath: path.join(dir, "c.json"),
      readFile: freshCache("6.3.0"),
    });
    await maybeNotifyOutdated({
      args: ["list"],
      currentVersion: "6.2.2",
      stderrIsTty: true,
      deps,
      writeStderr: (l) => lines.push(l),
    });
    expect(lines).toEqual([formatOutdatedNotice("6.2.2", "6.3.0", "latest")]);
  });

  it("prints nothing when outdated but stderr is not a TTY (refresh still runs)", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath: path.join(dir, "c.json"),
    });
    await maybeNotifyOutdated({
      args: ["list"],
      currentVersion: "6.2.2",
      stderrIsTty: false,
      deps,
      writeStderr: (l) => lines.push(l),
    });
    expect(fetchCalls).toHaveLength(1); // cache was empty → refreshed
    expect(lines).toHaveLength(0);
  });

  it("never throws or prints when the fetch fails", async () => {
    const { deps } = makeDeps({
      cachePath: path.join(dir, "c.json"),
      fetch: () => Promise.reject(new Error("offline")),
    });
    await expect(
      maybeNotifyOutdated({
        args: ["list"],
        currentVersion: "6.2.2",
        stderrIsTty: true,
        deps,
        writeStderr: (l) => lines.push(l),
      }),
    ).resolves.toBeUndefined();
    expect(lines).toHaveLength(0);
  });
});
