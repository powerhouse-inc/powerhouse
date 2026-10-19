import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rolldown } from "vite";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONNECT_ROUTES_GEN,
  connectRouterChunkGroups,
  connectRoutesGeneratorConfig,
  generateConnectRoutes,
  resolveConnectRoutesDir,
} from "./connect-routes.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const connectDir = join(repoRoot, "apps/connect");

let project: string;
const HOST_ROUTES = "hosts/connect/routes";

function addRoute(file: string, path: string, dir = HOST_ROUTES) {
  const target = join(project, dir, file);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(
    target,
    `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("${path}")({});\n`,
  );
}

const generate = (routesDir = join(project, HOST_ROUTES)) =>
  generateConnectRoutes(
    project,
    routesDir,
    connectRoutesGeneratorConfig(connectDir, project, routesDir),
  );

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "connect-routes-"));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("generateConnectRoutes", () => {
  it("mounts the project's routes beside Connect's core routes", async () => {
    addRoute("hello.tsx", "/hello");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).toContain('"/hello": typeof HelloRoute');
    expect(tree).toContain('"/d/$driveSlug/{-$nodeSlug}"');
    expect(tree).toContain("interface Register");
    // Connect's route files by package name, so tsc treats them as a library.
    expect(tree).toContain('from "@powerhousedao/connect/routes/__root"');
  });

  it("nests a project's _app/ routes in Connect's layout, and others at the root", async () => {
    addRoute("_app/reports.tsx", "/_app/reports");
    addRoute("(pages)/hello.tsx", "/hello");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).toContain('"/_app/reports": typeof');
    expect(tree).toMatch(
      /ReportsRoute = [\s\S]*?getParentRoute: \(\) => coreAppRoute,/,
    );
    // A route group only organises: /hello, outside the layout.
    expect(tree).toMatch(
      /HelloRoute = [\s\S]*?path: "\/hello",\s*getParentRoute: \(\) => rootRouteImport,/,
    );
    expect(tree).toContain('from "@powerhousedao/connect/routes/core/_app"');
  });

  it("replaces Connect's layout with a project's _app.tsx, keeping the core routes in it", async () => {
    addRoute("_app.tsx", "/_app");
    addRoute("_app/reports.tsx", "/_app/reports");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).not.toContain('"@powerhousedao/connect/routes/core/_app"');
    expect(tree).toMatch(/from "\.\/\.\.\/hosts\/connect\/routes\/_app\.js"/);
    expect(tree).toContain('"/_app/_content/d/$driveSlug/{-$nodeSlug}"');
    expect(tree).toContain('"/_app/reports": typeof');
    // Mounted once, as the layout, not again as a root route.
    expect(tree.match(/routes\/_app\.js"/g)).toHaveLength(1);
  });

  it("nests a project's settings tab under Connect's settings layout", async () => {
    addRoute("_app/settings/reports.tsx", "/_app/settings/reports");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).toMatch(
      /SettingsReportsRoute = [\s\S]*?getParentRoute: \(\) => SettingsRoute,/,
    );
    expect(tree).toContain('"/settings/reports": typeof SettingsReportsRoute');
  });

  it("fails on a project settings layout, which Connect owns", async () => {
    addRoute("_app/settings.tsx", "/_app/settings");
    await expect(generate()).rejects.toThrow(
      /could not mount the routes in hosts\/connect\/routes\/[\s\S]*Conflicting/,
    );
  });

  it("fails on a project route that collides with a core route", async () => {
    addRoute("index.tsx", "/");
    await expect(generate()).rejects.toThrow(
      /could not mount the routes in hosts\/connect\/routes\/[\s\S]*Conflicting/,
    );
  });
});

describe("resolveConnectRoutesDir", () => {
  it("finds the routes in the connect host folder", () => {
    addRoute("hello.tsx", "/hello");
    expect(resolveConnectRoutesDir(project)).toBe(join(project, HOST_ROUTES));
  });

  it("ignores a routes folder at the project root", () => {
    addRoute("hello.tsx", "/hello", "routes");
    expect(resolveConnectRoutesDir(project)).toBeUndefined();
  });
});

