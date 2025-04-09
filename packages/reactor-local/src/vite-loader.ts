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

      this.logger.info(`  ➜  Loaded Document Models from: ${identifier}`);

      return Object.values(localDMs);
    } catch (e) {
      if ((e as FSError).code === "ENOENT") {
        this.logger.warn("No local document models found");
      } else {
        this.logger.error("Error loading document models", e);
      }
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

      this.logger.info(`  ➜  Loaded Subgraphs from: ${identifier}`);
    } catch (e) {
      if ((e as FSError).code === "ENOENT") {
        this.logger.warn("No local document models found");
      } else {
        this.logger.error("Error loading subgraphs", e);
      }

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

      this.logger.info(`  ➜  Loaded Processors from: ${identifier}`);

      if (module.processorFactory) {
        return module.processorFactory;
      }

      return () => () => [];
    } catch (e) {
      if ((e as FSError).code === "ENOENT") {
        this.logger.warn("No local document models found");
      } else {
        this.logger.error("Error loading document models", e);
      }
    }

    // return empty processor factory
    return () => () => [];
  }
}
