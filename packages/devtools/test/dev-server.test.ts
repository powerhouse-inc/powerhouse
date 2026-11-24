import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { DevStackInfo, ProjectReader } from "../src/api.js";
import devtoolsConnectPlugin from "../src/connect/index.js";
import {
  createDevtoolsServer,
  devtoolsRequested,
  devtoolsVitePlugin,
  type DevtoolsRun,
} from "../src/server/index.js";

const projectRoot = mkdtempSync(join(tmpdir(), "ph-devtools-server-"));
writeFileSync(
  join(projectRoot, "package.json"),
  JSON.stringify({ name: "my-project", version: "1.2.3" }),
);
afterAll(() => rmSync(projectRoot, { recursive: true, force: true }));

const APP_URL = "http://localhost:8080/";

const RUN: DevtoolsRun = {
  tool: { name: "ph-cli", version: "6.3.0" },
  startedAt: "2026-01-02T03:04:05.000Z",
  services: { switchboard: "http://localhost:4001/graphql" },
};

/** What the API answers for `RUN` on a server at `APP_URL`. */
const STACK: DevStackInfo = {
  project: { name: "my-project", version: "1.2.3" },
  ph: { version: "6.3.0" },
  app: { url: APP_URL },
  switchboard: { url: "http://localhost:4001/graphql" },
  mcp: { url: null },
  startedAt: "2026-01-02T03:04:05.000Z",
};

const context = { projectRoot, run: () => RUN };

type Tag = { tag: string; attrs: Record<string, string> };
type Env = { command: "serve" | "build"; mode: string; isPreview?: boolean };

const applies = (plugin: Plugin, env: Omit<Env, "mode">) =>
  (plugin.apply as (config: object, env: Env) => boolean)(
    {},
    { mode: "development", ...env },
  );

const tagsOf = (plugin: Plugin, base: string) =>
  (
    plugin.transformIndexHtml as unknown as (
      html: string,
      ctx: { server: { config: { base: string } } },
    ) => Tag[]
  )("", { server: { config: { base } } });

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of closers.splice(0)) await close();
});

async function listen(
  handler: ReturnType<typeof createDevtoolsServer>["handler"],
) {
  const server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const { port } = server.address() as AddressInfo;
  return (path: string, token?: string) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      headers: token ? { "x-ph-devtools-token": token } : {},
    });
}

type Middleware = Parameters<typeof listen>[0];

/** The middlewares the plugin gives a dev server, as one that runs them in
 * order. */
function middlewareOf(plugin: Plugin): Middleware {
  const handlers: Middleware[] = [];
  (
    plugin.configureServer as unknown as (server: {
      middlewares: { use: (handler: Middleware) => void };
      config: { base: string };
      resolvedUrls: { local: string[] };
    }) => void
  )({
    middlewares: { use: (handler) => handlers.push(handler) },
    config: { base: "/" },
    resolvedUrls: { local: [APP_URL] },
  });
  return (req, res, next) => {
    const [...left] = handlers;
    const run = () => {
      const handler = left.shift();
      if (handler) handler(req, res, run);
      else next();
    };
    run();
  };
}

