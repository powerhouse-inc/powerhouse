import type {
  DocumentModelSource,
  IDocumentModelLoader,
} from "@powerhousedao/reactor";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import { pathToFileURL } from "node:url";
import type { IPackageLoader, ProcessorFactoryBuilder } from "../types.js";
import { extractDocumentModels } from "./document-model-detection.js";
import { piecesFromCdnList } from "./pieces.js";
import {
  EXACT_VERSION,
  isValidPackageName,
  PACKAGE_ENTRIES,
  REGISTRY_ENTRY_ABSENT,
  RegistryPackageCache,
  type CachedRegistryPackage,
  type PackageEntryKind,
} from "./registry-cache.js";
import { extractSubgraphs } from "./subgraph-extraction.js";
import type { PackagePieceEntry } from "./types.js";
import { extractUpgradeManifests } from "./util.js";

export interface HttpPackageLoaderOptions {
  registryUrl: string;
  /** Where document-model graphs are cached; `<cwd>/.ph/registry-packages` by default. */
  cacheDir?: string;
}

export interface HttpPackageLoaderLogger {
  info: (msg: string) => void;
  error: (msg: string, err: unknown) => void;
}

// Where a package version's pieces are served; exact, so an entryUrl never floats.
export function piecesBaseUrl(
  registryUrl: string,
  packageName: string,
  version: string,
): string {
  const root = registryUrl.endsWith("/") ? registryUrl : `${registryUrl}/`;
  return `${root}-/cdn/${packageName}@${version}/node/pieces/`;
}

// Expected shape of the subgraphs bundle export
type SubgraphsExport = Record<string, SubgraphClass>;

/**
 * Extract subgraph classes from the imported subgraphs/index.mjs module shape.
 *
 * The published bundle uses `export * as Foo from "./file"`, which Node turns
 * into `{ Foo: <namespace>, … }`. The inner namespace's keys come from the
 * source file's named exports — typically `Subgraph` / `default` / the class
 * name itself — so the shape varies.
 *
 * Delegates to the unified acceptance rule every package loader shares
 * (`extractSubgraphs`), kept as an export because it is part of the package's
 * public API and is unit-tested directly against synthetic module shapes.
 */
export function extractSubgraphsFromModule(
  module: Record<string, SubgraphsExport>,
): SubgraphClass[] {
  return extractSubgraphs(module);
}

// Expected shape of the processors bundle export
type ProcessorsExport = {
  processorFactory?: ProcessorFactoryBuilder;
};

/**
 * Loads document models, subgraphs, and processors from an HTTP registry.
 * Uses Node.js module loader hooks to import directly from HTTP URLs.
 *
 * IMPORTANT: Requires https-hooks to be registered before use:
 *   import { register } from "node:module";
 *   register("@powerhousedao/reactor-api/https-hooks", import.meta.url);
 */
export class HttpPackageLoader implements IPackageLoader {
  private readonly registryUrl: string;
  private readonly logger = childLogger(["reactor-api", "http-loader"]);

  readonly name = "HttpPackageLoader";

  readonly documentModelLoader: HttpDocumentModelLoader;

  readonly cache: RegistryPackageCache;

  // Spec -> pinned version, so every part of a package loads the same one.
  private readonly versions = new Map<string, Promise<string | undefined>>();

  constructor(options: HttpPackageLoaderOptions) {
    this.registryUrl = options.registryUrl.endsWith("/")
      ? options.registryUrl
      : `${options.registryUrl}/`;
    this.cache = new RegistryPackageCache({
      registryUrl: this.registryUrl,
      cacheDir: options.cacheDir,
    });
    this.documentModelLoader = new HttpDocumentModelLoader(this);
  }

