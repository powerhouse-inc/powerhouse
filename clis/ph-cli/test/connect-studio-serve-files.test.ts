import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InlineConfig, Plugin, ViteDevServer } from "vite";

/** The dev server (`ph run <connect> dev`) serves `runner.serveFiles` as a
 * build's servers do (C1 M4): a plugin whose middleware runs ahead of vite's
 * own. vite is mocked; the middleware runs on a plain node server. */

vi.mock("vite", () => ({
  createServer: vi.fn(),
  mergeConfig: (base: InlineConfig, over: InlineConfig) => ({
    ...base,
    ...over,
    plugins: [...(base.plugins ?? []), ...(over.plugins ?? [])],
  }),
}));
vi.mock("@powerhousedao/builder-tools", () => ({
  getConnectBaseViteConfig: vi.fn(() => ({})),
}));

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

/** The config Studio hands vite, for these served files. */
async function devConfig(
  serveFiles?: Record<string, string>,
): Promise<InlineConfig> {
  const dir = mkdtempSync(join(tmpdir(), "studio-serve-files-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  const { createServer: createVite } = await import("vite");
  const { runConnectStudio } =
    await import("../src/services/connect-studio.js");
  const { connectStudioServiceArgs } =
    await import("../src/services/service-args.js");
  let config: InlineConfig | undefined;
  vi.mocked(createVite).mockReset();
  vi.mocked(createVite).mockImplementation((given) => {
    config = given as InlineConfig;
    return Promise.resolve({
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      printUrls: vi.fn(),
      bindCLIShortcuts: vi.fn(),
    } as unknown as ViteDevServer);
  });
  await runConnectStudio(
    {
      ...(await connectStudioServiceArgs()),
      printUrls: false,
      bindCLIShortcuts: false,
    },
    undefined,
    undefined,
    serveFiles ? { serveFiles } : {},
  );
  if (!config) throw new Error("vite got no config");
  return config;
}

/** The plugin's middleware, as vite would install it at `base`. */
function middlewareOf(config: InlineConfig, base: string): Middleware {
  const plugin = (config.plugins as Plugin[] | undefined)?.find(
    (p) => p.name === "ph:serve-files",
  );
  if (!plugin) throw new Error("no ph:serve-files plugin");
  const used: Middleware[] = [];
  const configure = plugin.configureServer as (server: unknown) => void;
  configure({
    middlewares: { use: (m: Middleware) => used.push(m) },
    config: { base },
  });
  return used[0];
}

/** A node server: the middleware, then what vite would answer (its SPA). */
async function serving(middleware: Middleware) {
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<title>vite's app</title>");
    }),
  );
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  cleanups.push(() => server.close());
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return (path: string) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { accept: "text/html,*/*" },
    });
}

describe("runConnectStudio with runner.serveFiles", () => {
  it("serves each file per request, no-store, and a 404 rather than the app while it is missing", async () => {
    const config = await devConfig({ "/studio.config.json": "state.json" });
    // Read against the working directory, as the build's servers read them.
    const file = join(process.cwd(), "state.json");
    const at = await serving(middlewareOf(config, "/"));

    const missing = await at("/studio.config.json");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.text()).not.toContain("vite's app");

    writeFileSync(file, JSON.stringify({ previewServerUrl: "x" }));
    const served = await at("/studio.config.json");
    expect(served.headers.get("cache-control")).toBe("no-store");
    expect(await served.json()).toEqual({ previewServerUrl: "x" });
    // Everything else is vite's.
    expect(await (await at("/settings")).text()).toContain("vite's app");
  });

  it("serves them under the base vite serves at", async () => {
    const config = await devConfig({ "/studio.config.json": "state.json" });
    writeFileSync(join(process.cwd(), "state.json"), '{"under":"base"}');
    const at = await serving(middlewareOf(config, "/studio/"));
    expect(await (await at("/studio/studio.config.json")).json()).toEqual({
      under: "base",
    });
    expect(await (await at("/studio.config.json")).text()).toContain(
      "vite's app",
    );
  });

  it("adds no plugin for a host without served files", async () => {
    const config = await devConfig();
    expect(
      ((config.plugins ?? []) as Plugin[]).map((plugin) => plugin.name),
    ).not.toContain("ph:serve-files");
  });
});
