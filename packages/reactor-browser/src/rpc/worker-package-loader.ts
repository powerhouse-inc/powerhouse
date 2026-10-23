import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { RegistryClient } from "../registry/client.js";
import type { WorkerPackageSource } from "@powerhousedao/reactor/rpc";
import { ModuleGraph, type ModuleGraphOptions } from "./module-graph.js";

export type PackageImporter = (url: string) => Promise<Record<string, unknown>>;

export type WorkerPackageLoaderOptions = {
  cdnUrl: string;
  importPackage: PackageImporter;
  resolvePackages?: (documentType: string) => Promise<string[]>;
  /** Absolute URLs for the shared deps a registry package leaves bare; a worker has no import map. */
  sharedImports?: Record<string, string>;
} & Pick<ModuleGraphOptions, "fetchSource" | "createModuleUrl" | "warn">;

export type PackageLoadFailure = {
  name: string;
  url: string;
  error: unknown;
};

/** One line for a failed load: the package, its URL and why. */
export function describeLoadFailure(failure: PackageLoadFailure): string {
  const reason =
    failure.error instanceof Error
      ? failure.error.message
      : String(failure.error);
  return `${failure.name} (${failure.url}): ${reason}`;
}

type SourceReplacement =
  | { status: "replaced"; types: Set<string> }
  | { status: "unchanged" }
  | { status: "stale" }
  | { status: "failed"; failure: PackageLoadFailure };

function summarize(results: SourceReplacement[]): {
  types: string[];
  failures: PackageLoadFailure[];
} {
  const types = new Set<string>();
  const failures: PackageLoadFailure[] = [];
  for (const result of results) {
    if (result.status === "replaced") {
      for (const type of result.types) types.add(type);
    } else if (result.status === "failed") {
      failures.push(result.failure);
    }
  }
  return { types: [...types], failures };
}

const SOURCE_KEY_PREFIX = "src:";

// Takes registry specs (`name`, `name@1.2.3`, `@scope/name@1.2.3`) or
// source keys (`src:<name>`, see sourceKey).
function packageName(key: string): string {
  if (key.startsWith(SOURCE_KEY_PREFIX)) {
    return key.slice(SOURCE_KEY_PREFIX.length);
  }
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

function moduleKey(module: DocumentModelModule): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

function isDocumentModelModule(value: unknown): value is DocumentModelModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as {
    reducer?: unknown;
    documentModel?: { global?: { id?: unknown } };
  };
  return (
    typeof candidate.reducer === "function" &&
    typeof candidate.documentModel?.global?.id === "string"
  );
}

type AnyUpgradeManifest = UpgradeManifest<readonly number[]>;

function isUpgradeManifest(value: unknown): value is AnyUpgradeManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { documentType?: unknown; upgrades?: unknown };
  return (
    typeof candidate.documentType === "string" &&
    typeof candidate.upgrades === "object" &&
    candidate.upgrades !== null
  );
}

// Models entries export manifests either as a named array export
// (`upgradeManifests`) or as individual manifest objects; take both.
function manifestsOf(namespace: Record<string, unknown>): AnyUpgradeManifest[] {
  const out: AnyUpgradeManifest[] = [];
  for (const value of Object.values(namespace)) {
    if (isUpgradeManifest(value)) {
      out.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const inner of value) {
        if (isUpgradeManifest(inner)) out.push(inner);
      }
    }
  }
  return out;
}

export class WorkerPackageLoader implements IDocumentModelLoader {
  private readonly cdnUrl: string;
  private readonly importPackage: PackageImporter;
  private readonly resolvePackages: (documentType: string) => Promise<string[]>;
  private readonly moduleGraph: ModuleGraph;
  // Keyed by `documentType@version`: a type can ship several module versions
  // side by side, and keying by type alone would evict all but the last.
  private readonly modulesByKey = new Map<string, DocumentModelModule>();
  // Keyed by documentType; the registry replaces manifests per type.
  private readonly manifestsByType = new Map<string, AnyUpgradeManifest>();
  // What each loaded source contributed, so a reload can remove it first.
  private readonly keysBySource = new Map<string, Set<string>>();
  private readonly manifestTypesBySource = new Map<string, Set<string>>();
  // The URL each key's current modules came from.
  private readonly loadedUrls = new Map<string, string>();
  private readonly failures: PackageLoadFailure[] = [];
  private readonly pendingLoads = new Map<string, Promise<SourceReplacement>>();
  private readonly generationBySource = new Map<string, number>();
  private generation = 0;

