import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { rewritePackageSource } from "@powerhousedao/shared/connect";
import { RegistryClient } from "../registry/client.js";
import type { WorkerPackageSource } from "./protocol.js";

export type PackageImporter = (url: string) => Promise<Record<string, unknown>>;

export type WorkerPackageLoaderOptions = {
  cdnUrl: string;
  importPackage: PackageImporter;
  resolvePackages?: (documentType: string) => Promise<string[]>;
  /** Absolute-URL import map for shared deps (worker import maps don't
   *  exist, so the source is rewritten to these URLs and blob-imported). */
  sharedImports?: Record<string, string>;
  /** Import a rewritten source string (blob URL). Only called when a
   *  rewrite happened; omit to disable shared-deps loading in a worker. */
  importSource?: (source: string) => Promise<Record<string, unknown>>;
};

export type PackageLoadFailure = {
  name: string;
  url: string;
  error: unknown;
};

function packageName(spec: string): string {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
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
  private readonly sharedImports?: Record<string, string>;
  private readonly importSource?: (
    source: string,
  ) => Promise<Record<string, unknown>>;
  // Keyed by `documentType@version`: a type can ship several module versions
  // side by side, and keying by type alone would evict all but the last.
  private readonly modulesByKey = new Map<string, DocumentModelModule>();
  // Keyed by documentType; the registry replaces manifests per type.
  private readonly manifestsByType = new Map<string, AnyUpgradeManifest>();
  // What each loaded source contributed, so a reload can remove it first.
  private readonly keysBySource = new Map<string, Set<string>>();
  private readonly manifestTypesBySource = new Map<string, Set<string>>();
  private readonly loadedSpecs = new Set<string>();
  private readonly failures: PackageLoadFailure[] = [];

  constructor(options: WorkerPackageLoaderOptions) {
    this.cdnUrl = options.cdnUrl.replace(/\/$/, "");
    this.importPackage = options.importPackage;
    this.sharedImports = options.sharedImports;
    this.importSource = options.importSource;
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
   * can replace the registry's version families, mirroring the tab hook's
   * duplicate handling.
   */
  async reloadSources(
    sources: WorkerPackageSource[],
  ): Promise<{ types: string[] }> {
    const touched = new Set<string>();
    for (const source of sources) {
      const key = sourceKey(source);
      for (const moduleKeyRemoved of this.keysBySource.get(key) ?? []) {
        const removed = this.modulesByKey.get(moduleKeyRemoved);
        if (removed) touched.add(removed.documentModel.global.id);
        this.modulesByKey.delete(moduleKeyRemoved);
      }
      for (const type of this.manifestTypesBySource.get(key) ?? []) {
        this.manifestsByType.delete(type);
      }
      this.keysBySource.delete(key);
      this.manifestTypesBySource.delete(key);
      this.loadedSpecs.delete(key);

      await this.loadFromUrl(key, source.url);
      for (const moduleKeyAdded of this.keysBySource.get(key) ?? []) {
        const added = this.modulesByKey.get(moduleKeyAdded);
        if (added) touched.add(added.documentModel.global.id);
      }
    }
    return { types: [...touched] };
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

  private async loadPackage(spec: string): Promise<void> {
    const name = packageName(spec);
    const url = `${this.cdnUrl}/${name}/browser/document-models/index.js`;
    await this.loadFromUrl(spec, url);
  }

  private async loadFromUrl(key: string, url: string): Promise<void> {
    if (this.loadedSpecs.has(key)) {
      return;
    }
    try {
      // Shared-deps hosts fetch the source so shared specifiers can be
      // rewritten to absolute vendor URLs (import maps don't apply to blob
      // imports). Packages without shared/relative imports still go through
      // the plain importPackage path below.
      const hasSharedImports =
        this.sharedImports !== undefined &&
        Object.keys(this.sharedImports).length > 0;
      const source = hasSharedImports
        ? await (await fetch(url)).text()
        : undefined;
      const rewritten =
        source !== undefined
          ? rewritePackageSource(source, url, this.sharedImports!)
          : source;
      let namespace: Record<string, unknown>;
      if (rewritten !== undefined && rewritten !== source) {
        if (!this.importSource) {
          throw new Error(
            "importSource is required to load a package that imports shared deps",
          );
        }
        namespace = await this.importSource(rewritten);
      } else {
        namespace = await this.importPackage(url);
      }
      this.registerNamespace(key, namespace);
      this.loadedSpecs.add(key);
    } catch (error) {
      this.failures.push({ name: packageName(key), url, error });
    }
  }

  private registerNamespace(
    key: string,
    namespace: Record<string, unknown>,
  ): void {
    const keys = this.keysBySource.get(key) ?? new Set<string>();
    const manifestTypes =
      this.manifestTypesBySource.get(key) ?? new Set<string>();
    for (const value of Object.values(namespace)) {
      if (isDocumentModelModule(value)) {
        const k = moduleKey(value);
        this.modulesByKey.set(k, value);
        keys.add(k);
      }
    }
    for (const manifest of manifestsOf(namespace)) {
      this.manifestsByType.set(manifest.documentType, manifest);
      manifestTypes.add(manifest.documentType);
    }
    this.keysBySource.set(key, keys);
    this.manifestTypesBySource.set(key, manifestTypes);
  }
}

// Reloads replace by source NAME: a watch rebuild re-sends the same package
// under a new cache-busted URL, which must hit the same slot.
function sourceKey(source: WorkerPackageSource): string {
  return `src:${source.name}`;
}
