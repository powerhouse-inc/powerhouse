import { childLogger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type { IDocumentModelLoader } from "@powerhousedao/reactor";

export interface HttpPackageLoaderOptions {
  registryUrl: string;
}

export interface HttpPackageLoaderLogger {
  info: (msg: string) => void;
  error: (msg: string, err: unknown) => void;
}

// Expected shape of the document-models bundle export
type DocumentModelsExport = Record<string, DocumentModelModule>;

/**
 * Loads document models from an HTTP registry.
 * Uses Node.js module loader hooks to import directly from HTTP URLs.
 *
 * IMPORTANT: Requires https-hooks to be registered before use:
 *   import { register } from "node:module";
 *   register("@powerhousedao/reactor-api/https-hooks", import.meta.url);
 */
export class HttpPackageLoader implements IDocumentModelLoader {
  private readonly registryUrl: string;
  private readonly logger = childLogger(["reactor-api", "http-loader"]);

  // Cache: documentType → packageName
  private readonly documentTypeCache = new Map<string, string>();

  // Cache: packageName → DocumentModelModule[]
  private readonly packageModulesCache = new Map<
    string,
    DocumentModelModule[]
  >();

  constructor(options: HttpPackageLoaderOptions) {
    this.registryUrl = options.registryUrl.endsWith("/")
      ? options.registryUrl
      : `${options.registryUrl}/`;
  }

  /**
   * Clear all caches. Useful for testing or when packages are updated.
   */
  clearCache(): void {
    this.documentTypeCache.clear();
    this.packageModulesCache.clear();
  }

  /**
   * Load document models from a package in the HTTP registry.
   * Imports directly from HTTP URL using Node.js loader hooks.
   */
  async loadDocumentModels(
    packageName: string,
  ): Promise<DocumentModelModule[]> {
    if (!this.isValidPackageName(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }

    const url = `${this.registryUrl}${packageName}/document-models.js`;

    try {
      this.logger.verbose(`Importing document-models from: ${url}`);

      // Direct import from HTTP URL - hooks handle the fetch
      const module = (await import(url)) as DocumentModelsExport;

      const models = Object.values(module).filter(
        (m): m is DocumentModelModule =>
          m !== null &&
          typeof m === "object" &&
          "documentModel" in m &&
          m.documentModel !== null,
      );

      this.logger.verbose(
        `Loaded ${models.length} document models from ${packageName}`,
      );
      return models;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load document models from ${packageName}: ${message}`,
      );
    }
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

  /**
   * Load a specific document model by document type.
   * Implements IDocumentModelLoader interface.
   *
   * @param documentType - The document type ID (e.g., "powerhouse/package")
   * @returns The DocumentModelModule for this type
   * @throws Error if document type not found in any package
   */
  async load(documentType: string): Promise<DocumentModelModule> {
    // Step 1: Find which package contains this document type
    const packageName = await this.findPackageByDocumentType(documentType);

    // Step 2: Load all document models from that package (uses cache if available)
    let models: DocumentModelModule[];

    const cachedModels = this.packageModulesCache.get(packageName);
    if (cachedModels) {
      models = cachedModels;
    } else {
      models = await this.loadDocumentModels(packageName);
      this.packageModulesCache.set(packageName, models);
    }

    // Step 3: Find the specific model matching the document type
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

    return model;
  }

  /**
   * Find the package that contains a specific document type.
   * Queries the registry's /packages/by-document-type endpoint.
   */
  private async findPackageByDocumentType(
    documentType: string,
  ): Promise<string> {
    // Check cache first
    const cached = this.documentTypeCache.get(documentType);
    if (cached) {
      return cached;
    }

    const encodedType = encodeURIComponent(documentType);
    const url = `${this.registryUrl}packages/by-document-type?type=${encodedType}`;

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

    // Return first match (sorted alphabetically for determinism)
    const packageName = packageNames.sort((a, b) => a.localeCompare(b))[0];

    // Cache the result
    this.documentTypeCache.set(documentType, packageName);

    return packageName;
  }

  private isValidPackageName(name: string): boolean {
    // npm package name pattern: optional scope + package name
    const pattern = /^(@[a-z0-9][-a-z0-9._]*\/)?[a-z0-9][-a-z0-9._]*$/i;
    return pattern.test(name) && !name.includes("..") && name.length <= 214;
  }
}
