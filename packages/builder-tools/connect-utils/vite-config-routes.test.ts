import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Alias, Plugin } from "vite";
import { createServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConnectBaseViteConfig } from "./vite-config.js";
import {
  CONNECT_ROUTES_GEN,
  HOST_ROUTES_DIR,
  ROUTE_TREE_SPECIFIER,
  syncConnectRoutes,
} from "./vite-plugins/connect-routes.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// Under node_modules, so the project resolves this package's Connect.
function routelessProject() {
  const root = mkdtempSync(join(process.cwd(), "node_modules/.routes-wire-"));
  roots.push(root);
  writeFileSync(join(root, "powerhouse.config.json"), "{}");
  return root;
}

async function routeTreeOf(mode: string, root: string) {
  const config = getConnectBaseViteConfig({ mode, dirname: root });
  const aliases = config.resolve?.alias as Alias[];
  const tree = aliases.find(
    (alias) =>
      alias.find instanceof RegExp && alias.find.test(ROUTE_TREE_SPECIFIER),
  )?.replacement;
  const names: string[] = [];
  const collect = async (option: unknown): Promise<void> => {
    const resolved: unknown = await option;
    if (Array.isArray(resolved)) {
      for (const item of resolved) await collect(item);
    } else if (resolved) {
      names.push((resolved as Plugin).name);
    }
  };
  await collect(config.plugins);
  return { tree, plugins: names };
}

describe("getConnectBaseViteConfig without hosts/connect/routes/", () => {
  it("dev routes through the project's tree, so a folder added later shows", async () => {
    const root = routelessProject();
    const { tree, plugins } = await routeTreeOf("development", root);
    expect(tree).toBe(join(root, CONNECT_ROUTES_GEN));
    expect(plugins).toContain("ph-connect-routes-watcher");
  }, 60_000);

  it("a build keeps Connect's prebuilt tree", async () => {
    const { tree, plugins } = await routeTreeOf(
      "production",
      routelessProject(),
    );
    expect(tree).toMatch(/dist[\\/]route-tree\.js$/);
    expect(plugins).not.toContain("ph-connect-routes-watcher");
  }, 60_000);
});

// What `npm run tsc` and `npm run lint` run first, while Studio is up.
describe("generating the tree under a running dev server without hosts/connect/routes/", () => {
  it("leaves the route tree resolvable, with Connect's routes", async () => {
    const root = routelessProject();
    const tree = join(root, CONNECT_ROUTES_GEN);
    const config = getConnectBaseViteConfig({
      mode: "development",
      dirname: root,
    });
    const alias = (config.resolve!.alias as Alias[]).find(
      ({ find }) => find instanceof RegExp && find.test(ROUTE_TREE_SPECIFIER),
    );
    expect(alias?.replacement).toBe(tree);
    const server = await createServer({
      ...config,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
    });
    try {
      await vi.waitFor(() => expect(existsSync(tree)).toBe(true), {
        timeout: 30_000,
        interval: 100,
      });

      await syncConnectRoutes(root);

      // What the alias points at still loads.
      expect(readFileSync(tree, "utf8")).toContain('"/d/$driveSlug"');
      const loaded = await server.transformRequest(tree);
      expect(loaded?.code).toContain("routeTree");
    } finally {
      await server.close();
    }
  }, 120_000);

  it("drops a removed folder's routes from the tree", async () => {
    const root = routelessProject();
    const routes = join(root, HOST_ROUTES_DIR);
    mkdirSync(routes, { recursive: true });
    writeFileSync(
      join(routes, "hello.tsx"),
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/hello")({});\n`,
    );
    await syncConnectRoutes(root);
    const tree = join(root, CONNECT_ROUTES_GEN);
    expect(readFileSync(tree, "utf8")).toContain('"/hello"');

    rmSync(join(root, "hosts"), { recursive: true });
    await syncConnectRoutes(root);

    expect(readFileSync(tree, "utf8")).not.toContain('"/hello"');
    expect(readFileSync(tree, "utf8")).toContain('"/d/$driveSlug"');
  }, 60_000);
});

// A browser's navigation sends Accept: text/html; curl's */* always got the file.
describe("navigating Studio to a static file", () => {
  it("serves the file, and the shell for the app's routes", async () => {
    const root = routelessProject();
    mkdirSync(join(root, "public"));
    writeFileSync(join(root, "public", "icon.svg"), "<svg/>");
    writeFileSync(join(root, "index.html"), "<html><head></head></html>");
    const config = getConnectBaseViteConfig({
      mode: "development",
      dirname: root,
    });
    // Studio runs in the project, Vite's default root.
    const server = await createServer({
      ...config,
      root,
      logLevel: "silent",
      server: { port: 0, ws: false },
    });
    await server.listen();
    try {
      const url = server.resolvedUrls!.local[0];
      const navigate = (path: string) =>
        fetch(new URL(path, url), {
          headers: { accept: "text/html,application/xhtml+xml" },
        });

      const icon = await navigate("icon.svg");
      expect(icon.headers.get("content-type")).toContain("image/svg+xml");
      expect(await icon.text()).toBe("<svg/>");
      const route = await navigate("d/some-drive");
      expect(route.headers.get("content-type")).toContain("text/html");
      expect(await route.text()).toContain("Content-Security-Policy");
    } finally {
      await server.close();
    }
  }, 60_000);
});
