import {
  type IPackageLoader,
  isSubgraphClass,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import { childLogger } from "document-drive";
import {
  type IProcessorHostModule,
  type ProcessorFactory,
} from "document-drive/processors/types";
import { type DocumentModelModule } from "document-model";
import { access } from "node:fs/promises";
import path from "node:path";
import { type ViteDevServer } from "vite";

export class VitePackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-local", "vite-loader"]);

  private readonly vite: ViteDevServer;

  constructor(vite: ViteDevServer) {
    this.vite = vite;
  }

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    const fullPath = path.join(identifier, "./document-models");

    this.logger.verbose("Loading document models from", fullPath);

    try {
      await access(fullPath);

      const localDMs = (await this.vite.ssrLoadModule(fullPath)) as Record<
        string,
        DocumentModelModule
      >;

      const exports = Object.values(localDMs);

      // duck type
      const documentModels: DocumentModelModule[] = [];
      for (const dm of exports) {
        if (dm.documentModel) {
          documentModels.push(dm);
        }
      }

      this.logger.verbose(
        `  ➜  Loaded ${documentModels.length} Document Models from: ${identifier}`,
      );

      return documentModels;
    } catch (e) {
      this.logger.verbose(`  ➜  No Document Models found for: ${identifier}`);
    }

    return [];
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    const fullPath = path.join(identifier, "./subgraphs");

    this.logger.verbose("Loading subgraphs from", fullPath);

    let localSubgraphs: Record<string, Record<string, SubgraphClass>> = {};
    try {
      await access(fullPath);

      localSubgraphs = await this.vite.ssrLoadModule(fullPath);
    } catch (e) {
      this.logger.verbose(`  ➜  No Subgraphs found for: ${identifier}`);

      return [];
    }

    const subgraphs: SubgraphClass[] = [];
    for (const [name, subgraph] of Object.entries(localSubgraphs)) {
      const SubgraphClass = subgraph[name];
      if (isSubgraphClass(SubgraphClass)) {
        subgraphs.push(SubgraphClass);
      }
    }

    this.logger.verbose(
      `  ➜  Loaded ${subgraphs.length} Subgraphs from: ${identifier}`,
    );

    return subgraphs;
  }

  async loadProcessors(
    identifier: string,
  ): Promise<((module: IProcessorHostModule) => ProcessorFactory) | null> {
    const fullPath = path.join(identifier, "./processors");

    this.logger.verbose("Loading processors from", fullPath);

    try {
      await access(fullPath);

      const module = await this.vite.ssrLoadModule(fullPath);

      if (
        module.processorFactory &&
        typeof module.processorFactory === "function"
      ) {
        this.logger.verbose(
          `  ➜  Loaded Processor factory from: ${identifier}`,
        );

        return module.processorFactory as (
          module: IProcessorHostModule,
        ) => ProcessorFactory;
      }
    } catch (e) {
      //
    }

    this.logger.verbose(`  ➜  No Processor Factory found for: ${identifier}`);

    // return empty processor factory
    return null;
  }
}
