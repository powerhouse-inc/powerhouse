import { getConfig } from "@powerhousedao/config/utils";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import { childLogger, driveDocumentModelModule } from "document-drive";
import type {
  IProcessorHostModule,
  ProcessorFactory,
} from "document-drive/processors/types";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import EventEmitter from "node:events";
import type { StatWatcher } from "node:fs";
import { watchFile } from "node:fs";
import type {
  IPackageLoader,
  IPackageManager,
  IPackageManagerOptions,
  ISubscribablePackageLoader,
  PackageManagerResult,
} from "./types.js";
export function getUniqueDocumentModels(
  ...documentModels: DocumentModelModule[][]
): DocumentModelModule[] {
  const uniqueModels = new Map<string, DocumentModelModule>();

  for (const models of documentModels) {
    for (const model of models) {
      uniqueModels.set(model.documentModel.id, model);
    }
  }

  return Array.from(uniqueModels.values());
}

export class PackageManager implements IPackageManager {
  private readonly logger = childLogger(["reactor-api", "package-manager"]);
  private loaders: ISubscribablePackageLoader[];

  private docModelsMap = new Map<string, DocumentModelModule[]>();
  private subgraphsMap = new Map<string, SubgraphClass[]>();
  private processorMap = new Map<
    string,
    ((module: IProcessorHostModule) => ProcessorFactory)[]
  >();
  private configWatcher: StatWatcher | undefined;
  private eventEmitter = new EventEmitter<{
    documentModelsChange: [Record<string, DocumentModelModule[]>];
    subgraphsChange: [Map<string, SubgraphClass[]>];
    processorsChange: [
      Map<string, ((module: IProcessorHostModule) => ProcessorFactory)[]>,
    ];
  }>();

  constructor(
    loaders: IPackageLoader[],
    protected options: IPackageManagerOptions,
  ) {
    this.loaders = loaders;
    this.eventEmitter.setMaxListeners(0);
  }

  public async init(): Promise<PackageManagerResult> {
    if (this.options.configFile) {
      this.initConfigFileWatcher(this.options.configFile);
    }

    return await this.loadPackages(this.getAllPackageNames());
  }

