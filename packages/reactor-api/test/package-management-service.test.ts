import { DocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { unwatchFile } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackageManager } from "../src/packages/package-manager.js";
import type {
  IPackageManager,
  ISubscribablePackageLoader,
} from "../src/packages/types.js";
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
      hasPackage: vi.fn(() => false),
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

describe("PackageManagementService uninstall of a package the manager loaded", () => {
  let dir = "";
  let configFile = "";

  afterEach(async () => {
    if (configFile) unwatchFile(configFile);
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = configFile = "";
  });

  const writeConfig = (packages: string[]) =>
    writeFile(
      configFile,
      JSON.stringify({
        packages: packages.map((packageName) => ({ packageName })),
      }),
    );

  async function setup(options: { packages?: string[]; configFile?: string }) {
    const model = (pkg: string) =>
      ({
        documentModel: {
          global: { id: `test/${pkg}`, name: pkg, specifications: [] },
        },
      }) as unknown as DocumentModelModule;
    const loader: ISubscribablePackageLoader = {
      name: "fake-loader",
      loadDocumentModels: (pkg) => Promise.resolve([model(pkg)]),
      loadSubgraphs: () => Promise.resolve([]),
      loadProcessors: () => Promise.resolve(null),
      loadPieces: () => Promise.resolve([]),
    };
    const packageManager = new PackageManager([loader], options);
    await packageManager.init();
    const service = new PackageManagementService({ packageManager });
    const reloadConfig = () => {
      const internal = packageManager as unknown as {
        getAllPackageNames(): string[];
        loadPackages(packages: string[]): Promise<unknown>;
      };
      return internal.loadPackages(internal.getAllPackageNames());
    };
    return { packageManager, service, reloadConfig };
  }

  it("uninstalls a package loaded at boot", async () => {
    const { packageManager, service } = await setup({ packages: ["pkg-a"] });

    expect(await service.uninstallPackage("pkg-a")).toBe(true);

    expect(packageManager.hasPackage("pkg-a")).toBe(false);
    expect(packageManager.getDocumentModels().has("pkg-a")).toBe(false);
  });

  it("answers not installed when no source has the package", async () => {
    const { service } = await setup({ packages: ["pkg-a"] });

    expect(await service.uninstallPackage("pkg-x")).toBe(false);
  });

  it("keeps a config package out of reloads until the config drops it", async () => {
    dir = await mkdtemp(join(tmpdir(), "package-uninstall-"));
    configFile = join(dir, "powerhouse.config.json");
    await writeConfig(["pkg-b"]);
    const { packageManager, service, reloadConfig } = await setup({
      configFile,
    });
    // Reloads run by hand, not by the poller racing them.
    unwatchFile(configFile);

    expect(await service.uninstallPackage("pkg-b")).toBe(true);
    await reloadConfig();
    expect(packageManager.hasPackage("pkg-b")).toBe(false);

    await writeConfig([]);
    await reloadConfig();
    await writeConfig(["pkg-b"]);
    await reloadConfig();
    expect(packageManager.hasPackage("pkg-b")).toBe(true);
  });
});
