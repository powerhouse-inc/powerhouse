import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { parsePackageSpec } from "@powerhousedao/shared/registry/package-spec";
import { childLogger } from "document-model";
import type { IPackageLoader, ProcessorFactoryBuilder } from "../types.js";
import { extractUpgradeManifests } from "./util.js";

export interface HttpPackageLoaderOptions {
  registryUrl: string;
  /** Injectable for deterministic tests; defaults to native dynamic import. */
  importPackage?: (url: string) => Promise<Record<string, unknown>>;
}

export interface HttpPackageLoaderLogger {
  info: (msg: string) => void;
  error: (msg: string, err: unknown) => void;
}

// Expected shape of the document-models bundle export
type DocumentModelsExport = Record<string, unknown>;

// Expected shape of the subgraphs bundle export
type SubgraphsExport = Record<string, SubgraphClass>;

/**
 * Extract subgraph classes from the imported subgraphs/index.mjs module shape.
 *
 * The published bundle uses `export * as Foo from "./file"`, which Node turns
 * into `{ Foo: <namespace>, … }`. The inner namespace's keys come from the
 * source file's named exports — typically `Subgraph` / `default` / the class
 * name itself — so the shape varies. Flatten one level and keep callables.
 *
 * Exported for direct unit testing against synthetic module shapes.
 */
export function extractSubgraphsFromModule(
  module: Record<string, SubgraphsExport>,
): SubgraphClass[] {
  return Object.values(module)
    .flatMap((namespace) => Object.values(namespace))
    .filter((s): s is SubgraphClass => typeof s === "function");
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
  private readonly importPackage: (
    url: string,
  ) => Promise<Record<string, unknown>>;
  private readonly logger = childLogger(["reactor-api", "http-loader"]);

  readonly name = "HttpPackageLoader";

  readonly documentModelLoader: HttpDocumentModelLoader;

  constructor(options: HttpPackageLoaderOptions) {
    this.registryUrl = options.registryUrl.endsWith("/")
      ? options.registryUrl
      : `${options.registryUrl}/`;
    this.importPackage =
      options.importPackage ??
      ((url) => import(url) as Promise<Record<string, unknown>>);
    this.documentModelLoader = new HttpDocumentModelLoader(this);
  }

  private getDocumentModelsUrl(
    packageSpec: string,
    entry = "index.mjs",
  ): string {
    return `${this.registryUrl}-/cdn/${packageSpec}/node/document-models/${entry}`;
  }

  validatePackageSpec(packageSpec: string): {
    name: string;
    cdnSpecifier: string;
  } {
    return parsePackageSpec(packageSpec);
  }

  /** Load document models directly through the registered HTTP import hook. */
  async loadDocumentModels(
    packageSpec: string,
  ): Promise<DocumentModelModule[]> {
    const { name: packageName, cdnSpecifier } =
      this.validatePackageSpec(packageSpec);

    // Pass the full spec (with tag) to the CDN — the registry resolves it
    const url = this.getDocumentModelsUrl(cdnSpecifier);

    this.logger.verbose(`Importing document-models from: ${url}`);

    // Direct import from HTTP URL - hooks handle the fetch
    const module = (await this.importPackage(url)) as DocumentModelsExport;

    const models = Object.values(module).filter(
      (m: unknown): m is DocumentModelModule =>
        m !== null &&
        typeof m === "object" &&
        "documentModel" in m &&
        m.documentModel !== null,
    );

    this.logger.verbose(
      `Loaded ${models.length} document models from ${packageName}`,
    );
    return models;
  }

  async loadUpgradeManifests(
    packageSpec: string,
  ): Promise<UpgradeManifest<readonly number[]>[]> {
    const { name: packageName, cdnSpecifier } =
      this.validatePackageSpec(packageSpec);

    const url = this.getDocumentModelsUrl(cdnSpecifier);
    const module = await this.importPackage(url);
    const manifests = extractUpgradeManifests(module);
    if (manifests.length > 0) {
      this.logger.verbose(
        `Loaded ${manifests.length} upgrade manifests from ${packageName}`,
      );
    }
    return manifests;
  }

  async loadSubgraphs(packageSpec: string): Promise<SubgraphClass[]> {
    const { name: packageName, cdnSpecifier } =
      this.validatePackageSpec(packageSpec);

    const url = `${this.registryUrl}-/cdn/${cdnSpecifier}/node/subgraphs/index.mjs`;

    this.logger.verbose(`Importing subgraphs from: ${url}`);
    const module = (await this.importPackage(url)) as Record<
      string,
      SubgraphsExport
    >;
    const subgraphs = extractSubgraphsFromModule(module);

    this.logger.verbose(
      `Loaded ${subgraphs.length} subgraphs from ${packageName}`,
    );
    return subgraphs;
  }

  async loadProcessors(
    packageSpec: string,
  ): Promise<ProcessorFactoryBuilder | null> {
    const { name: packageName, cdnSpecifier } =
      this.validatePackageSpec(packageSpec);

    const url = `${this.registryUrl}-/cdn/${cdnSpecifier}/node/processors/index.mjs`;

    this.logger.verbose(`Importing processors from: ${url}`);
    const module = (await this.importPackage(url)) as ProcessorsExport;

    const factory = module.processorFactory;
    if (factory && typeof factory === "function") {
      this.logger.verbose(`Loaded processor factory from ${packageName}`);
      return factory;
    }

    this.logger.verbose(`No processor factory found in ${packageName}`);
    return null;
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
        const errMsg = `Failed to load package ${trimmedName}`;
        logger?.error(errMsg, error);
        this.logger.error(errMsg, error);
        // Continue with other packages - don't fail startup
      }
    }

    return allModels;
  }
}

