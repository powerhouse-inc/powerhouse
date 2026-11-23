// @vitest-environment happy-dom
import workflowPkg from "@powerhousedao/workflow/package.json" with { type: "json" };
import {
  createPHStore,
  PHStoreProvider,
  useAppModuleById,
  useAppModules,
  useDocumentModelModules,
  useEditorModules,
} from "@powerhousedao/reactor-browser";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserPackageManager,
  declareExternalPackagesLayer,
  LAYER_ORDER,
  sharedDepMismatchWarnings,
} from "./package-manager.js";

// Reached through a lazy `import()`, so the fake stands in for the code-split
// chunk without pulling the package's editors in here.
vi.mock("@powerhousedao/workflow", () => ({
  manifest: { name: "@powerhousedao/workflow" },
  documentModels: [],
  editors: [],
}));

// Core's registration is tested in connect-core; this tracks what is live.
const activeRoutes = vi.hoisted(() => new Set<string>());
const routeHolds = vi.hoisted(() => ({ count: 0 }));
vi.mock("@powerhousedao/connect-core/router", () => ({
  holdConnectRoutes: () => {
    routeHolds.count++;
    return () => {
      routeHolds.count--;
    };
  },
  registerPackageRoutes: (routes: { id: string }[]) => {
    for (const route of routes) activeRoutes.add(route.id);
    return () => {
      for (const route of routes) activeRoutes.delete(route.id);
    };
  },
}));

const WORKFLOW = "@powerhousedao/workflow";
const LISTED = "@acme/listed";
const COMMON = "Common";

const HOST_VERSIONS = {
  "document-model": "1.4.0",
  "reactor-browser": "3.2.1",
  "design-system": "2.0.0",
};

describe("sharedDepMismatchWarnings", () => {
  it("returns nothing when the host has no version table or the package.json is missing", () => {
    // A dev / vendor-off host has no table to compare against, and an
    // unfetchable package.json means the check cannot run — both are
    // silent, never a warning.
    expect(
      sharedDepMismatchWarnings(
        { peerDependencies: { "reactor-browser": ">=9.0.0" } },
        null,
      ),
    ).toEqual([]);
    expect(sharedDepMismatchWarnings(null, HOST_VERSIONS)).toEqual([]);
  });

  it("flags only the shared-dep ranges the host version does not satisfy", () => {
    const warnings = sharedDepMismatchWarnings(
      {
        // "document-model" is satisfied by the host (>=1.0.0 vs 1.4.0) and
        // "left-pad" is not a shared dep — both must stay out of the output.
        peerDependencies: {
          "reactor-browser": ">=9.0.0",
          "document-model": ">=1.0.0",
        },
        dependencies: { "left-pad": "^1.0.0" },
      },
      HOST_VERSIONS,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("reactor-browser");
    expect(warnings[0]).toContain(">=9.0.0");
    expect(warnings[0]).toContain("3.2.1");
  });
});

describe("BrowserPackageManager.init — flag-gated local packages", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function manager() {
    return new BrowserPackageManager("test", null);
  }

  it("does not register workflow with the flag off", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, false);
    expect(pm.getPackageSource(WORKFLOW)).toBeNull();
  });

  it("registers the workflow package by manifest name and package.json version when the flag is on", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, true);
    expect(pm.getPackageSource(WORKFLOW)).toBe("common");
    expect(pm.getPackageVersion(WORKFLOW)).toBe(workflowPkg.version);
  });

  it("registers a package the host lists, as the bundled packages module does", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, false);
    expect(pm.getPackageSource(LISTED)).toBeNull();
    pm.addLocalPackage(
      LISTED,
      { manifest: { name: LISTED }, documentModels: [], editors: [] } as never,
      "1.2.3",
    );
    expect(pm.getPackageSource(LISTED)).toBe("common");
    expect(pm.getPackageVersion(LISTED)).toBe("1.2.3");
  });
});