describe("project route types", () => {
  // test/versioned-documents' hosts/connect/routes/-types.check.ts fails on any.
  it("types loader data, params, search and context in project routes", async () => {
    const fixture = join(repoRoot, "test/versioned-documents");
    const routesDir = resolveConnectRoutesDir(fixture);
    expect(routesDir).toBe(join(fixture, "hosts/connect/routes"));
    await generateConnectRoutes(
      fixture,
      routesDir!,
      connectRoutesGeneratorConfig(connectDir, fixture, routesDir!),
    );
    const typecheck = () =>
      execFileSync(
        join(repoRoot, "node_modules/.bin/tsc"),
        ["-p", join(fixture, "hosts/connect/routes/tsconfig.json")],
        { cwd: fixture, encoding: "utf8", stdio: "pipe" },
      );
    expect(typecheck).not.toThrow();
  }, 120_000);
});

describe("connectRouterChunkGroups", () => {
  const routesDir = "/project/routes";
  const router = "/project/node_modules/@tanstack/react-router/index.js";
  const syncStore = "/project/node_modules/use-sync-external-store/index.js";
  const wallet = "/project/node_modules/wallet/index.js";
  const modules: Record<string, string> = {
    "/entry.js": `globalThis.app = () => import("/app.js");\nglobalThis.wallet = () => import("${wallet}");`,
    "/app.js": `import { createRouter } from "${router}";\nimport { Route } from "/project/routes/hello.js";\nexport default [createRouter, Route];`,
    "/project/routes/hello.js": `import { createFileRoute } from "${router}";\nexport const Route = createFileRoute(() => import("/project/routes/hello.js?tsr-split=component"));`,
    "/project/routes/hello.js?tsr-split=component": `import { useParams } from "${router}";\nexport default useParams;`,
    [router]: `import { useSyncExternalStore } from "${syncStore}";\nexport const createRouter = () => useSyncExternalStore;\nexport const createFileRoute = (f) => f;\nexport const useParams = () => 2;`,
    [syncStore]: "export const useSyncExternalStore = () => 3;",
    // A library that shares use-sync-external-store with the router.
    [wallet]: `import { useSyncExternalStore } from "${syncStore}";\nexport default useSyncExternalStore;`,
  };

  async function bundle() {
    const result = await build({
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "modules",
          enforce: "pre",
          resolveId: (id) => (id in modules ? id : undefined),
          load: (id) => modules[id],
        },
      ],
      build: {
        write: false,
        minify: false,
        rolldownOptions: {
          input: "/entry.js",
          output: {
            codeSplitting: { groups: connectRouterChunkGroups(routesDir) },
          },
        },
      },
    });
    const [output] = Array.isArray(result) ? result : [result];
    return (output as Rolldown.RolldownOutput).output.filter(
      (file): file is Rolldown.OutputChunk => file.type === "chunk",
    );
  }

  it("puts the router and the route configs in one chunk, apart from the entry", async () => {
    const chunks = await bundle();
    const routerChunk = chunks.find((chunk) => chunk.name === "router")!;
    expect(Object.keys(routerChunk.modules).sort()).toEqual(
      [router, "/project/routes/hello.js"].sort(),
    );
    const entry = chunks.find((chunk) => chunk.isEntry)!;
    expect(entry.imports).not.toContain(routerChunk.fileName);
    // The split component stays lazy.
    const component = chunks.find(
      (chunk) =>
        "/project/routes/hello.js?tsr-split=component" in chunk.modules,
    )!;
    expect(component.fileName).not.toBe(routerChunk.fileName);
    expect(component.isDynamicEntry).toBe(true);
  });

  it("leaves a library that shares the router's dependencies out of the router chunk", async () => {
    const chunks = await bundle();
    const routerChunk = chunks.find((chunk) => chunk.name === "router")!;
    const walletChunk = chunks.find((chunk) => wallet in chunk.modules)!;
    expect(walletChunk.imports).not.toContain(routerChunk.fileName);
  });
});
