import { DocumentModelRegistry } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  registryPackageSpec,
  subscribeRegistryPackageChanges,
  syncRegistryModels,
} from "../../src/utils/worker-registry-packages.js";

type RegistryPackage = { name: string; version: string | undefined };

function fakeManager(packages: RegistryPackage[]) {
  const handlers = new Set<() => void>();
  return {
    packages,
    getRegistryPackages() {
      return this.packages;
    },
    subscribe(handler: () => void) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    notify() {
      for (const handler of handlers) handler();
    },
  };
}

/** A copy of the drive model under another type and version, as a package would ship one. */
function model(type: string, version = 1): DocumentModelModule {
  return {
    ...driveDocumentModelModule,
    version,
    documentModel: {
      ...driveDocumentModelModule.documentModel,
      global: { ...driveDocumentModelModule.documentModel.global, id: type },
    },
  } as unknown as DocumentModelModule;
}

describe("registryPackageSpec", () => {
  it("pins the version when known", () => {
    expect(registryPackageSpec({ name: "@s/p", version: "1.2.3" })).toBe(
      "@s/p@1.2.3",
    );
    expect(registryPackageSpec({ name: "p", version: undefined })).toBe("p");
  });
});

describe("subscribeRegistryPackageChanges", () => {
  it("skips the packages present when it subscribed", () => {
    const manager = fakeManager([{ name: "boot", version: "1.0.0" }]);
    const onChange = vi.fn();
    subscribeRegistryPackageChanges(manager, onChange);

    manager.notify();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports a package added after boot, and each later version once", () => {
    const manager = fakeManager([{ name: "boot", version: "1.0.0" }]);
    const onChange = vi.fn();
    subscribeRegistryPackageChanges(manager, onChange);

    manager.packages = [
      ...manager.packages,
      { name: "late", version: "1.0.0" },
    ];
    manager.notify();
    manager.notify();
    manager.packages = [
      { name: "boot", version: "2.0.0" },
      { name: "late", version: "1.0.0" },
    ];
    manager.notify();

    expect(onChange.mock.calls).toEqual([[["late@1.0.0"]], [["boot@2.0.0"]]]);
  });
});

describe("syncRegistryModels", () => {
  it("registers only the models the registry lacks", () => {
    const registry = new DocumentModelRegistry();
    const boot = model("test/boot");
    registry.registerModules(boot);

    syncRegistryModels(registry, [boot, model("test/late")]);

    expect(
      registry.getAllModules().map((m) => m.documentModel.global.id),
    ).toEqual(["test/boot", "test/late"]);
    expect(registry.getModule("test/boot")).toBe(boot);
  });

  it("replaces every version of a type an update swapped", () => {
    const registry = new DocumentModelRegistry();
    registry.registerModules(model("test/a", 1), model("test/a", 2));
    const updatedV1 = model("test/a", 1);
    const updatedV2 = model("test/a", 2);

    syncRegistryModels(registry, [updatedV1, updatedV2]);

    expect(registry.getModule("test/a", 1)).toBe(updatedV1);
    expect(registry.getModule("test/a", 2)).toBe(updatedV2);
  });
});
