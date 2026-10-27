import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_META_NAME } from "../controller/api.ts";
import {
  CONTROLLER_SLOT,
  monitorController,
  type Mounted,
} from "./vite-plugin.ts";

type Slotted = typeof globalThis & { [CONTROLLER_SLOT]?: Promise<Mounted> };

function stubServer(server: {
  host?: string | boolean;
  middlewareMode?: boolean;
}) {
  return {
    config: {
      root: process.cwd(),
      server,
      logger: { info: vi.fn(), warn: vi.fn() },
    },
    middlewares: { use: vi.fn() },
  } as unknown as ViteDevServer & {
    middlewares: { use: ReturnType<typeof vi.fn> };
    config: { logger: { warn: ReturnType<typeof vi.fn> } };
  };
}

async function configure(plugin: Plugin, server: ViteDevServer) {
  await (plugin.configureServer as (s: ViteDevServer) => Promise<void>)(server);
}

function meta(plugin: Plugin): unknown {
  return (plugin.transformIndexHtml as () => unknown)();
}

describe("monitorController vite plugin", () => {
  let base: string;
  let env: Record<string, string>;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-monitor-plugin-")));
    mkdirSync(path.join(base, "project", "hosts", "sb"), { recursive: true });
    writeFileSync(path.join(base, "project", "hosts", "sb", "host.js"), "");
    mkdirSync(path.join(base, "tmp"));
    env = { PH_MONITOR_PROJECT_ROOTS: path.join(base, "project") };
  });

  afterEach(async () => {
    const slot = globalThis as Slotted;
    const mounted = await slot[CONTROLLER_SLOT];
    if (mounted) {
      process.off("SIGINT", mounted.onSigint);
      await mounted.controller.dispose();
    }
    delete slot[CONTROLLER_SLOT];
    rmSync(base, { recursive: true, force: true });
  });

  const plugin = () =>
    monitorController({ env, tmpDir: path.join(base, "tmp") });

  it("does nothing without project roots", async () => {
    env = {};
    const p = plugin();
    const server = stubServer({ host: "localhost" });
    expect((p.config as () => unknown)()).toBeUndefined();
    await configure(p, server);
    expect(server.middlewares.use).not.toHaveBeenCalled();
    expect(meta(p)).toBeUndefined();
  });

  it("refuses a dev server beyond loopback or in middleware mode", async () => {
    for (const config of [
      { host: true },
      { host: "0.0.0.0" },
      { host: "192.168.1.2" },
      { host: "localhost", middlewareMode: true },
    ]) {
      const p = plugin();
      const server = stubServer(config);
      await configure(p, server);
      expect(server.middlewares.use).not.toHaveBeenCalled();
      expect(server.config.logger.warn).toHaveBeenCalled();
      expect(meta(p)).toBeUndefined();
    }
    expect((globalThis as Slotted)[CONTROLLER_SLOT]).toBeUndefined();
  });

  it("mounts on loopback, disables dev CORS, injects the token once per process", async () => {
    const sigints = process.listenerCount("SIGINT");
    const first = plugin();
    expect((first.config as () => unknown)()).toEqual({
      server: { cors: false },
    });
    const server = stubServer({});
    await configure(first, server);
    expect(server.middlewares.use).toHaveBeenCalledTimes(1);
    const [tag] = meta(first) as {
      attrs: { name: string; content: string };
    }[];
    expect(tag.attrs.name).toBe(TOKEN_META_NAME);
    expect(tag.attrs.content).toMatch(/^[0-9a-f]{64}$/);

    // A config restart: a new plugin instance reuses the slot.
    const second = plugin();
    await configure(second, stubServer({ host: "127.0.0.1" }));
    const [again] = meta(second) as { attrs: { content: string } }[];
    expect(again.attrs.content).toBe(tag.attrs.content);
    expect(process.listenerCount("SIGINT")).toBe(sigints + 1);
  });
});
