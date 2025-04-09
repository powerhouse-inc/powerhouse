import { getConfig, PowerhouseConfig } from "@powerhousedao/config";
import { type SubgraphClass } from "@powerhousedao/reactor-api";
import { ProcessorFactory } from "document-drive/processors/types";
import { type DocumentModelModule } from "document-model";
import EventEmitter from "node:events";
import { type StatWatcher, watchFile } from "node:fs";
import {
  IPackageLoader,
  IPackageManager,
  IPackageManagerOptions,
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
  private loaders: IPackageLoader[];

  private docModelsMap = new Map<string, DocumentModelModule[]>();
  private subgraphsMap = new Map<string, SubgraphClass[]>();
  private processorMap = new Map<
    string,
    ((module: any) => ProcessorFactory)[]
  >();
  private configWatcher: StatWatcher | undefined;
  private eventEmitter = new EventEmitter<{
    documentModelsChange: [Record<string, DocumentModelModule[]>];
    subgraphsChange: [Map<string, SubgraphClass[]>];
    processorsChange: [Map<string, ((module: any) => ProcessorFactory)[]>];
  }>();

  constructor(
    loaders: IPackageLoader[],
    protected options: IPackageManagerOptions,
    protected onError?: (e: unknown) => void,
  ) {
    this.loaders = loaders;
    this.eventEmitter.setMaxListeners(0);
  }

  public async init(): Promise<PackageManagerResult> {
    if (this.options.packages) {
      return await this.loadPackages(this.options.packages);
    }

    if (this.options.configFile) {
      return await this.initConfigFile(this.options.configFile);
    }

    return {
      documentModels: [],
      subgraphs: new Map(),
      processors: new Map(),
    };
  }

  private async loadPackages(
    packages: string[],
  ): Promise<PackageManagerResult> {
    const packagesMap = new Map<string, DocumentModelModule[]>();
    const subgraphsMap = new Map<string, SubgraphClass[]>();
    const processorsMap = new Map<
      string,
      ((module: any) => ProcessorFactory)[]
    >();

    for (const pkg of packages) {
      const allDocumentModels: DocumentModelModule[] = [];
      const allSubgraphs: SubgraphClass[] = [];
      const allProcessors: ((module: any) => ProcessorFactory)[] = [];

      for (const loader of this.loaders) {
        const documentModels = await loader.loadDocumentModels(pkg);
        const subgraphs = await loader.loadSubgraphs(pkg);
        const processors = await loader.loadProcessors(pkg);

        allDocumentModels.push(...documentModels);
        allSubgraphs.push(...subgraphs);
        allProcessors.push(processors);
      }

      packagesMap.set(pkg, allDocumentModels);
      subgraphsMap.set(pkg, allSubgraphs);
      processorsMap.set(pkg, allProcessors);
    }

    this.updatePackagesMap(packagesMap);
    this.updateSubgraphsMap(subgraphsMap);
    this.updateProcessorsMap(processorsMap);

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(packagesMap.values()),
      ),
      subgraphs: subgraphsMap,
      processors: processorsMap,
    };
  }

  private async loadFromConfigFile(configFile: string) {
    try {
      const loadedConfig = getConfig(configFile) as PowerhouseConfig;
      if (!loadedConfig) {
        throw new Error(`Failed to load config from ${configFile}`);
      }
      const packageNames =
        loadedConfig.packages?.map((pkg) => pkg.packageName) ?? [];
      return await this.loadPackages(packageNames);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.onError) {
        this.onError(err);
      }
      return Promise.reject(err);
    }
  }

  private initConfigFile(configFile: string): Promise<PackageManagerResult> {
    const result = this.loadFromConfigFile(configFile);

    if (!this.configWatcher) {
      this.configWatcher = watchFile(
        configFile,
        { interval: 100 },
        (curr, prev) => {
          if (curr.mtime === prev.mtime) {
            return;
          }
          void this.loadFromConfigFile(configFile).catch(this.onError);
        },
      );
    }

    return result;
  }

  private updatePackagesMap(packagesMap: Map<string, DocumentModelModule[]>) {
    const oldPackages = Array.from(this.docModelsMap.keys());
    const newPackages = Array.from(packagesMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        console.log("> Removed package:", pkg);
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
        console.log("> Removed Subgraphs from:", pkg);
      });
    this.subgraphsMap = subgraphsMap;
    this.eventEmitter.emit("subgraphsChange", subgraphsMap);
  }

  private updateProcessorsMap(
    processorsMap: Map<string, ((module: any) => ProcessorFactory)[]>,
  ) {
    const oldPackages = Array.from(this.processorMap.keys());
    const newPackages = Array.from(processorsMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        console.log("> Removed Processor Factories from:", pkg);
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
      processors: Map<string, ((module: any) => ProcessorFactory)[]>,
    ) => void,
  ): void {
    this.eventEmitter.on("processorsChange", handler);
  }
}