  /**
   * Load document models from a package in the HTTP registry.
   * Imports directly from HTTP URL using Node.js loader hooks.
   */
  /**
   * Parse a package specifier like "@scope/pkg@tag" into name and optional tag.
   */
  private parsePackageSpec(spec: string): {
    name: string;
    tag: string | undefined;
  } {
    if (spec.startsWith("@")) {
      const lastAt = spec.lastIndexOf("@");
      if (lastAt > 0 && lastAt !== spec.indexOf("@")) {
        return { name: spec.slice(0, lastAt), tag: spec.slice(lastAt + 1) };
      }
      return { name: spec, tag: undefined };
    }
    const atIndex = spec.indexOf("@");
    if (atIndex > 0) {
      return { name: spec.slice(0, atIndex), tag: spec.slice(atIndex + 1) };
    }
    return { name: spec, tag: undefined };
  }

  // Exact version of `packageSpec`, looked up once per process so every part
  // of a package loads from the same one.
  resolveVersion(packageSpec: string): Promise<string | undefined> {
    const known = this.versions.get(packageSpec);
    if (known) return known;
    const lookup = this.lookUpVersion(packageSpec).then((version) => {
      // A failed lookup is retried next time rather than remembered.
      if (!version) this.versions.delete(packageSpec);
      return version;
    });
    this.versions.set(packageSpec, lookup);
    return lookup;
  }

  private async lookUpVersion(
    packageSpec: string,
  ): Promise<string | undefined> {
    const { name, tag } = this.parsePackageSpec(packageSpec);
    if (tag && EXACT_VERSION.test(tag)) return tag;
    const version = await this.packageVersion(packageSpec);
    if (version) return version;
    // Registry unreachable or silent: a single cached version is unambiguous.
    const cached = await this.cache.cachedVersions(name);
    if (cached.length === 1) {
      this.logger.warn(
        "Could not resolve a version for @package; using cached @version",
        packageSpec,
        cached[0],
      );
      return cached[0];
    }
    return undefined;
  }

  /** Caches the pinned version of `packageSpec` on disk. */
  async cachePackage(packageSpec: string): Promise<CachedRegistryPackage> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    if (!isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    const version = await this.resolveVersion(packageSpec);
    if (!version) {
      throw new Error(`No exact version found for ${packageSpec}`);
    }
    const cached = await this.cache.ensurePackage(packageName, version);
    this.logger.verbose(
      `Package ${packageName}@${version} at ${cached.dir} (${cached.source})`,
    );
    return cached;
  }

  /** One entry module of the package, plus the cached file it came from. */
  async importEntry(
    packageSpec: string,
    kind: PackageEntryKind,
  ): Promise<{ module: Record<string, unknown>; filePath?: string }> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    if (!isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    // No version means the registry does not serve it; the import below says so.
    const version = await this.resolveVersion(packageSpec);
    let cached: CachedRegistryPackage | undefined;
    if (version) {
      try {
        cached = await this.cache.ensurePackage(packageName, version);
      } catch (error) {
        // Host-only fallback: the CDN import still works without workers.
        this.logger.warn(
          "Could not cache @package, importing it over HTTP: @error",
          packageSpec,
          error,
        );
      }
    }
    if (cached) {
      const filePath = cached.entries[kind];
      if (!filePath) {
        throw Object.assign(
          new Error(`${packageName}@${cached.version} serves no ${kind}`),
          { code: REGISTRY_ENTRY_ABSENT },
        );
      }
      const module = (await import(
        /* @vite-ignore */ pathToFileURL(filePath).href
      )) as Record<string, unknown>;
      return { module, filePath };
    }
    const pinned = version ? `${packageName}@${version}` : packageSpec;
    const url = `${this.registryUrl}-/cdn/${pinned}/${PACKAGE_ENTRIES[kind]}`;
    this.logger.verbose(`Importing ${kind} from: ${url}`);
    const module = (await import(/* @vite-ignore */ url)) as Record<
      string,
      unknown
    >;
    return { module };
  }

  importDocumentModels(
    packageSpec: string,
  ): Promise<{ module: Record<string, unknown>; filePath?: string }> {
    return this.importEntry(packageSpec, "documentModels");
  }