describe("BrowserPackageManager.init — the generic chrome's editors", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // What core's views read: the store's package manager, through reactor-browser's hooks.
  async function modulesFor(genericChrome: boolean) {
    const pm = new BrowserPackageManager("test", null);
    await pm.init(undefined, undefined, false, genericChrome);
    const store = createPHStore();
    store.vetraPackageManager = pm;
    const { result } = renderHook(
      () => ({
        app: useAppModuleById("GenericDriveExplorer"),
        apps: useAppModules(),
        editors: useEditorModules(),
        models: useDocumentModelModules(),
      }),
      {
        wrapper: ({ children }) =>
          createElement(PHStoreProvider, { store, children }),
      },
    );
    return { pm, ...result.current };
  }

  it("registers common's drive explorer and editors with the generic chrome", async () => {
    const { app, editors, pm } = await modulesFor(true);
    expect(app?.config.id).toBe("GenericDriveExplorer");
    expect(editors?.map((e) => e.config.id)).toContain(
      "document-model-editor-v2",
    );
    expect(pm.getPackageSource(COMMON)).toBe("common");
  });

  it("registers common's document models only without it", async () => {
    const { app, apps, editors, models, pm } = await modulesFor(false);
    expect(app).toBeUndefined();
    expect(apps).toEqual([]);
    expect(editors).toEqual([]);
    expect(models?.map((m) => m.documentModel.global.id)).toContain(
      "powerhouse/document-drive",
    );
    expect(pm.getPackageSource(COMMON)).toBe("common");
  });
});

describe("declareExternalPackagesLayer", () => {
  it("declares the layer before any stylesheet, once", () => {
    // Stands in for the project's stylesheet, already in <head>.
    document.head.innerHTML = '<meta name="project-stylesheet" />';
    declareExternalPackagesLayer();
    declareExternalPackagesLayer();
    const first = document.head.firstElementChild;
    expect(first?.tagName).toBe("STYLE");
    expect(first?.textContent).toBe(LAYER_ORDER);
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
  });
});

describe("a package's offered routes", () => {
  const NAME = "@acme/reports";
  const pkg = (connectRoutes: boolean) =>
    ({
      manifest: { name: NAME, connectRoutes },
      documentModels: [],
      editors: [],
    }) as never;
  const routes = (id: string) => () =>
    Promise.resolve({ connectRoutes: [{ id, parentId: "/_app" }] as never });

  beforeEach(() => {
    activeRoutes.clear();
  });

  it("registers them, replaces them on a reinstall and drops them on removal", async () => {
    const pm = new BrowserPackageManager("routes", null);
    pm.addLocalPackage(NAME, pkg(true), "1.0.0", routes("/_app/v1"));
    // Unknown paths wait while they load.
    expect(routeHolds.count).toBe(1);
    await vi.waitFor(() => expect([...activeRoutes]).toEqual(["/_app/v1"]));
    await vi.waitFor(() => expect(routeHolds.count).toBe(0));

    pm.addLocalPackage(NAME, pkg(true), "2.0.0", routes("/_app/v2"));
    await vi.waitFor(() => expect([...activeRoutes]).toEqual(["/_app/v2"]));

    pm.removePackage(NAME);
    expect([...activeRoutes]).toEqual([]);
  });

  it("loads none for a package whose manifest offers none", () => {
    const load = vi.fn(routes("/_app/v1"));
    const pm = new BrowserPackageManager("routes", null);
    pm.addLocalPackage(NAME, pkg(false), "1.0.0", load);
    expect(load).not.toHaveBeenCalled();
  });

  it("drops routes still loading when the package is replaced", async () => {
    let finish = () => {};
    const slow = () =>
      new Promise<{ connectRoutes: never }>((resolve) => {
        finish = () =>
          resolve({
            connectRoutes: [{ id: "/_app/v1", parentId: "/_app" }] as never,
          });
      });
    const pm = new BrowserPackageManager("routes", null);
    pm.addLocalPackage(NAME, pkg(true), "1.0.0", slow);
    pm.addLocalPackage(NAME, pkg(true), "2.0.0", routes("/_app/v2"));
    finish();
    await vi.waitFor(() => expect([...activeRoutes]).toEqual(["/_app/v2"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...activeRoutes]).toEqual(["/_app/v2"]);
  });
});
