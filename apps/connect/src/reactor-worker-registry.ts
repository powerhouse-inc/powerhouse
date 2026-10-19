import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";

export type WorkerModelRegistry = Pick<
  IDocumentModelRegistry,
  | "registerModules"
  | "unregisterModules"
  | "registerUpgradeManifests"
  | "unregisterUpgradeManifests"
>;

export type WorkerModelRegistrar = {
  markRegistered(models: DocumentModelModule[]): void;
  registerNew(loaderModels: DocumentModelModule[]): void;
  replaceFamilies(types: string[], loaderModels: DocumentModelModule[]): void;
  syncManifests(loaderManifests: UpgradeManifest<readonly number[]>[]): void;
};

function modelKey(module: DocumentModelModule): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

function typeOfKey(key: string): string {
  return key.slice(0, key.lastIndexOf("@"));
}

// Static models win a duplicate key, as in the builder at boot.
export function createWorkerModelRegistrar(
  registry: WorkerModelRegistry,
  staticModels: DocumentModelModule[],
): WorkerModelRegistrar {
  const registeredKeys = new Set<string>();
  // Only the loader's: the builder is never given manifests.
  let manifestTypes = new Set<string>();

  function markRegistered(models: DocumentModelModule[]): void {
    for (const model of models) {
      registeredKeys.add(modelKey(model));
    }
  }

  // The registry rejects duplicate (type, version) pairs; register the delta.
  function registerNew(loaderModels: DocumentModelModule[]): void {
    const fresh: DocumentModelModule[] = [];
    for (const model of [...staticModels, ...loaderModels]) {
      const key = modelKey(model);
      if (registeredKeys.has(key)) continue;
      registeredKeys.add(key);
      fresh.push(model);
    }
    if (fresh.length > 0) {
      registry.registerModules(...fresh);
    }
  }

  // Reloads reuse keys, so drop whole families and re-add static ones too.
  function replaceFamilies(
    types: string[],
    loaderModels: DocumentModelModule[],
  ): void {
    if (types.length > 0) {
      registry.unregisterModules(...types);
      const typeSet = new Set(types);
      for (const key of [...registeredKeys]) {
        if (typeSet.has(typeOfKey(key))) {
          registeredKeys.delete(key);
        }
      }
    }
    registerNew(loaderModels);
  }

  function syncManifests(
    loaderManifests: UpgradeManifest<readonly number[]>[],
  ): void {
    const current = new Set(loaderManifests.map((m) => m.documentType));
    const toUnregister = new Set([...manifestTypes, ...current]);
    if (toUnregister.size > 0) {
      registry.unregisterUpgradeManifests(...toUnregister);
    }
    manifestTypes = current;
    if (loaderManifests.length === 0) {
      return;
    }
    for (const result of registry.registerUpgradeManifests(
      ...loaderManifests,
    )) {
      if (result.status === "error") {
        console.error(
          "[reactor.worker] failed to register upgrade manifest:",
          result.error,
        );
      }
    }
  }

  return { markRegistered, registerNew, replaceFamilies, syncManifests };
}
