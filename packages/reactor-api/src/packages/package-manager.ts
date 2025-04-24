import { getConfig } from "@powerhousedao/config";
import { type SubgraphClass } from "@powerhousedao/reactor-api";
import { childLogger, driveDocumentModelModule } from "document-drive";
import { type ProcessorFactory } from "document-drive/processors/types";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import EventEmitter from "node:events";
import { type StatWatcher, watchFile } from "node:fs";
import type {
  IPackageLoader,
  IPackageManager,
  IPackageManagerOptions,
  IProcessorHostModule,
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
  private loaders: IPackageLoader[];

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

    const documentModelModuleMap = new Map<string, DocumentModelModule[]>();
    const subgraphsMap = new Map<string, SubgraphClass[]>();
    const processorsMap = new Map<
      string,
      ((module: IProcessorHostModule) => ProcessorFactory)[]
    >();

    // static prereqs
    documentModelModuleMap.set("document-drive", [
      driveDocumentModelModule as DocumentModelModule,
    ]);

    documentModelModuleMap.set("document-model", [
      documentModelDocumentModelModule as DocumentModelModule,
    ]);

    for (const pkg of packages) {
      const allDocumentModels: DocumentModelModule[] = [];
      const allSubgraphs: SubgraphClass[] = [];
      const allProcessors: ((
        module: IProcessorHostModule,
      ) => ProcessorFactory)[] = [];

      for (const loader of this.loaders) {
        const documentModels = await loader.loadDocumentModels(pkg);
        const subgraphs = await loader.loadSubgraphs(pkg);
        const processors = await loader.loadProcessors(pkg);

        allDocumentModels.push(...documentModels);
        allSubgraphs.push(...subgraphs);
        if (processors) {
          allProcessors.push(processors);
        }
      }

      documentModelModuleMap.set(pkg, allDocumentModels);
      subgraphsMap.set(pkg, allSubgraphs);
      processorsMap.set(pkg, allProcessors);
    }

    this.updatePackagesMap(documentModelModuleMap);
    this.updateSubgraphsMap(subgraphsMap);
    this.updateProcessorsMap(processorsMap);

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(documentModelModuleMap.values()),
      ),
      subgraphs: subgraphsMap,
      processors: processorsMap,
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
        this.logger.info(`> Removed package: ${pkg}`);
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
        this.logger.info(`> Removed Subgraphs from: ${pkg}`);
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
        this.logger.info(`> Removed Processor Factories from: ${pkg}`);
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