  async loadDocumentModels(
    packageSpec: string,
  ): Promise<DocumentModelModule[]> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    const { module } = await this.importDocumentModels(packageSpec);
    const models = extractDocumentModels(module);

    this.logger.verbose(
      `Loaded ${models.length} document models from ${packageName}`,
    );
    return models;
  }

  async loadUpgradeManifests(
    packageSpec: string,
  ): Promise<UpgradeManifest<readonly number[]>[]> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    const { module } = await this.importDocumentModels(packageSpec);

    const manifests = extractUpgradeManifests(module);
    if (manifests.length > 0) {
      this.logger.verbose(
        `Loaded ${manifests.length} upgrade manifests from ${packageName}`,
      );
    }
    return manifests;
  }

  async loadSubgraphs(packageSpec: string): Promise<SubgraphClass[]> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    const { module } = await this.importEntry(packageSpec, "subgraphs");
    const subgraphs = extractSubgraphsFromModule(
      module as Record<string, SubgraphsExport>,
    );

    this.logger.verbose(
      `Loaded ${subgraphs.length} subgraphs from ${packageName}`,
    );
    return subgraphs;
  }

  async loadProcessors(
    packageSpec: string,
  ): Promise<ProcessorFactoryBuilder | null> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    const { module } = await this.importEntry(packageSpec, "processors");

    const factory = (module as ProcessorsExport).processorFactory;
    if (factory && typeof factory === "function") {
      this.logger.verbose(`Loaded processor factory from ${packageName}`);
      return factory;
    }

    this.logger.verbose(`No processor factory found in ${packageName}`);
    return null;
  }

  // The same list module every other loader reads, on the CDN path its three
  // siblings already come from. Metadata only: no piece code is fetched here.

  // The declared entry is relative to the package root while the CDN serves
  // beneath `dist/`, so this is the only place that can make it absolute.
  async loadPieces(packageSpec: string): Promise<PackagePieceEntry[]> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    if (!isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    // Pinned before anything is read: a tag or an unversioned spec would let
    // every entryUrl float to whatever the registry serves next.
    const version = await this.resolveVersion(packageSpec);
    if (!version) {
      this.logger.verbose(`No package version found for: ${packageSpec}`);
      return [];
    }
    const base = piecesBaseUrl(this.registryUrl, packageName, version);
    this.logger.verbose(`Importing pieces from: ${base}index.mjs`);
    let module: unknown;
    try {
      module = await import(`${base}index.mjs`);
    } catch (error) {
      // A package shipping none has no list to serve, which is the common
      // case rather than a fault.
      this.logger.verbose(
        "No pieces found for @package: @error",
        packageName,
        error,
      );
      return [];
    }
    const pieces = piecesFromCdnList(
      module,
      base,
      packageName,
      this.logger,
      version,
    );
    this.logger.verbose(`Loaded ${pieces.length} pieces from ${packageName}`);
    return pieces;
  }

  /**
   * Load document models from multiple packages.
   * Continues loading even if some packages fail.
   */
  async loadPackages(
    packageNames: string[],
    logger?: HttpPackageLoaderLogger,
  ): Promise<DocumentModelModule[]> {
    const allModels: DocumentModelModule[] = [];

    for (const pkgName of packageNames) {
      const trimmedName = pkgName.trim();
      if (!trimmedName) continue;

      try {
        const models = await this.loadDocumentModels(trimmedName);
        allModels.push(...models);
        const logMsg = `Loaded ${models.length} document models from ${trimmedName}`;
        logger?.info(logMsg);
        this.logger.info(logMsg);
      } catch (error) {
        // A caller's logger may not read @placeholders
        logger?.error(`Failed to load package ${trimmedName}`, error);
        this.logger.error(
          "Failed to load package @package: @error",
          trimmedName,
          error,
        );
        // Continue with other packages - don't fail startup
      }
    }

    return allModels;
  }

  // The exact version a spec resolves to, read off the package.json the CDN serves.
  async packageVersion(packageSpec: string): Promise<string | undefined> {
    try {
      const response = await fetch(
        `${this.registryUrl}-/cdn/${packageSpec}/package.json`,
      );
      if (!response.ok) return undefined;
      const pkg = (await response.json()) as { version?: unknown };
      return typeof pkg.version === "string" && EXACT_VERSION.test(pkg.version)
        ? pkg.version
        : undefined;
    } catch (error) {
      this.logger.verbose(
        "Could not read the version of @package: @error",
        packageSpec,
        error,
      );
      return undefined;
    }
  }
}

