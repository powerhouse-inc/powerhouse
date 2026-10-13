import { DocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  DocumentModelLib,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  FIXTURE_PACKAGE_NAME,
  materializeLoaderPackage,
  observedModels,
  type MaterializedPackage,
} from "../../document-model/test/fixtures/loaders/materialize.js";
import { resolveDocumentModelModule } from "../src/graphql-client/static-package-manager.js";
import { setVetraPackageManager } from "../src/hooks/vetra-packages.js";
import { WorkerPackageLoader } from "../src/rpc/worker-package-loader.js";
import {
  fakePackageManager,
  stubConnectWindow,
} from "./utils/package-manager.js";

/**
 * Each browser-side loader picks a module differently. The worker keys by
 * `documentType@version` and resolves the latest. The static manager resolves
 * the latest unless asked for an exact version. Connect keeps the first of a
 * duplicate pair. These are compatibility behaviors, and none may depend on
 * whether a package was declared code-first.
 */

const DOCUMENT_TYPE = "test/ledger";

let fixture: MaterializedPackage;
let browserModules: Record<string, unknown>;
let nodeModules: Record<string, unknown>;

beforeAll(async () => {
  fixture = materializeLoaderPackage();
  browserModules = (await import(
    /* @vite-ignore */
    pathToFileURL(join(fixture.root, "browser/document-models/index.ts")).href
  )) as Record<string, unknown>;
  nodeModules = (await import(
    /* @vite-ignore */
    pathToFileURL(join(fixture.root, "document-models/index.ts")).href
  )) as Record<string, unknown>;
});

afterAll(() => {
  fixture.dispose();
});

function modulesOf(namespace: Record<string, unknown>): DocumentModelModule[] {
  return (namespace.documentModels as DocumentModelModule[]).slice();
}

describe("browser and node builds of the same package", () => {
  it("expose identical ids, versions, specifications, action types and SDL", () => {
    expect(observedModels(modulesOf(browserModules))).toEqual(
      observedModels(modulesOf(nodeModules)),
    );
    // Guards against a vacuous match. Both builds carry two versions and real
    // SDL.
    const [first, second] = observedModels(modulesOf(browserModules));
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(first.specifications[0].globalSchema).toContain("type LedgerState");
    expect(second.actions).toContain("setCurrency");
  });

  it("keeps every model version a named top-level export", () => {
    // A reactor worker records an export name and later imports that exact
    // property; a package that only shipped the collection would break it.
    for (const namespace of [browserModules, nodeModules]) {
      expect(namespace.ledgerV1).toBe(
        modulesOf(namespace).find((module) => module.version === 1),
      );
      expect(namespace.ledgerV2).toBe(
        modulesOf(namespace).find((module) => module.version === 2),
      );
    }
  });
});

describe("browser worker", () => {
  function loaderFor(root: string) {
    const requested: string[] = [];
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example/",
      importPackage: (url) => {
        requested.push(url);
        return import(
          /* @vite-ignore */
          pathToFileURL(join(root, "browser/document-models/index.ts")).href
        ) as Promise<Record<string, unknown>>;
      },
      resolvePackages: () => Promise.resolve([FIXTURE_PACKAGE_NAME]),
    });
    return { loader, requested };
  }

  it("imports the browser model subpath", async () => {
    const { loader, requested } = loaderFor(fixture.root);
    await loader.loadPackages([`${FIXTURE_PACKAGE_NAME}@1.0.0`]);
    expect(requested).toEqual([
      `https://cdn.example/${FIXTURE_PACKAGE_NAME}/browser/document-models/index.js`,
    ]);
  });

  it("retains both versions and loads the latest", async () => {
    const { loader } = loaderFor(fixture.root);
    const models = await loader.loadPackages([FIXTURE_PACKAGE_NAME]);
    // Keyed by `documentType@version`, so neither version evicts the other.
    // The namespace's null-documentModel export is not loaded as a module.
    expect(models.map((module) => module.version ?? 1).sort()).toEqual([1, 2]);
    const latest = await loader.load(DOCUMENT_TYPE);
    expect(latest.version).toBe(2);
    expect(loader.loadFailures).toEqual([]);
  });

  it("observes the same thing for the schema-first package", async () => {
    const codeFirst = loaderFor(fixture.root);
    const schemaFirst = loaderFor(fixture.schemaFirstRoot);
    const left = await codeFirst.loader.loadPackages([FIXTURE_PACKAGE_NAME]);
    const right = await schemaFirst.loader.loadPackages([FIXTURE_PACKAGE_NAME]);
    expect(observedModels(left).map((model) => model.version)).toEqual([1, 2]);
    expect(observedModels(left)).toEqual(observedModels(right));
    expect((await codeFirst.loader.load(DOCUMENT_TYPE)).version).toBe(
      (await schemaFirst.loader.load(DOCUMENT_TYPE)).version,
    );
  });
});

describe("browser static package manager", () => {
  it("selects the latest version, and an exact one when asked", () => {
    const modules = modulesOf(browserModules);
    expect(resolveDocumentModelModule(modules, DOCUMENT_TYPE).version).toBe(2);
    expect(resolveDocumentModelModule(modules, DOCUMENT_TYPE, 1).version).toBe(
      1,
    );
    expect(() => resolveDocumentModelModule(modules, "test/absent")).toThrow();
  });
});

describe("Connect package lookup", () => {
  let registry: DocumentModelRegistry;
  let restoreWindow: () => void;

  beforeEach(() => {
    registry = new DocumentModelRegistry();
    restoreWindow = stubConnectWindow(registry);
  });

  afterEach(() => {
    restoreWindow();
  });

  function library(modules: DocumentModelModule[]): DocumentModelLib {
    return {
      documentModels: modules,
      editors: [],
      upgradeManifests: (browserModules.upgradeManifests ??
        []) as DocumentModelLib["upgradeManifests"],
    } as unknown as DocumentModelLib;
  }

  it("registers every version of a code-first package's models", () => {
    setVetraPackageManager(
      fakePackageManager([library(modulesOf(browserModules))]),
    );
    expect(registry.getSupportedVersions(DOCUMENT_TYPE)).toEqual([1, 2]);
  });

  it("keeps the first of two packages that ship the same version in one snapshot", () => {
    const modules = modulesOf(browserModules);
    // Distinct objects with the same type and versions, as when two packages
    // ship the same model.
    const shadow = modules.map((module) => ({ ...module }));
    expect(shadow[0]).not.toBe(modules[0]);
    setVetraPackageManager(
      fakePackageManager([library(modules), library(shadow)]),
    );
    expect(registry.getSupportedVersions(DOCUMENT_TYPE)).toEqual([1, 2]);
    // Within one snapshot the first package wins, because deduplication runs
    // before registration. Across snapshots the recovery path is last-wins,
    // which vetra-package-registry.node.test.ts covers.
    expect(registry.getModule(DOCUMENT_TYPE, 1)).toBe(
      modules.find((module) => module.version === 1),
    );
    expect(registry.getModule(DOCUMENT_TYPE, 2)).toBe(
      modules.find((module) => module.version === 2),
    );
  });
});
