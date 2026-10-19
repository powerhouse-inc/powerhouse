import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkerModelRegistrar,
  type WorkerModelRegistry,
} from "../src/reactor-worker-registry.js";

type Manifest = UpgradeManifest<readonly number[]>;

function model(id: string, version = 1): DocumentModelModule {
  return {
    reducer: () => undefined,
    version,
    documentModel: { global: { id } },
  } as unknown as DocumentModelModule;
}

function manifest(documentType: string): Manifest {
  return { documentType, upgrades: {} } as unknown as Manifest;
}

function typeOf(module: DocumentModelModule): string {
  return module.documentModel.global.id;
}

function fakeRegistry() {
  const state = {
    modules: [] as DocumentModelModule[],
    manifests: [] as Manifest[],
  };
  const registry: WorkerModelRegistry = {
    registerModules: (...modules) =>
      modules.map((item) => {
        const duplicate = state.modules.some(
          (m) =>
            typeOf(m) === typeOf(item) &&
            (m.version ?? 1) === (item.version ?? 1),
        );
        if (duplicate) {
          return {
            status: "error" as const,
            item,
            error: new Error("duplicate"),
          };
        }
        state.modules.push(item);
        return { status: "success" as const, item };
      }),
    unregisterModules: (...types) => {
      state.modules = state.modules.filter((m) => !types.includes(typeOf(m)));
      return true;
    },
    registerUpgradeManifests: (...manifests) =>
      manifests.map((item) => {
        if (state.manifests.some((m) => m.documentType === item.documentType)) {
          return {
            status: "error" as const,
            item,
            error: new Error("duplicate"),
          };
        }
        state.manifests.push(item);
        return { status: "success" as const, item };
      }),
    unregisterUpgradeManifests: (...types) => {
      state.manifests = state.manifests.filter(
        (m) => !types.includes(m.documentType),
      );
      return true;
    },
  };
  return { registry, state };
}

/** A registrar over a registry seeded the way the builder seeds it at boot. */
function booted(
  staticModels: DocumentModelModule[],
  loaderModels: DocumentModelModule[] = [],
) {
  const { registry, state } = fakeRegistry();
  const models = staticModels.concat(loaderModels);
  registry.registerModules(...models);
  const registrar = createWorkerModelRegistrar(registry, staticModels);
  registrar.markRegistered(models);
  return { registrar, registry, state };
}

describe("createWorkerModelRegistrar", () => {
  it("re-adds a static module when its family is replaced", () => {
    const bundled = model("test/t");
    const { registrar, state } = booted([bundled]);

    registrar.replaceFamilies(["test/t"], []);

    expect(state.modules).toEqual([bundled]);
    expect(state.modules[0]).toBe(bundled);
  });

  it("keeps the static module over a loader module with the same key", () => {
    const bundled = model("test/t");
    const loaded = model("test/t");
    const { registrar, state } = booted([bundled], [loaded]);

    registrar.replaceFamilies(["test/t"], [loaded]);

    expect(state.modules).toHaveLength(1);
    expect(state.modules[0]).toBe(bundled);
  });

  it("registers new loader versions beside static ones", () => {
    const bundled = model("test/t", 1);
    const loaded = model("test/t", 2);
    const { registrar, state } = booted([bundled]);

    registrar.replaceFamilies(["test/t"], [loaded]);

    expect(state.modules).toEqual([bundled, loaded]);
  });

  it("unregisters a manifest whose type vanished from the loader", () => {
    const { registrar, state } = booted([]);
    registrar.syncManifests([manifest("test/a"), manifest("test/b")]);

    registrar.syncManifests([manifest("test/a")]);

    expect(state.manifests.map((m) => m.documentType)).toEqual(["test/a"]);
  });

  it("replaces a manifest that is still present", () => {
    const { registrar, state } = booted([]);
    const next = manifest("test/a");
    registrar.syncManifests([manifest("test/a")]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    registrar.syncManifests([next]);

    expect(state.manifests).toEqual([next]);
    expect(state.manifests[0]).toBe(next);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