  private async loadPackages(
    packages: string[],
  ): Promise<PackageManagerResult> {
    this.logger.info(`Loading packages: ${packages.join(", ")}`);

    const documentModelsMap = await this.loadDocumentModels(packages);
    const subgraphsMap = await this.loadSubgraphs(packages);
    const processorsMap = await this.loadProcessors(packages);

    this.updatePackagesMap(documentModelsMap);
    this.updateSubgraphsMap(subgraphsMap);
    this.updateProcessorsMap(processorsMap);

    try {
      this.subscribePackages(packages);
    } catch (error) {
      this.logger.error("Failed to subscribe to packages", error);
    }

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(documentModelsMap.values()),
      ),
      subgraphs: subgraphsMap,
      processors: processorsMap,
    };
  }

  private async loadDocumentModels(
    packages: string[],
  ): Promise<Map<string, DocumentModelModule[]>> {
    this.logger.debug(
      `Loading document models from packages: ${packages.join(", ")}`,
    );

    const documentModelModuleMap = new Map<string, DocumentModelModule[]>();

    // static prereqs
    documentModelModuleMap.set("document-drive", [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ]);

    documentModelModuleMap.set("document-model", [
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    ]);

    for (const pkg of packages) {
      const allDocumentModels: DocumentModelModule[] = [];

      for (const loader of this.loaders) {
        const documentModels = await loader.loadDocumentModels(pkg);

        allDocumentModels.push(...documentModels);
      }

      documentModelModuleMap.set(pkg, allDocumentModels);
    }

    return documentModelModuleMap;
  }

  private async loadSubgraphs(
    packages: string[],
  ): Promise<Map<string, SubgraphClass[]>> {
    this.logger.debug(
      `Loading subgraphs from packages: ${packages.join(", ")}`,
    );

    const subgraphsMap = new Map<string, SubgraphClass[]>();

    for (const pkg of packages) {
      const allSubgraphs: SubgraphClass[] = [];

      for (const loader of this.loaders) {
        const subgraphs = await loader.loadSubgraphs(pkg);

        allSubgraphs.push(...subgraphs);
      }

      subgraphsMap.set(pkg, allSubgraphs);
    }

    return subgraphsMap;
  }

  private async loadProcessors(
    packages: string[],
  ): Promise<
    Map<string, ((module: IProcessorHostModule) => ProcessorFactory)[]>
  > {
    this.logger.debug(
      `Loading processors from packages: ${packages.join(", ")}`,
    );

    const processorsMap = new Map<
      string,
      ((module: IProcessorHostModule) => ProcessorFactory)[]
    >();

    for (const pkg of packages) {
      const allProcessors: ((
        module: IProcessorHostModule,
      ) => ProcessorFactory)[] = [];

      for (const loader of this.loaders) {
        const processors = await loader.loadProcessors(pkg);

        if (processors) {
          allProcessors.push(processors);
        }
      }

      processorsMap.set(pkg, allProcessors);
    }
    this.updateProcessorsMap(processorsMap);

    return processorsMap;
  }

  private subscribePackages(packages: string[]) {
    const unsubs: (() => void)[] = [];
    for (const pkg of packages) {
      for (const loader of this.loaders) {
        if (loader.onDocumentModelsChange) {
          const unsub = loader.onDocumentModelsChange(pkg, async () => {
            this.logger.info(`Updating document models for package: ${pkg}`);
            const documentModels = await this.loadDocumentModels([pkg]);
            const documentModelsMap = new Map(this.docModelsMap);
            documentModelsMap.set(pkg, documentModels.get(pkg) ?? []);
            this.updatePackagesMap(documentModelsMap);
          });
          unsubs.push(unsub);
        }
      }
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }

  private getAllPackageNames(): string[] {
    const packageNames = this.options.packages ?? [];
    if (this.options.configFile) {
      packageNames.push(
        ...this.getPackageNamesFromConfigFile(this.options.configFile),
      );
    }
    return packageNames;
  }

  private getPackageNamesFromConfigFile(configFile: string) {
    const loadedConfig = getConfig(configFile);
    return loadedConfig.packages?.map((pkg) => pkg.packageName) ?? [];
  }

  private initConfigFileWatcher(configFile: string) {
    if (!this.configWatcher) {
      this.configWatcher = watchFile(
        configFile,
        { interval: 100 },
        (curr, prev) => {
          if (curr.mtime === prev.mtime) {
            return;
          }

          void this.loadPackages(this.getAllPackageNames());
        },
      );
    }
  }

  private updatePackagesMap(packagesMap: Map<string, DocumentModelModule[]>) {
    const oldPackages = Array.from(this.docModelsMap.keys());
    const newPackages = Array.from(packagesMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info(`Removed package: ${pkg}`);
      });
    this.docModelsMap = packagesMap;
    this.eventEmitter.emit(
      "documentModelsChange",
      Object.fromEntries(packagesMap),
    );
  }

  private updateSubgraphsMap(subgraphsMap: Map<string, SubgraphClass[]>) {
    const oldPackages = Array.from(this.subgraphsMap.keys());
    const newPackages = Array.from(subgraphsMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info(`Removed Subgraphs from: ${pkg}`);
      });
    this.subgraphsMap = subgraphsMap;
    this.eventEmitter.emit("subgraphsChange", subgraphsMap);
  }

  private updateProcessorsMap(
    processorsMap: Map<
      string,
      ((module: IProcessorHostModule) => ProcessorFactory)[]
    >,
  ) {
    const oldPackages = Array.from(this.processorMap.keys());
    const newPackages = Array.from(processorsMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info(`Removed Processor Factories from: ${pkg}`);
      });

    this.processorMap = processorsMap;
    this.eventEmitter.emit("processorsChange", processorsMap);
  }

  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void {
    this.eventEmitter.on("documentModelsChange", handler);
  }

  onSubgraphsChange(
    handler: (subgraphs: Map<string, SubgraphClass[]>) => void,
  ): void {
    this.eventEmitter.on("subgraphsChange", handler);
  }

  onProcessorsChange(
    handler: (
      processors: Map<
        string,
        ((module: IProcessorHostModule) => ProcessorFactory)[]
      >,
    ) => void,
  ): void {
    this.eventEmitter.on("processorsChange", handler);
  }
}
