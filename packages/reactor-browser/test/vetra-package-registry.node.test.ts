import { DocumentModelRegistry } from "@powerhousedao/reactor";
import type { DocumentModelLib } from "document-model";
import { beforeEach, describe, expect, it } from "vitest";
import { setVetraPackageManager } from "../src/hooks/vetra-packages.js";
import type { IPackageManager, IPackagesListener } from "../src/types/vetra.js";

const DOC_TYPE = "test/upgrade-repro";

function fakeModule(version: number) {
  return {
    version,
    documentModel: { global: { id: DOC_TYPE } },
    reducer: () => undefined,
    actions: {},
    utils: {},
  } as unknown as DocumentModelLib["documentModels"][number];
}

function fakeManifest(latestVersion: number) {
  const upgrades: Record<string, unknown> = {};
  for (let v = 2; v <= latestVersion; v++) {
    upgrades[`v${v}`] = {
      toVersion: v,
      upgradeReducer: (document: unknown) => document,
      description: "",
    };
  }
  return {
    documentType: DOC_TYPE,
    latestVersion,
    supportedVersions: Array.from({ length: latestVersion }, (_, i) => i + 1),
    upgrades,
  } as unknown as NonNullable<DocumentModelLib["upgradeManifests"]>[number];
}

function fakePackage(
  modules: ReturnType<typeof fakeModule>[],
  manifests: ReturnType<typeof fakeManifest>[] = [],
): DocumentModelLib {
  return {
    documentModels: modules,
    editors: [],
    upgradeManifests: manifests,
  } as unknown as DocumentModelLib;
}

function fakePackageManager(initial: DocumentModelLib[]): IPackageManager & {
  emit: (packages: DocumentModelLib[]) => void;
} {
  const listeners = new Set<IPackagesListener>();
  const manager = {
    registryUrl: null,
    packages: initial,
    addPackage: () => {
      throw new Error("not implemented");
    },
    addPackages: () => [],
    removePackage: () => undefined,
    updateLocalPackage: () => undefined,
    subscribe: (handler: IPackagesListener) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    getPackageSource: () => null,
    getPackageVersion: () => undefined,
    getRegistryPackages: () => [],
    addLocalPackage: () => undefined,
    load: () => {
      throw new Error("not implemented");
    },
    emit(packages: DocumentModelLib[]) {
      manager.packages = packages;
      for (const listener of listeners) {
        listener({ packages });
      }
    },
  };
  return manager as unknown as IPackageManager & {
    emit: (packages: DocumentModelLib[]) => void;
  };
}

/**
 * Reproduces the Vetra studio "release v2" flow at the registry level.
 *
 * In `ph vetra --watch` (main-thread reactor, the default), the studio entry
 * hot-swaps the local package via updateLocalPackage on vite HMR — no page
 * reload. setVetraPackageManager's subscription then re-registers the
 * package's modules into the live reactor registry. When the regenerated
 * package contains [v1, v2] of a model whose v1 is already registered, the
 * duplicate-recovery in updateReactorClientDocumentModels unregisters ALL
 * versions of the duplicated type (unregisterModules is type-scoped) and
 * re-registers only the duplicates — silently dropping the new v2 module.
 *
 * The reactor registry then disagrees with the package manager: the UI
 * (useDocumentModelModules reads the package manager) offers the upgrade,
 * but reactorClient.upgradeDocument resolves the latest version from the
 * registry, sees v1, and silently no-ops. The upgrade-confirmation modal's
 * preview (registry.getLatestVersion) renders null for the same reason.
 */
describe("vetra package manager registry sync across a v2 release", () => {
  let registry: DocumentModelRegistry;

  beforeEach(() => {
    registry = new DocumentModelRegistry();
    (globalThis as { window?: unknown }).window = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
      ph: {
        reactorClientModule: {
          reactorModule: {
            documentModelRegistry: registry,
          },
        },
      },
    };
  });

  it("keeps the new v2 module when the local package regenerates with [v1, v2]", () => {
    // Boot: the project has only v1 (fresh model, first codegen).
    const packageManager = fakePackageManager([fakePackage([fakeModule(1)])]);
    setVetraPackageManager(packageManager);
    expect(registry.getSupportedVersions(DOC_TYPE)).toEqual([1]);

    // Release v2: codegen regenerates the package; vite HMR swaps it in
    // place. The regenerated barrel exports BOTH versions plus the upgrade
    // manifest (see test/versioned-documents/document-models).
    (
      packageManager as unknown as {
        emit: (packages: DocumentModelLib[]) => void;
      }
    ).emit([fakePackage([fakeModule(1), fakeModule(2)], [fakeManifest(2)])]);

    // The manifest is swapped in correctly...
    expect(registry.getUpgradeManifest(DOC_TYPE).latestVersion).toBe(2);
    // ...but the v2 module must also survive the re-registration. Today it
    // is dropped: registerModules succeeds for v2, then the duplicate
    // recovery for v1 unregisters the whole type and re-registers only v1.
    expect(registry.getSupportedVersions(DOC_TYPE)).toEqual([1, 2]);
    expect(registry.getLatestVersion(DOC_TYPE)).toBe(2);
  });

  it("keeps v2 across repeated regenerations (every HMR update drops it again)", () => {
    const packageManager = fakePackageManager([fakePackage([fakeModule(1)])]);
    setVetraPackageManager(packageManager);

    const emit = (
      packageManager as unknown as {
        emit: (packages: DocumentModelLib[]) => void;
      }
    ).emit.bind(packageManager);

    // The release flow regenerates more than once (release action, then the
    // pending schema edit); each update carries [v1, v2]. v2 can never
    // survive: any batch containing both a duplicate (v1) and a new version
    // (v2) of the same type purges the new version.
    emit([fakePackage([fakeModule(1), fakeModule(2)], [fakeManifest(2)])]);
    emit([fakePackage([fakeModule(1), fakeModule(2)], [fakeManifest(2)])]);

    expect(registry.getSupportedVersions(DOC_TYPE)).toEqual([1, 2]);
  });
});
