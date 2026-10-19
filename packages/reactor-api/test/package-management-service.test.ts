import { DocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import type { IPackageManager } from "../src/packages/types.js";
import { PackageManagementService } from "../src/services/package-management.service.js";
import { InMemoryPackageStorage } from "../src/services/package-storage.js";

function makeInstalledPackage(name: string) {
  return {
    name,
    registryUrl: "https://registry.example.test",
    installedAt: new Date(),
    documentTypes: [],
  };
}

describe("PackageManagementService uninstall (issue #2973)", () => {
  it("removes the package from the package manager", async () => {
    const removePackage = vi.fn();
    const packageManager: IPackageManager = {
      onDocumentModelsChange: vi.fn(),
      removePackage,
    };
    const storage = new InMemoryPackageStorage();
    await storage.set("pkg-a", makeInstalledPackage("pkg-a"));

    const service = new PackageManagementService({ storage, packageManager });
    const ok = await service.uninstallPackage("pkg-a");

    expect(ok).toBe(true);
    expect(removePackage).toHaveBeenCalledWith("pkg-a");
    expect(await storage.get("pkg-a")).toBeUndefined();
  });

  it("still uninstalls when no package manager is configured", async () => {
    const storage = new InMemoryPackageStorage();
    await storage.set("pkg-a", makeInstalledPackage("pkg-a"));

    const service = new PackageManagementService({ storage });
    const ok = await service.uninstallPackage("pkg-a");

    expect(ok).toBe(true);
    expect(await storage.get("pkg-a")).toBeUndefined();
  });

  it("triggers the models-changed callback after uninstall", async () => {
    const storage = new InMemoryPackageStorage();
    await storage.set("pkg-a", makeInstalledPackage("pkg-a"));

    const service = new PackageManagementService({ storage });
    const modelsChanged = vi.fn();
    service.setOnModelsChanged(modelsChanged);

    await service.uninstallPackage("pkg-a");

    expect(modelsChanged).toHaveBeenCalledOnce();
    // The uninstalled package's modules are gone from the cache.
    expect(modelsChanged.mock.calls[0]![0]).toEqual([]);
  });

  it("unregisters the package's document models and upgrade manifests", async () => {
    const alpha = {
      documentModel: {
        global: { id: "test/alpha", name: "Alpha", specifications: [] },
      },
    } as unknown as DocumentModelModule;
    const registry = new DocumentModelRegistry();
    registry.registerModules(alpha);
    registry.registerUpgradeManifests({
      documentType: "test/alpha",
    } as unknown as UpgradeManifest<readonly number[]>);
    const storage = new InMemoryPackageStorage();
    await storage.set("pkg-a", {
      ...makeInstalledPackage("pkg-a"),
      documentTypes: ["test/alpha"],
    });
    const service = new PackageManagementService({
      storage,
      documentModelRegistry: registry,
    });

    await service.uninstallPackage("pkg-a");

    expect(
      registry.getAllModules().map((m) => m.documentModel.global.id),
    ).not.toContain("test/alpha");
    expect(() => registry.getUpgradeManifest("test/alpha")).toThrow();
  });
});
