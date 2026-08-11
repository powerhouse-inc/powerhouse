import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import type { IPackageLoader, ProcessorFactoryBuilder } from "../types.js";
import {
  extractUpgradeManifests,
  loadDocumentModels as loadDocumentModelsUtil,
  loadProcessors as loadProcessorsUtil,
  loadSubgraphs as loadSubgraphsUtil,
} from "./util.js";

/**
 * This class is used to load packages using the import keyword.
 */
export class ImportPackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-api", "import-loader"]);

  readonly name = "ImportPackageLoader";

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    this.logger.verbose(`Loading document models from package: ${identifier}`);

    const pkgModule = await loadDocumentModelsUtil(identifier);

    if (pkgModule) {
      // duck type: the namespace also carries non-module exports such as the
      // upgradeManifests aggregate
      const models = Object.values(pkgModule).filter(
        (m: unknown): m is DocumentModelModule =>
          m !== null && typeof m === "object" && "documentModel" in m,
      );
      this.logger.verbose(
        `  ➜  Loaded ${models.length} Document Models from: ${identifier}`,
      );
      return models;
    } else {
      this.logger.verbose(`  ➜  No Document Models found: ${identifier}`);
      return [];
    }
  }

  async loadUpgradeManifests(
    identifier: string,
  ): Promise<UpgradeManifest<readonly number[]>[]> {
    const pkgModule = await loadDocumentModelsUtil(identifier);
    if (!pkgModule) return [];

    const manifests = extractUpgradeManifests(pkgModule);
    if (manifests.length > 0) {
      this.logger.verbose(
        `  ➜  Loaded ${manifests.length} Upgrade Manifests from: ${identifier}`,
      );
    }
    return manifests;
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    this.logger.verbose(`Loading subgraphs from package: ${identifier}`);

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
  ): Promise<ProcessorFactoryBuilder | null> {
    this.logger.verbose(`Loading processors from package: ${identifier}`);

    const pkgModule = await loadProcessorsUtil(identifier);

    const factory = pkgModule?.processorFactory;

    if (factory && typeof factory === "function") {
      this.logger.verbose(`  ➜  Loaded Processor Factory from: ${identifier}`);
      return factory;
    }

    this.logger.verbose(`  ➜  No Processor Factory found: ${identifier}`);
    return null;
  }
}
