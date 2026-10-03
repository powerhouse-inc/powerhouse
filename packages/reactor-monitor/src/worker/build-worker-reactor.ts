import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import {
  WorkerPackageLoader,
  type PackageImporter,
  type WorkerPackageSource,
} from "@powerhousedao/reactor-browser/rpc";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { buildMonitorReactor, type BuiltReactor } from "../build-reactor.js";
import {
  parseWorkerConstruct,
  type MonitorWorkerConstruct,
} from "./construct.js";

/**
 * How the worker imports package code. Injected so the realm-specific
 * dynamic `import()` (which needs a bundler escape hatch) stays in the worker
 * entry and `buildWorkerReactor` stays testable without a bundler or network.
 */
export type WorkerPackageImporters = {
  importPackage: PackageImporter;
  /** Imports a rewritten source string (blob URL); omit to disable it. */
  importSource?: (source: string) => Promise<Record<string, unknown>>;
};

/** A reactor built inside the worker, plus its registry bookkeeping. */
export type BuiltWorkerReactor = BuiltReactor & {
  construct: MonitorWorkerConstruct;
  loader: WorkerPackageLoader | undefined;
  /**
   * Loads packages into the live registry after boot. A source already
   * loaded is REPLACED, which is what a watch rebuild sends.
   */
  registerPackages: (
    specs: string[],
    sources?: WorkerPackageSource[],
  ) => Promise<void>;
};

function modelKey(module: DocumentModelModule): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

/**
 * Builds the worker's reactor from the construct the tab sent.
 *
 * Mirrors `apps/connect/src/reactor.worker.ts`'s `build` hook minus
 * everything Connect-specific: no Renown crypto or signer, no PGlite major
 * resolution or IndexedDB migration, no vetra/workflow flag-gated model
 * chunks, no relational store, no `/__packages` subscription. Models come from
 * the construct's packages on top of `baseDocumentModels`.
 *
 * Takes `unknown` because that is what `ReactorHost`'s `build` hook is handed:
 * the construct crossed a realm boundary and is validated here.
 */
export async function buildWorkerReactor(
  raw: unknown,
  importers?: WorkerPackageImporters,
): Promise<BuiltWorkerReactor> {
  const construct = parseWorkerConstruct(raw);

  const wantsPackages =
    (construct.packageSpecs?.length ?? 0) > 0 ||
    (construct.packageSources?.length ?? 0) > 0;
  let loader: WorkerPackageLoader | undefined;
  if (wantsPackages) {
    if (!importers) {
      throw new Error(
        "Worker construct asks for packages but no importers were provided to buildWorkerReactor()",
      );
    }
    loader = new WorkerPackageLoader({
      cdnUrl: construct.cdnUrl ?? "",
      importPackage: importers.importPackage,
      ...(importers.importSource
        ? { importSource: importers.importSource }
        : {}),
    });
    await loader.loadPackages(construct.packageSpecs ?? []);
    await loader.loadSources(construct.packageSources ?? []);
  }

  const models = loader
    ? baseDocumentModels.concat(loader.models)
    : baseDocumentModels;

  const built = await buildMonitorReactor({
    namespace: construct.namespace,
    storage: construct.storage,
    documentModelModules: models,
    featureFlags: construct.featureFlags,
    channelScheme: construct.channelScheme,
    ...(loader ? { documentModelLoader: loader } : {}),
  });

  const registry: IDocumentModelRegistry | undefined =
    built.module.reactorModule?.documentModelRegistry;
  const registeredKeys = new Set(models.map(modelKey));

  // Models entries ship upgrade manifests beside their modules; the builder
  // only saw the modules, so register them per type (replacing, so a watch
  // rebuild's manifest wins over the boot-time one).
  const registerLoaderManifests = (): void => {
    if (!loader || !registry) {
      return;
    }
    const manifests = loader.upgradeManifests;
    if (manifests.length === 0) {
      return;
    }
    registry.unregisterUpgradeManifests(
      ...manifests.map((manifest) => manifest.documentType),
    );
    for (const result of registry.registerUpgradeManifests(...manifests)) {
      if (result.status === "error") {
        console.error(
          "[reactor-monitor.worker] failed to register upgrade manifest:",
          result.error,
        );
      }
    }
  };
  registerLoaderManifests();

  const registerPackages = async (
    specs: string[],
    sources?: WorkerPackageSource[],
  ): Promise<void> => {
    if (!loader || !registry) {
      return;
    }
    await loader.loadPackages(specs);
    if (sources && sources.length > 0) {
      // A reloaded source replaced modules under the same (type, version)
      // keys, so the delta registration below would skip them: drop the whole
      // version family first and let it re-add the loader's fresh modules.
      const { types } = await loader.reloadSources(sources);
      if (types.length > 0) {
        registry.unregisterModules(...types);
        const typeSet = new Set(types);
        for (const key of [...registeredKeys]) {
          if (typeSet.has(key.slice(0, key.lastIndexOf("@")))) {
            registeredKeys.delete(key);
          }
        }
      }
    }
    // Register only the delta; the registry rejects duplicate (type, version).
    const fresh = loader.models.filter((m) => !registeredKeys.has(modelKey(m)));
    if (fresh.length > 0) {
      registry.registerModules(...fresh);
      for (const m of fresh) {
        registeredKeys.add(modelKey(m));
      }
    }
    registerLoaderManifests();
  };

  return { ...built, construct, loader, registerPackages };
}