  constructor(options: WorkerPackageLoaderOptions) {
    this.cdnUrl = options.cdnUrl.replace(/\/$/, "");
    this.importPackage = options.importPackage;
    this.moduleGraph = new ModuleGraph({
      sharedImports: options.sharedImports,
      fetchSource: options.fetchSource,
      createModuleUrl: options.createModuleUrl,
      warn: options.warn,
    });
    const registryClient = new RegistryClient(options.cdnUrl);
    this.resolvePackages =
      options.resolvePackages ??
      ((documentType) =>
        registryClient.getPackagesByDocumentType(documentType));
  }

  async loadPackages(specs: string[]): Promise<DocumentModelModule[]> {
    await Promise.all(
      [...new Set(specs)].map((spec) => this.loadPackage(spec)),
    );
    return this.models;
  }

  /** Loads registry packages added or updated after boot; returns the types whose modules changed, and the failures. */
  async updatePackages(
    specs: string[],
  ): Promise<{ types: string[]; failures: PackageLoadFailure[] }> {
    const results = await Promise.all(
      [...new Set(specs)].map((spec) => this.loadPackage(spec)),
    );
    return summarize(results);
  }

  /** Loads URL-addressed packages (local project packages). Idempotent. */
  async loadSources(sources: WorkerPackageSource[]): Promise<void> {
    await Promise.all(
      sources.map((source) => this.loadFromUrl(sourceKey(source), source.url)),
    );
  }

  /**
   * Replaces previously loaded sources with freshly imported ones (a vetra
   * watch rebuild re-sends the same source under a cache-busted URL). Returns
   * every document type touched - removed, re-added, or new - so the caller
   * can replace the registry's version families. A source whose import fails
   * keeps its previous modules and is reported in `failures`; one superseded
   * by a newer reload of the same source contributes nothing.
   */
  async reloadSources(
    sources: WorkerPackageSource[],
  ): Promise<{ types: string[]; failures: PackageLoadFailure[] }> {
    const results = await Promise.all(
      sources.map((source) =>
        this.replaceSource(sourceKey(source), source.url),
      ),
    );
    return summarize(results);
  }

  // On a miss, discover the package(s) for the type and import them on demand.
  async load(documentType: string): Promise<DocumentModelModule> {
    const existing = this.latestForType(documentType);
    if (existing) {
      return existing;
    }
    const packageNames = await this.resolvePackages(documentType);
    const failuresBefore = this.failures.length;
    await Promise.all(
      [...new Set(packageNames)].map((name) => this.loadPackage(name)),
    );
    const loaded = this.latestForType(documentType);
    if (loaded) {
      return loaded;
    }
    throw this.notLoadedError(
      documentType,
      packageNames,
      this.failures.slice(failuresBefore),
    );
  }

  get models(): DocumentModelModule[] {
    return [...new Set(this.modulesByKey.values())];
  }

  get upgradeManifests(): AnyUpgradeManifest[] {
    return [...this.manifestsByType.values()];
  }

  get loadFailures(): PackageLoadFailure[] {
    return [...this.failures];
  }

