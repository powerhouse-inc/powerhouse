import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { IProcessorHostModule, ProcessorFactory } from "document-drive";
import { childLogger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type { IPackageLoader, IPackageLoaderOptions } from "../types.js";
import {
  loadDocumentModels as loadDocumentModelsUtil,
  loadProcessors as loadProcessorsUtil,
  loadSubgraphs as loadSubgraphsUtil,
} from "./util.js";

/**
 * This class is used to load packages using the import keyword.
 */
export class ImportPackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-api", "import-loader"]);
  private readonly legacyReactor: boolean;

  constructor(options?: IPackageLoaderOptions) {
    this.legacyReactor = options?.legacyReactor ?? false;
  }

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    this.logger.verbose("Loading document models from package:", identifier);

    const pkgModule = await loadDocumentModelsUtil(identifier);

    if (pkgModule) {
      const models = Object.values(pkgModule);
      this.logger.verbose(
        `  ➜  Loaded ${models.length} Document Models from: ${identifier}`,
      );
      return models;
    } else {
      this.logger.verbose(`  ➜  No Document Models found: ${identifier}`);
      return [];
    }
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    this.logger.verbose("Loading subgraphs from package:", identifier);

    const pkgModule = await loadSubgraphsUtil(identifier);

    if (!pkgModule) {
      this.logger.verbose(`  ➜  No Subgraphs found: ${identifier}`);

      return [];
    }

    const subgraphs = Object.values(pkgModule).map((subgraph) => {
      return Object.values(subgraph);
    });

    this.logger.verbose(`  ➜  Loaded Subgraphs from: ${identifier}`);

    return subgraphs.flat();
  }

  async loadProcessors(
    identifier: string,
  ): Promise<((module: IProcessorHostModule) => ProcessorFactory) | null> {
    this.logger.verbose("Loading processors from package:", identifier);

    const pkgModule = await loadProcessorsUtil(identifier);

    // Choose factory based on constructor option
    const factoryName = this.legacyReactor
      ? "processorFactoryLegacy"
      : "processorFactory";
    const factory = pkgModule?.[factoryName];

    if (factory && typeof factory === "function") {
      this.logger.verbose(
        `  ➜  Loaded Processor Factory (${factoryName}) from: ${identifier}`,
      );
      return factory;
    }

    // Fallback: if legacy requested but not found, try default (backwards compat)
    if (
      this.legacyReactor &&
      pkgModule?.processorFactory &&
      typeof pkgModule.processorFactory === "function"
    ) {
      this.logger.verbose(
        `  ➜  Loaded Processor Factory (fallback to processorFactory) from: ${identifier}`,
      );
      return pkgModule.processorFactory;
    }

    this.logger.verbose(`  ➜  No Processor Factory found: ${identifier}`);
    return null;
  }
}
