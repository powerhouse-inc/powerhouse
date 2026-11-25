import { mkdtempSync, rmSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InlineConfig, Plugin, ViteDevServer } from "vite";

/** The dev server (`ph dev`) serves the sign-in endpoint (F3d) through a
 * plugin whose middleware runs ahead of vite's own and of the other
 * plugins'. vite is mocked; the middleware runs on a plain node server. */

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

async function devPlugins(): Promise<Plugin[]> {
  const dir = mkdtempSync(join(tmpdir(), "studio-sign-in-"));
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
  const server = await runConnectStudio(
    {
      ...(await connectStudioServiceArgs()),
      printUrls: false,
      bindCLIShortcuts: false,
    },
    undefined,
    undefined,
    {
      serveFiles: { "/studio.config.json": "state.json" },
      localSignIn: {
        secret: "c2VjcmV0",
        issuer: () => Promise.reject(new Error("not asked")),
      },
    },
  );
  cleanups.push(() => void server.close());
  if (!config) throw new Error("vite got no config");
  return config.plugins as Plugin[];
}

describe("runConnectStudio with sign-in by link", () => {
  it("answers the endpoint ahead of the served files and vite, for its own port", async () => {
    const plugins = await devPlugins();
    expect(plugins.map((p) => p.name)).toEqual([
      "ph:local-sign-in",
      "ph:serve-files",
    ]);
    const node = createServer();
    await new Promise<void>((done) => node.listen(0, "127.0.0.1", done));
    cleanups.push(() => node.close());
    const address = node.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const used: Middleware[] = [];
    (plugins[0]!.configureServer as (server: unknown) => void)({
      middlewares: { use: (m: Middleware) => used.push(m) },
      config: { base: "/" },
      httpServer: { address: () => ({ port }) },
    });
    node.on("request", (req: IncomingMessage, res: ServerResponse) =>
      used[0]!(req, res, () => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<title>vite's app</title>");
      }),
    );
    const at = (path: string) => fetch(`http://localhost:${port}${path}`);
    const status = await at("/__ph/sign-in");
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ available: true });
    expect(await (await at("/d/drive")).text()).toContain("vite's app");
  });
});
