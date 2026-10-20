import { execFileSync } from "node:child_process";
import {
  existsSync,
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
  connectRoutes,
  connectRoutesGeneratorConfig,
  connectRoutesTreeOf,
  generateConnectRoutes,
  PACKAGE_ROUTES_MODULE,
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
  it("mounts the project's routes beside Connect's routes", async () => {
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
      /ReportsRoute = [\s\S]*?getParentRoute: \(\) => appRoute,/,
    );
    // A route group only organises: /hello, outside the layout.
    expect(tree).toMatch(
      /HelloRoute = [\s\S]*?path: "\/hello",\s*getParentRoute: \(\) => rootRouteImport,/,
    );
    expect(tree).toContain('from "@powerhousedao/connect/routes/_app"');
  });

  it("replaces Connect's layout with a project's _app.tsx, keeping Connect's routes in it", async () => {
    addRoute("_app.tsx", "/_app");
    addRoute("_app/reports.tsx", "/_app/reports");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).not.toContain('"@powerhousedao/connect/routes/_app"');
    expect(tree).toMatch(/from "\.\/\.\.\/hosts\/connect\/routes\/_app\.js"/);
    expect(tree).toContain('"/_app/d/$driveSlug/{-$nodeSlug}"');
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

  it("replaces Connect's node route with a project file at its path", async () => {
    addRoute(
      "_app/d/$driveSlug/{-$nodeSlug}.tsx",
      "/_app/d/$driveSlug/{-$nodeSlug}",
    );
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    const imports = tree.match(/^import .*\{-\$nodeSlug\}.*$/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("hosts/connect/routes/_app/d/");
    expect(tree).toMatch(
      /NodeSlugChar125Route =\s[\s\S]*?getParentRoute: \(\) => appDDriveSlugRoute,/,
    );
    // Connect's other routes stay.
    expect(tree).toContain('from "@powerhousedao/connect/routes/_app/index"');
    expect(tree).toContain(
      'from "@powerhousedao/connect/routes/_app/settings"',
    );
  });

  it("nests Connect's settings tabs in a project's settings override", async () => {
    addRoute("_app/settings.tsx", "/_app/settings");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).not.toContain('"@powerhousedao/connect/routes/_app/settings"');
    expect(tree).toContain("routes/_app/settings.js");
    expect(tree).toMatch(
      /SettingsAppearanceRoute = [\s\S]*?getParentRoute: \(\) => SettingsRoute,/,
    );
  });

  // To hide a Connect route, an override's beforeLoad throws notFound() or redirect().
  it("mounts an override of a Connect route once", async () => {
    addRoute("_app/settings/packages.tsx", "/_app/settings/packages");
    await generate();
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).not.toContain(
      "@powerhousedao/connect/routes/_app/settings/packages",
    );
    expect(tree.match(/^import .*settings\/packages.*$/gm)).toHaveLength(1);
  });

  it("fails on two project files for one path", async () => {
    addRoute("_app/reports.tsx", "/_app/reports");
    addRoute("_app/(group)/reports.tsx", "/_app/reports");
    await expect(generate()).rejects.toThrow(
      /could not mount the routes in hosts\/connect\/routes\/[\s\S]*Conflicting/,
    );
  });

  it("fails on a project route that collides with a Connect route", async () => {
    addRoute("index.tsx", "/");
    await expect(generate()).rejects.toThrow(
      /could not mount the routes in hosts\/connect\/routes\/[\s\S]*Conflicting/,
    );
  });
});

