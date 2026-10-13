import { unwatchFile } from "node:fs";
import { mkdtemp, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageManager } from "../src/packages/package-manager.js";
import type { ISubscribablePackageLoader } from "../src/packages/types.js";

function makeCountingLoader() {
  const active = new Map<string, number>();
  const subscribe = (key: string) => {
    active.set(key, (active.get(key) ?? 0) + 1);
    return () => {
      active.set(key, (active.get(key) ?? 0) - 1);
    };
  };
  const loader = {
    name: "counting-loader",
    loadDocumentModels: vi.fn(() => Promise.resolve([])),
    loadSubgraphs: vi.fn(() => Promise.resolve([])),
    loadProcessors: vi.fn(() => Promise.resolve(null)),
    loadPieces: vi.fn(() => Promise.resolve([])),
    onDocumentModelsChange: (pkg: string) => subscribe(`${pkg}:models`),
    onSubgraphsChange: (pkg: string) => subscribe(`${pkg}:subgraphs`),
    onProcessorsChange: (pkg: string) => subscribe(`${pkg}:processors`),
    onPiecesChange: (pkg: string) => subscribe(`${pkg}:pieces`),
  } satisfies ISubscribablePackageLoader;
  return { loader, active };
}

describe("PackageManager config reload", () => {
  let dir = "";
  let configFile = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "package-manager-reload-"));
    configFile = join(dir, "powerhouse.config.json");
  });

  afterEach(async () => {
    unwatchFile(configFile);
    await rm(dir, { recursive: true, force: true });
  });

  // One rename, so the poller sees a single change per write.
  async function writeConfig(packages: string[], secondsAhead: number) {
    const staged = `${configFile}.next`;
    await writeFile(
      staged,
      JSON.stringify({
        packages: packages.map((packageName) => ({ packageName })),
      }),
    );
    const mtime = new Date(Date.now() + secondsAhead * 1000);
    await utimes(staged, mtime, mtime);
    await rename(staged, configFile);
  }

  it("adds no duplicate packages or watchers on repeated reloads", async () => {
    await writeConfig(["pkg-b"], 0);
    const options = { packages: ["pkg-a"], configFile };
    const { loader, active } = makeCountingLoader();
    const manager = new PackageManager([loader], options);
    let loads = 0;
    manager.onPiecesChange(() => {
      loads += 1;
    });

    await manager.init();
    for (const reload of [1, 2]) {
      await writeConfig(["pkg-b"], reload * 10);
      await vi.waitFor(() => expect(loads).toBe(reload + 1), {
        timeout: 5000,
      });
    }

    expect(options.packages).toEqual(["pkg-a"]);
    expect(loader.loadSubgraphs.mock.calls.slice(-2)).toEqual([
      ["pkg-a"],
      ["pkg-b"],
    ]);
    expect(loader.loadSubgraphs).toHaveBeenCalledTimes(6);
    expect(Object.fromEntries(active)).toEqual({
      "pkg-a:models": 1,
      "pkg-a:subgraphs": 1,
      "pkg-a:processors": 1,
      "pkg-a:pieces": 1,
      "pkg-b:models": 1,
      "pkg-b:subgraphs": 1,
      "pkg-b:processors": 1,
      "pkg-b:pieces": 1,
    });
  });
});