// Returns the cached `{ filePath }` source so workers can import the model;
// falls back to a host-only live module when the package could not be cached.
export class HttpDocumentModelLoader implements IDocumentModelLoader {
  private readonly loader: HttpPackageLoader;
  private readonly logger = childLogger([
    "reactor-api",
    "http-document-model-loader",
  ]);

  // Cache: documentType -> packageName
  private readonly documentTypeCache = new Map<string, string>();

  // Cache: packageName -> DocumentModelModule[]
  private readonly packageModulesCache = new Map<
    string,
    DocumentModelModule[]
  >();

  // Cache: packageName -> cached entry file, when the package was cached
  private readonly packageFileCache = new Map<string, string>();

  private onModelLoaded?: (model: DocumentModelModule) => void;

  constructor(loader: HttpPackageLoader) {
    this.loader = loader;
  }

  setOnModelLoaded(callback: (model: DocumentModelModule) => void): void {
    this.onModelLoaded = callback;
  }

  clearCache(): void {
    this.documentTypeCache.clear();
    this.packageModulesCache.clear();
    this.packageFileCache.clear();
  }

  async load(documentType: string): Promise<DocumentModelSource> {
    const packageName = await this.findPackageByDocumentType(documentType);

    let models = this.packageModulesCache.get(packageName);
    if (!models) {
      const { module, filePath } =
        await this.loader.importDocumentModels(packageName);
      models = extractDocumentModels(module);
      this.packageModulesCache.set(packageName, models);
      if (filePath) this.packageFileCache.set(packageName, filePath);
    }

    const model = models.find(
      (m) => m.documentModel.global.id === documentType,
    );

    if (!model) {
      const availableTypes = models.map((m) => m.documentModel.global.id);
      throw new Error(
        `Document model ${documentType} not found in package ${packageName}. ` +
          `Available types: ${availableTypes.join(", ")}`,
      );
    }

    this.logger.info(
      `Loaded document model "${documentType}" from package "${packageName}"`,
    );

    if (this.onModelLoaded) {
      this.onModelLoaded(model);
    }

    // The whole file, so every version of the type registers together.
    const filePath = this.packageFileCache.get(packageName);
    return filePath ? { filePath } : model;
  }

  private async findPackageByDocumentType(
    documentType: string,
  ): Promise<string> {
    const cached = this.documentTypeCache.get(documentType);
    if (cached) {
      return cached;
    }

    const encodedType = encodeURIComponent(documentType);
    const url = `${this.loader["registryUrl"]}packages/by-document-type?type=${encodedType}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Registry query failed for document type ${documentType}: ${response.status} ${response.statusText}`,
      );
    }

    const packageNames = (await response.json()) as string[];

    if (packageNames.length === 0) {
      throw new Error(
        `No package found containing document type: ${documentType}`,
      );
    }

    const packageName = packageNames.sort((a, b) => a.localeCompare(b))[0];
    this.documentTypeCache.set(documentType, packageName);

    return packageName;
  }

  getLoadedPackages(): string[] {
    return Array.from(this.packageModulesCache.keys());
  }

  getPackageModules(packageName: string): DocumentModelModule[] | undefined {
    return this.packageModulesCache.get(packageName);
  }

  removeFromCache(packageName: string): void {
    this.packageModulesCache.delete(packageName);
    this.packageFileCache.delete(packageName);
    for (const [docType, pkg] of this.documentTypeCache) {
      if (pkg === packageName) {
        this.documentTypeCache.delete(docType);
      }
    }
  }
}
