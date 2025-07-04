import { type SubgraphClass } from "#graphql/index.js";
import { type IPackageLoader } from "#types.js";
import { childLogger } from "document-drive";
import {
  type IProcessorHostModule,
  type ProcessorFactory,
} from "document-drive/processors/types";
import { type DocumentModelModule } from "document-model";
import { loadDependency } from "./util.js";

/**
 * This class is used to load packages using the import keyword.
 */
export class ImportPackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-api", "import-loader"]);

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    this.logger.verbose("Loading document models from package:", identifier);

    const pkgModule = (await loadDependency(identifier, "document-models")) as {
      [key: string]: DocumentModelModule;
    };

    if (pkgModule) {
      this.logger.verbose(`  ➜  Loaded Document Models from: ${identifier}`);

      return Object.values(pkgModule);
    } else {
      this.logger.verbose(`  ➜  No Document Models found: ${identifier}`);

      return [];
    }
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    this.logger.verbose("Loading subgraphs from package:", identifier);

    const pkgModule = (await loadDependency(identifier, "subgraphs")) as
      | undefined
      | Record<string, Record<string, SubgraphClass>>;

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

    const pkgModule = (await loadDependency(identifier, "processors")) as {
      processorFactory: (module: IProcessorHostModule) => ProcessorFactory;
    } | null;
    if (pkgModule?.processorFactory) {
      if (!(typeof pkgModule.processorFactory === "function")) {
        this.logger.verbose(
          `  ➜  Processor Factory is not a function: ${identifier}`,
        );
      } else {
        this.logger.verbose(
          `  ➜  Loaded Processor Factory from: ${identifier}`,
        );
        return pkgModule.processorFactory;
      }
    } else {
      this.logger.verbose(`  ➜  No Processor Factory found: ${identifier}`);
    }

    return null;
  }
}