describe("the DevTools Vite plugin", () => {
  it("applies to a dev server only: no build, in any mode, and no preview", () => {
    const plugin = devtoolsVitePlugin(context);
    expect(applies(plugin, { command: "serve" })).toBe(true);
    expect(applies(plugin, { command: "build" })).toBe(false);
    expect(applies(plugin, { command: "serve", isPreview: true })).toBe(false);
  });

  it("is off for a run under PH_DEVTOOLS=0, and in production", () => {
    expect(devtoolsRequested({})).toBe(true);
    expect(devtoolsRequested({ PH_DEVTOOLS: "1" })).toBe(true);
    expect(devtoolsRequested({ PH_DEVTOOLS: "" })).toBe(true);
    expect(devtoolsRequested({ PH_DEVTOOLS: "0" })).toBe(false);
    expect(devtoolsRequested({ NODE_ENV: "production" })).toBe(false);

    vi.stubEnv("PH_DEVTOOLS", "0");
    expect(applies(devtoolsVitePlugin(context), { command: "serve" })).toBe(
      false,
    );
  });

  it("puts the token, the base path and its module in the page", () => {
    const [meta, script] = tagsOf(devtoolsVitePlugin(context), "/app/");
    expect(meta).toMatchObject({
      tag: "meta",
      attrs: { name: "ph-devtools-token", "data-base": "/app/" },
    });
    expect(meta.attrs.content).toMatch(/^[\w-]{20,}$/);
    expect(script).toMatchObject({
      tag: "script",
      attrs: { type: "module", src: "/app/@id/virtual:ph-devtools/client" },
    });
  });

  it("keeps one token, so a restarted server answers an open tab", () => {
    const plugin = devtoolsVitePlugin(context);
    expect(tagsOf(plugin, "/")[0].attrs.content).toBe(
      tagsOf(plugin, "/")[0].attrs.content,
    );
  });

  it("serves the page's module as one of the project's own", () => {
    const resolveId = devtoolsVitePlugin(context).resolveId as unknown as (
      id: string,
    ) => string | undefined;
    expect(resolveId("virtual:ph-devtools/client")).toBe(
      "\0virtual:ph-devtools/client",
    );
    expect(resolveId("virtual:ph-devtools/mount")).toMatch(
      /dist[\\/]mount\.js$/,
    );
    expect(resolveId("react")).toBeUndefined();
  });

  it("answers the API with the token of its tag", async () => {
    const plugin = devtoolsVitePlugin(context);
    const get = await listen(middlewareOf(plugin));
    const token = tagsOf(plugin, "/")[0].attrs.content;

    const info = await get("/__ph/devtools/api/info", token);
    expect(await info.json()).toEqual(STACK);
    expect((await get("/__ph/devtools/api/info")).status).toBe(401);
  });

  it("puts neither the token nor its module in a page it sends another machine", () => {
    const plugin = devtoolsVitePlugin(context);
    const middleware = middlewareOf(plugin);
    const tagsFor = (localAddress: string) => {
      let tags: Tag[] | undefined;
      middleware(
        { url: "/", headers: {}, socket: { localAddress } } as never,
        {} as never,
        () => {
          tags = tagsOf(plugin, "/");
        },
      );
      return tags;
    };
    expect(tagsFor("127.0.0.1")).toHaveLength(2);
    expect(tagsFor("192.168.1.20")).toEqual([]);
  });
});

describe("DevTools as a Connect dev-server plugin", () => {
  it("gives the dev server its Vite plugin, with the Connect page module", async () => {
    expect(devtoolsConnectPlugin).toMatchObject({
      name: "devtools",
      appliesTo: "connect",
    });
    const plugins = await devtoolsConnectPlugin.hooks?.devServer?.(context);
    expect(plugins?.map((plugin) => plugin.name)).toEqual(["ph-devtools"]);
  });
});

describe("DevTools for a server that is not Vite's", () => {
  it("answers the page that carries its tag, and no other caller", async () => {
    const { handler, tokenTag } = createDevtoolsServer({
      ...context,
      appUrl: () => APP_URL,
      base: "/app/",
    });
    const token =
      /^<meta name="ph-devtools-token" content="([\w-]+)" data-base="\/app\/">$/.exec(
        tokenTag,
      )?.[1];
    expect(token).toBeDefined();
    const get = await listen(handler);

    expect(
      await (await get("/app/__ph/devtools/api/info", token)).json(),
    ).toEqual(STACK);
    expect((await get("/app/__ph/devtools/api/info")).status).toBe(401);
    expect((await get("/app/__ph/devtools/api/info", "wrong")).status).toBe(
      401,
    );
    expect((await get("/anything-else", token)).status).toBe(404);
  });

  it("needs only the project's folder: what it is not told stays unknown", async () => {
    const { handler, tokenTag } = createDevtoolsServer({ projectRoot });
    const token = /content="([\w-]+)"/.exec(tokenTag)?.[1];
    const get = await listen(handler);

    expect(await (await get("/__ph/devtools/api/info", token)).json()).toEqual({
      project: { name: "my-project", version: "1.2.3" },
      ph: { version: "unknown" },
      app: { url: null },
      switchboard: { url: null },
      mcp: { url: null },
      startedAt: null,
    });
  });

  it("reads the project through the reader it is given, in place of its own", async () => {
    const project = {
      revision: () => "r1",
      fileList: () => Promise.resolve({ revision: "r1", modules: [] }),
    } as unknown as ProjectReader;
    const { handler, tokenTag } = createDevtoolsServer({
      projectRoot,
      project,
    });
    const token = /content="([\w-]+)"/.exec(tokenTag)?.[1];
    const get = await listen(handler);

    const files = await get("/__ph/devtools/api/project/files", token);
    expect(await files.json()).toEqual({ revision: "r1", modules: [] });
  });

  it("refuses to start in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createDevtoolsServer(context)).toThrow(/development only/);
  });
});