  /** The highest registered version for a type, which is what a bare load resolves to. */
  private latestForType(documentType: string): DocumentModelModule | undefined {
    let latest: DocumentModelModule | undefined;
    for (const module of this.modulesByKey.values()) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      if (!latest || (module.version ?? 1) > (latest.version ?? 1)) {
        latest = module;
      }
    }
    return latest;
  }

  private notLoadedError(
    documentType: string,
    packageNames: string[],
    failures: PackageLoadFailure[],
  ): Error {
    if (packageNames.length === 0) {
      return new Error(`No package found for document model: ${documentType}`);
    }
    if (failures.length === 0) {
      return new Error(
        `Imported [${packageNames.join(", ")}] but document model not found: ${documentType}`,
      );
    }
    const cause =
      failures.length === 1
        ? failures[0].error
        : new AggregateError(failures.map((failure) => failure.error));
    return new Error(
      `Failed to import package(s) [${packageNames.join(", ")}] for document model: ${documentType}`,
      { cause },
    );
  }

  // Keyed by bare name: a bare spec takes whatever version is loaded, a pinned one replaces another.
  private loadPackage(spec: string): Promise<SourceReplacement> {
    const name = packageName(spec);
    const url = `${this.cdnUrl}/${spec}/browser/document-models/index.js`;
    const loaded = this.loadedUrls.get(name);
    if (loaded !== undefined && (spec === name || loaded === url)) {
      return Promise.resolve({ status: "unchanged" });
    }
    return this.loadFromUrl(name, url, loaded !== undefined);
  }

  // Concurrent loads of one URL share an import; a separate generation would
  // mark the earlier one stale and its caller would miss the module.
  private loadFromUrl(
    key: string,
    url: string,
    replace = false,
  ): Promise<SourceReplacement> {
    if (!replace && this.loadedUrls.has(key)) {
      return Promise.resolve({ status: "unchanged" });
    }
    const pendingKey = `${key} ${url}`;
    let pending = this.pendingLoads.get(pendingKey);
    if (!pending) {
      pending = this.replaceSource(key, url).finally(() =>
        this.pendingLoads.delete(pendingKey),
      );
      this.pendingLoads.set(pendingKey, pending);
    }
    return pending;
  }

  // Only the newest call per key commits, and a failed import leaves the
  // key's previous modules, manifests and loaded state untouched.
  private async replaceSource(
    key: string,
    url: string,
  ): Promise<SourceReplacement> {
    const generation = ++this.generation;
    this.generationBySource.set(key, generation);
    let namespace: Record<string, unknown>;
    try {
      namespace = await this.importNamespace(key, url);
    } catch (error) {
      if (this.generationBySource.get(key) !== generation) {
        return { status: "stale" };
      }
      const failure = { name: packageName(key), url, error };
      this.failures.push(failure);
      return { status: "failed", failure };
    }
    if (this.generationBySource.get(key) !== generation) {
      return { status: "stale" };
    }
    const types = new Set<string>();
    for (const removedKey of this.keysBySource.get(key) ?? []) {
      const removed = this.modulesByKey.get(removedKey);
      if (removed) types.add(removed.documentModel.global.id);
      this.modulesByKey.delete(removedKey);
    }
    for (const type of this.manifestTypesBySource.get(key) ?? []) {
      this.manifestsByType.delete(type);
    }
    for (const added of this.registerNamespace(key, namespace)) {
      types.add(added);
    }
    this.loadedUrls.set(key, url);
    return { status: "replaced", types };
  }

  // Sources are dev-server or prebuilt worker modules; registry packages leave shared deps bare.
  private async importNamespace(
    key: string,
    url: string,
  ): Promise<Record<string, unknown>> {
    if (key.startsWith(SOURCE_KEY_PREFIX)) {
      return this.importPackage(url);
    }
    return this.importPackage(await this.moduleGraph.resolve(url));
  }

  /** Registers a namespace as the key's whole contribution; returns its module types. */
  private registerNamespace(
    key: string,
    namespace: Record<string, unknown>,
  ): Set<string> {
    const keys = new Set<string>();
    const manifestTypes = new Set<string>();
    const types = new Set<string>();
    for (const value of Object.values(namespace)) {
      if (isDocumentModelModule(value)) {
        const k = moduleKey(value);
        this.modulesByKey.set(k, value);
        keys.add(k);
        types.add(value.documentModel.global.id);
      }
    }
    for (const manifest of manifestsOf(namespace)) {
      this.manifestsByType.set(manifest.documentType, manifest);
      manifestTypes.add(manifest.documentType);
    }
    this.keysBySource.set(key, keys);
    this.manifestTypesBySource.set(key, manifestTypes);
    return types;
  }
}

// Reloads replace by source NAME: a watch rebuild re-sends the same package
// under a new cache-busted URL, which must hit the same slot.
function sourceKey(source: WorkerPackageSource): string {
  return `${SOURCE_KEY_PREFIX}${source.name}`;
}