describe("the package's offered routes", () => {
  it("lists its routes by id and parent, without its layout and overrides", async () => {
    addRoute("_app.tsx", "/_app");
    addRoute("_app/index.tsx", "/_app/");
    addRoute("_app/reports.tsx", "/_app/reports");
    addRoute("_app/reports/$driveSlug.tsx", "/_app/reports/$driveSlug");
    addRoute("_app/settings/inventory.tsx", "/_app/settings/inventory");
    addRoute("_app/d/$driveSlug/stats.tsx", "/_app/d/$driveSlug/stats");
    addRoute("hello.tsx", "/hello");
    await generate();
    const module = readFileSync(join(project, PACKAGE_ROUTES_MODULE), "utf8");
    const entries = [...module.matchAll(/\{ route: (r\d+), (.*) \},/g)].map(
      ([, ref, fields]) => {
        const file = new RegExp(
          `import \\{ Route as ${ref} \\} from "(.*)";`,
        ).exec(module)?.[1];
        return { file, fields };
      },
    );
    expect(entries).toEqual([
      {
        file: "../hosts/connect/routes/hello.js",
        fields: 'id: "/hello", path: "/hello", parentId: "__root__"',
      },
      {
        file: "../hosts/connect/routes/_app/reports.js",
        fields: 'id: "/_app/reports", path: "/reports", parentId: "/_app"',
      },
      {
        file: "../hosts/connect/routes/_app/reports/$driveSlug.js",
        fields:
          'id: "/_app/reports/$driveSlug", path: "/$driveSlug", parentId: "/_app/reports"',
      },
      {
        file: "../hosts/connect/routes/_app/settings/inventory.js",
        fields:
          'id: "/_app/settings/inventory", path: "/inventory", parentId: "/_app/settings"',
      },
      {
        file: "../hosts/connect/routes/_app/d/$driveSlug/stats.js",
        fields:
          'id: "/_app/d/$driveSlug/stats", path: "/stats", parentId: "/_app/d/$driveSlug"',
      },
    ]);
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

  it("takes a host's routes folder, or none for false", () => {
    addRoute("hello.tsx", "/hello");
    addRoute("lab.tsx", "/lab", "hosts/lab/routes");
    expect(resolveConnectRoutesDir(project, "hosts/lab/routes")).toBe(
      join(project, "hosts/lab/routes"),
    );
    expect(resolveConnectRoutesDir(project, false)).toBeUndefined();
    expect(() => resolveConnectRoutesDir(project, "hosts/none")).toThrow(
      "The routes folder hosts/none does not exist.",
    );
  });
});

describe("a host's own routes folder", () => {
  it("generates its own tree and offers nothing to other Connects", async () => {
    addRoute("hello.tsx", "/hello");
    await generate();
    expect(existsSync(join(project, PACKAGE_ROUTES_MODULE))).toBe(true);
    rmSync(join(project, PACKAGE_ROUTES_MODULE));

    addRoute("lab.tsx", "/lab", "hosts/lab/routes");
    const labDir = join(project, "hosts/lab/routes");
    await generate(labDir);
    const labTree = connectRoutesTreeOf(project, labDir);
    expect(labTree).toBe(join(project, ".ph/hosts/lab/routes.gen.ts"));
    expect(readFileSync(labTree, "utf8")).toContain('"/lab"');
    expect(readFileSync(labTree, "utf8")).not.toContain('"/hello"');
    // The project's tree and offered routes stay hosts/connect/routes'.
    const tree = readFileSync(join(project, CONNECT_ROUTES_GEN), "utf8");
    expect(tree).toContain('"/hello"');
    expect(tree).not.toContain('"/lab"');
    expect(existsSync(join(project, PACKAGE_ROUTES_MODULE))).toBe(false);
  });

  it("keeps the project's tree for a host without routes", async () => {
    addRoute("hello.tsx", "/hello");
    await generate();
    const { plugins, aliases } = connectRoutes(project, false);
    expect(plugins).toEqual([]);
    expect(aliases[0].replacement).toMatch(
      /connect[\\/]dist[\\/]route-tree\.js$/,
    );
    expect(existsSync(join(project, CONNECT_ROUTES_GEN))).toBe(true);
  });
});

describe("connectRoutes", () => {
  it("points Connect's and core's route tree specifiers at the project tree", () => {
    const fixture = join(repoRoot, "test/versioned-documents");
    const [tree, views] = connectRoutes(fixture).aliases;
    const find = tree.find as RegExp;
    expect(find.test("@powerhousedao/connect/route-tree")).toBe(true);
    expect(find.test("@powerhousedao/connect-core/route-tree")).toBe(true);
    expect(find.test("@powerhousedao/connect-core/router")).toBe(false);
    expect(tree.replacement).toBe(join(fixture, CONNECT_ROUTES_GEN));
    // Connect's route files render its dist's views, never its sources.
    expect(
      (views.find as RegExp).test("@powerhousedao/connect/route-views"),
    ).toBe(true);
    expect(views.replacement).toMatch(/connect[\\/]dist[\\/]route-views\.js$/);
  });

  it("points both specifiers at Connect's prebuilt tree when the project has no routes", () => {
    const fixture = join(repoRoot, "test/test-consumer-project");
    const { aliases, plugins } = connectRoutes(fixture);
    const { replacement } = aliases[0];
    expect(plugins).toEqual([]);
    expect(replacement).toMatch(/connect[\\/]dist[\\/]route-tree\.js$/);
    expect(replacement).not.toMatch(/connect-core[\\/]dist/);
    // Not imported: Connect's views read the runtime config as they load.
    expect(existsSync(replacement)).toBe(true);
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
