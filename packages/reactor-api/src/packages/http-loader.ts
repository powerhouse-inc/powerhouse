import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import type { IPackageLoader, ProcessorFactoryBuilder } from "../types.js";

export interface HttpPackageLoaderOptions {
  registryUrl: string;
}

export interface HttpPackageLoaderLogger {
  info: (msg: string) => void;
  error: (msg: string, err: unknown) => void;
}

// Expected shape of the document-models bundle export
type DocumentModelsExport = Record<string, DocumentModelModule>;

// Expected shape of the subgraphs bundle export
type SubgraphsExport = Record<string, SubgraphClass>;

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

  constructor(options: HttpPackageLoaderOptions) {
    this.registryUrl = options.registryUrl.endsWith("/")
      ? options.registryUrl
      : `${options.registryUrl}/`;
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

  async loadDocumentModels(
    packageSpec: string,
  ): Promise<DocumentModelModule[]> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    if (!this.isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }

    // Pass the full spec (with tag) to the CDN — the registry resolves it
    const url = `${this.registryUrl}-/cdn/${packageSpec}/node/document-models/index.mjs`;

    this.logger.verbose(`Importing document-models from: ${url}`);

    // Direct import from HTTP URL - hooks handle the fetch
    const module = (await import(url)) as DocumentModelsExport;

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

  async loadSubgraphs(packageSpec: string): Promise<SubgraphClass[]> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    if (!this.isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }

    const url = `${this.registryUrl}-/cdn/${packageSpec}/node/subgraphs/index.mjs`;

    this.logger.verbose(`Importing subgraphs from: ${url}`);
    const module = (await import(url)) as Record<string, SubgraphsExport>;
    const subgraphs = new Array<SubgraphClass>();
    for (const [key, value] of Object.entries(module)) {
      const subgraph = value[key];
      if (subgraph && typeof subgraph === "function") {
        subgraphs.push(subgraph);
      }
    }

    this.logger.verbose(
      `Loaded ${subgraphs.length} subgraphs from ${packageName}`,
    );
    return subgraphs;
  }

  async loadProcessors(
    packageSpec: string,
  ): Promise<ProcessorFactoryBuilder | null> {
    const { name: packageName } = this.parsePackageSpec(packageSpec);
    if (!this.isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }

    const url = `${this.registryUrl}-/cdn/${packageSpec}/node/processors/index.mjs`;

    this.logger.verbose(`Importing processors from: ${url}`);
    const module = (await import(url)) as ProcessorsExport;

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

  private isValidPackageName(name: string): boolean {
    // npm package name pattern: optional scope + package name
    const pattern = /^(@[a-z0-9][-a-z0-9._]*\/)?[a-z0-9][-a-z0-9._]*$/i;
    return pattern.test(name) && !name.includes("..") && name.length <= 214;
  }
}

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
    for (const [docType, pkg] of this.documentTypeCache) {
      if (pkg === packageName) {
        this.documentTypeCache.delete(docType);
      }
    }
  }
}
