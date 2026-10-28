import type {
  IDocumentModelRegistry,
  IProcessorManager as IReactorProcessorManager,
  ProcessorRecord as ReactorProcessorRecord,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ProcessorFactory } from "@powerhousedao/shared/processors";
import { childLogger, type ILogger } from "document-model";
import type { GraphQLManager } from "../graphql/graphql-manager.js";
import type { IProcessorHostModule } from "../types.js";
import { reportFailure, type ReportError } from "../utils/detached.js";
import {
  getUniqueDocumentModels,
  type PackageManager,
} from "./package-manager.js";

export type PackageListenerOptions = {
  logger?: ILogger;
  reportError?: ReportError;
};

export function setupEventListeners(
  pkgManager: PackageManager,
  graphqlManager: GraphQLManager,
  reactorProcessorManager: IReactorProcessorManager,
  moduleFor: (packageName: string) => IProcessorHostModule,
  documentModelRegistry?: IDocumentModelRegistry,
  {
    logger = childLogger(["reactor-api", "package-listeners"]),
    reportError,
  }: PackageListenerOptions = {},
): void {
  const reporting = { logger, report: reportError };
  const typesOf = (models: readonly DocumentModelModule[]) =>
    new Set(models.map((m) => m.documentModel.global.id));
  const packagedTypes = new Map(
    Array.from(pkgManager.getDocumentModels(), ([pkg, models]) => [
      pkg,
      typesOf(models),
    ]),
  );

  pkgManager.onDocumentModelsChange(async (packagedModels) => {
    if (documentModelRegistry) {
      // Whole version families: unregisterModules is type-scoped.
      const newModules = getUniqueDocumentModels(
        Object.values(packagedModels).flat(),
      );
      const incomingTypes = typesOf(newModules);

      // A failed load keeps its last good set; anything missing is gone.
      const removedTypes = new Set<string>();
      for (const types of packagedTypes.values()) {
        for (const type of types) {
          if (!incomingTypes.has(type)) removedTypes.add(type);
        }
      }
      packagedTypes.clear();
      for (const [pkg, models] of Object.entries(packagedModels)) {
        packagedTypes.set(pkg, typesOf(models));
      }
      if (removedTypes.size > 0) {
        documentModelRegistry.unregisterModules(...removedTypes);
        documentModelRegistry.unregisterUpgradeManifests(...removedTypes);
        logger.info(
          "Unregistered document models: @types",
          Array.from(removedTypes).join(", "),
        );
      }

      if (incomingTypes.size > 0) {
        documentModelRegistry.unregisterModules(...incomingTypes);
        const results = documentModelRegistry.registerModules(...newModules);
        for (const result of results) {
          if (result.status === "success") {
            logger.info(
              `Registered document model: ${result.item.documentModel.global.id} v${result.item.version ?? 1}`,
            );
          } else {
            logger.error(
              `Failed to register document model: ${result.error.message}`,
            );
          }
        }
      }

      // Manifests live in the document-models/ tree, so they change too.
      const manifests = pkgManager.getUniqueUpgradeManifests();
      if (manifests.length > 0) {
        documentModelRegistry.unregisterUpgradeManifests(
          ...manifests.map((m) => m.documentType),
        );
        const manifestResults = documentModelRegistry.registerUpgradeManifests(
          ...manifests,
        );
        for (const result of manifestResults) {
          if (result.status === "error") {
            logger.error(
              `Failed to register upgrade manifest: ${result.error.message}`,
            );
          }
        }
      }
    }
    try {
      await graphqlManager.regenerateDocumentModelSubgraphs();
    } catch (error) {
      reportFailure(
        reporting,
        error,
        "Document model change left subgraphs stale: @error",
      );
    }
  });

  pkgManager.onScalarsChange(async (scalars) => {
    try {
      await graphqlManager.applyScalarRegistry(scalars);
    } catch (error) {
      reportFailure(
        reporting,
        error,
        "Scalar change left subgraphs stale: @error",
      );
    }
  });

  pkgManager.onSubgraphsChange(async (packagedSubgraphs) => {
    try {
      await graphqlManager.applyPackageSubgraphs(packagedSubgraphs);
    } catch (error) {
      reportFailure(
        reporting,
        error,
        "Failed to apply package subgraphs: @error",
      );
    }
  });

  let knownProcessorPackages = new Set<string>();
  pkgManager.onProcessorsChange(async (processors) => {
    // A package gone from the map keeps none of its factories.
    for (const packageName of knownProcessorPackages) {
      if (!processors.has(packageName)) {
        try {
          await reactorProcessorManager.unregisterFactory(packageName);
        } catch (error) {
          reportFailure(
            reporting,
            error,
            "Failed to unregister processors of @package: @error",
            packageName,
          );
        }
      }
    }
    knownProcessorPackages = new Set(processors.keys());

    for (const [packageName, fns] of processors) {
      try {
        await reactorProcessorManager.unregisterFactory(packageName);
      } catch (error) {
        reportFailure(
          reporting,
          error,
          "Failed to unregister processors of @package: @error",
          packageName,
        );
      }

      const factories = await Promise.allSettled(
        fns.map(async (fn) => fn(moduleFor(packageName))),
      );

      const validBuilders: ProcessorFactory[] = [];
      for (const factory of factories) {
        if (factory.status === "rejected") {
          reportFailure(
            reporting,
            factory.reason,
            "Processor factory builder of @package failed: @error",
            packageName,
          );
        } else if (typeof factory.value === "function") {
          validBuilders.push(factory.value);
        }
      }

      if (!validBuilders.length) {
        continue;
      }

      try {
        await reactorProcessorManager.registerFactory(
          packageName,
          async (driveHeader) =>
            (
              await Promise.all(
                validBuilders.map(async (driveFactory) => {
                  try {
                    const result = await driveFactory(driveHeader);
                    return result as unknown as ReactorProcessorRecord[];
                  } catch (error) {
                    reportFailure(
                      reporting,
                      error,
                      "Creating a processor of @package for drive @drive failed: @error",
                      packageName,
                      driveHeader.id,
                    );
                    return [];
                  }
                }),
              )
            ).flat(),
        );
      } catch (error) {
        reportFailure(
          reporting,
          error,
          "Failed to register processors of @package: @error",
          packageName,
        );
      }
    }
  });
}