/**
 * Returns live modules (host-only sources): dynamically loaded models are
 * registered on the host registry but never reach executor worker threads.
 * Making them worker-executable means returning an importable source here
 * (the CDN URL as a package specifier, given process-wide https hooks).
 */
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
  }

  async load(documentType: string): Promise<DocumentModelModule> {
    const packageName = await this.findPackageByDocumentType(documentType);

    let models: DocumentModelModule[];

    const cachedModels = this.packageModulesCache.get(packageName);
    if (cachedModels) {
      models = cachedModels;
    } else {
      models = await this.loader.loadDocumentModels(packageName);
      this.packageModulesCache.set(packageName, models);
    }

    const model = models.find(
      (module) => module.documentModel.global.id === documentType,
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

    return model;
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

    const packageNamesValue: unknown = await response.json();
    if (!Array.isArray(packageNamesValue)) {
      throw new Error(
        `Registry returned an invalid package list for document type: ${documentType}`,
      );
    }
    if (packageNamesValue.length === 0) {
      throw new Error(
        `No package found containing document type: ${documentType}`,
      );
    }

    const packageNames: string[] = [];
    for (let index = 0; index < packageNamesValue.length; index++) {
      if (!Object.hasOwn(packageNamesValue, index)) {
        throw new Error(
          `Registry returned a sparse package list for document type: ${documentType}`,
        );
      }
      const packageSpec: unknown = packageNamesValue[index];
      if (typeof packageSpec !== "string") {
        throw new Error(
          `Registry returned an invalid package spec for document type: ${documentType}`,
        );
      }
      try {
        this.loader.validatePackageSpec(packageSpec);
      } catch (error) {
        throw new Error(
          `Registry returned an invalid package spec for document type: ${documentType}`,
          { cause: error },
        );
      }
      packageNames.push(packageSpec);
    }

    const packageName = packageNames.sort((a, b) =>
      a === b ? 0 : a < b ? -1 : 1,
    )[0];
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
    for (const [docType, pkg] of this.documentTypeCache) {
      if (pkg === packageName) {
        this.documentTypeCache.delete(docType);
      }
    }
  }
}
