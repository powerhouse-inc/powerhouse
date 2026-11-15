import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViteDevServer } from "vite";

/** What a runner's handle needs of Studio once it reloads on a config change:
 * a stop that reaches the watcher and whichever server is current. vite and
 * the Connect config are mocked; no server starts. */

vi.mock("vite", () => ({
  createServer: vi.fn(),
  mergeConfig: (base: object, over: object) => ({ ...base, ...over }),
}));
vi.mock("@powerhousedao/builder-tools", () => ({
  getConnectBaseViteConfig: vi.fn(() => ({})),
}));

const fakeServer = () => ({
  listen: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  printUrls: vi.fn(),
  bindCLIShortcuts: vi.fn(),
  config: { logger: { info: vi.fn(), error: vi.fn() } },
});

// Past the service's debounce, with room for the watcher's event.
const SETTLE_MS = 1_000;
const WAIT_MS = 10_000;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "studio-stop-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeConfig(dir, "one");
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  return dir;
}

function writeConfig(dir: string, appName: string) {
  writeFileSync(
    join(dir, "powerhouse.config.json"),
    JSON.stringify({ packages: [], connect: { branding: { appName } } }),
  );
}

async function startStudio(reloadOnConfigChange: boolean) {
  const { createServer } = await import("vite");
  const { runConnectStudio } =
    await import("../src/services/connect-studio.js");
  const { classicConnectStudioArgs } =
    await import("../src/services/classic-args.js");
  const servers: ReturnType<typeof fakeServer>[] = [];
  vi.mocked(createServer).mockReset();
  vi.mocked(createServer).mockImplementation(() => {
    const server = fakeServer();
    servers.push(server);
    return Promise.resolve(server as unknown as ViteDevServer);
  });
  const restartWith = vi.fn((start: () => Promise<ViteDevServer>) => start());
  const studio: { stop?: () => Promise<void> } = {};
  await runConnectStudio(
    {
      ...(await classicConnectStudioArgs()),
      printUrls: false,
      bindCLIShortcuts: false,
    },
    undefined,
    undefined,
    {
      reloadOnConfigChange,
      restartWith,
      exposeStop: (stop) => {
        studio.stop = stop;
      },
    },
  );
  const { stop } = studio;
  if (!stop) throw new Error("Studio handed over no stop");
  return { servers, restartWith, stop };
}

describe("runConnectStudio — the stop it hands over", () => {
  it("closes the server a config change started, and ends the watching", async () => {
    const dir = makeProject();
    const { servers, restartWith, stop } = await startStudio(true);
    expect(servers).toHaveLength(1);
    expect(restartWith).not.toHaveBeenCalled();

    writeConfig(dir, "two");
    await vi.waitFor(() => expect(servers).toHaveLength(2), {
      timeout: WAIT_MS,
    });
    // The restart's start went through the caller's wrapper; the first did not.
    expect(restartWith).toHaveBeenCalledOnce();
    expect(servers[0].close).toHaveBeenCalledOnce();

    await stop();
    expect(servers[1].close).toHaveBeenCalledOnce();

    writeConfig(dir, "three");
    await sleep(SETTLE_MS);
    expect(servers).toHaveLength(2);
  });

  it("closes the first server when nothing replaced it", async () => {
    const dir = makeProject();
    const { servers, stop } = await startStudio(true);
    await stop();
    expect(servers[0].close).toHaveBeenCalledOnce();

    writeConfig(dir, "two");
    await sleep(SETTLE_MS);
    expect(servers).toHaveLength(1);
  });

  it("is the server's close without reloadOnConfigChange", async () => {
    makeProject();
    const { servers, stop } = await startStudio(false);
    await stop();
    expect(servers).toHaveLength(1);
    expect(servers[0].close).toHaveBeenCalledOnce();
  });
});
