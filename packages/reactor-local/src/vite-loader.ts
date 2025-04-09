import {
  IPackageLoader,
  isSubgraphClass,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import { childLogger } from "document-drive";
import { ProcessorFactory } from "document-drive/processors/types";
import { DocumentModelModule } from "document-model";
import { access } from "node:fs/promises";
import path from "node:path";
import { ViteDevServer } from "vite";

type FSError = {
  errno: number;
  code: string;
  syscall: string;
  path: string;
};

export class VitePackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-local", "vite-loader"]);

  private readonly vite: ViteDevServer;

  constructor(vite: ViteDevServer) {
    this.vite = vite;
  }

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    const fullPath = path.join(identifier, "./document-models");

    this.logger.info("Loading document models from", fullPath);

    try {
      await access(fullPath);

      const localDMs = (await this.vite.ssrLoadModule(fullPath)) as Record<
        string,
        DocumentModelModule
      >;

      const documentModels = Object.values(localDMs);

      this.logger.info(
        `  ➜  Loaded ${documentModels.length} Document Models from: ${identifier}`,
      );

      return documentModels;
    } catch (e) {
      this.logger.info(`  ➜  No Document Models found for: ${identifier}`);
    }

    return [];
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    const fullPath = path.join(identifier, "./subgraphs");

    this.logger.info("Loading subgraphs from", fullPath);

    let localSubgraphs: Record<string, Record<string, SubgraphClass>> = {};
    try {
      await access(fullPath);

      localSubgraphs = await this.vite.ssrLoadModule(fullPath);
    } catch (e) {
      this.logger.info(`  ➜  No Subgraphs found for: ${identifier}`);

      return [];
    }

    const subgraphs: SubgraphClass[] = [];
    for (const [name, subgraph] of Object.entries(localSubgraphs)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const SubgraphClass = subgraph[name] as SubgraphClass;
      if (isSubgraphClass(SubgraphClass)) {
        subgraphs.push(SubgraphClass);
      }
    }

    this.logger.info(
      `  ➜  Loaded ${subgraphs.length} Subgraphs from: ${identifier}`,
    );

    return subgraphs;
  }

  async loadProcessors(
    identifier: string,
  ): Promise<(module: any) => ProcessorFactory> {
    const fullPath = path.join(identifier, "./processors");

    this.logger.info("Loading processors from", fullPath);

    try {
      await access(fullPath);

      const module = await this.vite.ssrLoadModule(fullPath);

      if (module.processorFactory) {
        this.logger.info(`  ➜  Loaded Processor factory from: ${identifier}`);

        return module.processorFactory;
      }
    } catch (e) {
      //
    }

    this.logger.info(`  ➜  No Processor Factory found for: ${identifier}`);

    // return empty processor factory
    return () => () => [];
  }
}
