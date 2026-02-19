import { childLogger } from "document-drive";
import type { DocumentModelModule } from "document-model";

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
export class HttpPackageLoader {
  private readonly registryUrl: string;
  private readonly logger = childLogger(["reactor-api", "http-loader"]);

  constructor(options: HttpPackageLoaderOptions) {
    this.registryUrl = options.registryUrl.endsWith("/")
      ? options.registryUrl
      : `${options.registryUrl}/`;
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

  private isValidPackageName(name: string): boolean {
    // npm package name pattern: optional scope + package name
    const pattern = /^(@[a-z0-9][-a-z0-9._]*\/)?[a-z0-9][-a-z0-9._]*$/i;
    return pattern.test(name) && !name.includes("..") && name.length <= 214;
  }
}
