import { SubgraphClass } from "#graphql/index.js";
import { childLogger } from "document-drive";
import { ProcessorFactory } from "document-drive/processors/types";
import { DocumentModelModule } from "document-model";
import { IPackageLoader } from "./types.js";
import { loadDependency } from "./util.js";

/**
 * This class is used to load packages using the import keyword.
 */
export class ImportPackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-api", "import-loader"]);

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    this.logger.info("Loading document models from package:", identifier);

    let pkgModule: Record<string, DocumentModelModule> | undefined;
    try {
      pkgModule = (await loadDependency(identifier, "document-models")) as {
        [key: string]: DocumentModelModule;
      };
    } catch (e) {
      this.logger.error("Error loading Document Models from", identifier, e);

      return [];
    }

    if (pkgModule) {
      this.logger.info(`  ➜  Loaded Document Models from: ${identifier}`);

      return Object.values(pkgModule);
    } else {
      this.logger.warn(`  ➜  No Document Models found: ${identifier}`);

      return [];
    }
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    this.logger.info("Loading subgraphs from package:", identifier);

    const pkgModule = (await loadDependency(identifier, "subgraphs")) as
      | undefined
      | Record<string, Record<string, SubgraphClass>>;

    if (!pkgModule) {
      this.logger.warn(`  ➜  No Subgraphs found: ${identifier}`);

      return [];
    }

    const subgraphs = Object.values(pkgModule).map((subgraph) => {
      return Object.values(subgraph);
    });

    this.logger.info(`  ➜  Loaded Subgraphs from: ${identifier}`);

    return subgraphs.flat();
  }

  async loadProcessors(
    identifier: string,
  ): Promise<(module: any) => ProcessorFactory> {
    this.logger.info("Loading processors from package:", identifier);

    const pkgModule = (await loadDependency(identifier, "processors")) as (
      module: any,
    ) => ProcessorFactory;
    if (pkgModule) {
      this.logger.info(`  ➜  Loaded Processor Factory from: ${identifier}`);
      return pkgModule;
    } else {
      this.logger.warn(`  ➜  No Processor Factory found: ${identifier}`);
    }

    // empty processor factory
    return () => () => [];
  }
}
