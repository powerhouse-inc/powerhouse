import { execSync } from "node:child_process";
export const installPackages = async (packages: string[]) => {
  for (const packageName of packages) {
    execSync(`ph install ${packageName}`);
  }
};

export const readManifest = () => {
  const manifest = execSync(`ph manifest`).toString();
  return manifest;
};

import { getConfig } from "@powerhousedao/config";
import { type SubgraphClass } from "@powerhousedao/reactor-api";
import { type Listener } from "document-drive/server/types";
import { type DocumentModelModule } from "document-model";
import EventEmitter from "node:events";
import { type StatWatcher, watchFile } from "node:fs";

interface IPackagesManager {
  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void;
}

type IPackagesManagerOptions = { packages: string[] } | { configFile: string };

interface PackageConfig {
  packageName: string;
}

interface PowerhouseConfig {
  packages?: PackageConfig[];
}

export async function loadDependency(
  packageName: string,
  subPath: string,
): Promise<unknown> {
  try {
    const fullPath = `${packageName}/${subPath}`;
    return await import(fullPath);
  } catch (e) {
    console.error("Error loading dependency", packageName, subPath, e);
    return null;
  }
}

async function loadPackagesDocumentModels(packages: string[]) {
  const loadedPackages = new Map<string, DocumentModelModule[]>();
  for (const pkg of packages) {
    try {
      console.log("> Loading package:", pkg);
      const pkgModule = (await loadDependency(pkg, "document-models")) as {
        [key: string]: DocumentModelModule;
      };
      if (pkgModule) {
        console.log(`  ➜  Loaded Document Models from: ${pkg}`);
        loadedPackages.set(pkg, Object.values(pkgModule));
      } else {
        console.warn(`  ➜  No Document Models found: ${pkg}`);
      }
    } catch (e) {
      console.error("Error loading Document Models from", pkg, e);
    }
  }
  return loadedPackages;
}

async function loadPackagesSubgraphs(packages: string[]) {
  const loadedPackages = new Map<string, SubgraphClass[]>();
  for (const pkg of packages) {
    const pkgModule = (await loadDependency(pkg, "subgraphs")) as
      | undefined
      | Record<string, Record<string, SubgraphClass>>;

    const subgraphs = pkgModule
      ? Object.values(pkgModule).map((subgraph) => {
          return Object.values(subgraph);
        })
      : undefined;

    if (!pkgModule || !subgraphs?.length) {
      console.warn(`  ➜  No Subgraphs found: ${pkg}`);
    } else {
      console.log(`  ➜  Loaded Subgraphs from: ${pkg}`);
      loadedPackages.set(pkg.replaceAll("@", ""), subgraphs.flat());
    }
  }
  return loadedPackages;
}

async function loadPackagesListeners(packages: string[]) {
  const loadedPackages = new Map<string, Listener[]>();
  for (const pkg of packages) {
    const pkgModule = (await loadDependency(pkg, "processors")) as Listener[];
    if (pkgModule) {
      console.log(`  ➜  Loaded Listeners from: ${pkg}`);
      loadedPackages.set(pkg, pkgModule);
    } else {
      console.warn(`  ➜  No Listeners found: ${pkg}`);
    }
  }

  return loadedPackages;
}
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

export class PackagesManager implements IPackagesManager {
  private docModelsMap = new Map<string, DocumentModelModule[]>();
  private subgraphsMap = new Map<string, SubgraphClass[]>();
  private listenerMap = new Map<string, Listener[]>();
  private configWatcher: StatWatcher | undefined;
  private eventEmitter = new EventEmitter<{
    documentModelsChange: [Record<string, DocumentModelModule[]>];
    subgraphsChange: [Map<string, SubgraphClass[]>];
    listenersChange: [Record<string, Listener[]>];
  }>();

  constructor(
    protected options: IPackagesManagerOptions,
    protected onError?: (e: unknown) => void,
  ) {
    this.eventEmitter.setMaxListeners(0);

    if ("packages" in options) {
      void this.loadPackages(options.packages).catch(onError);
    } else if ("configFile" in options) {
      void this.initConfigFile(options.configFile).catch(onError);
    }
  }

  public async init() {
    if ("packages" in this.options) {
      return await this.loadPackages(this.options.packages);
    } else if ("configFile" in this.options) {
      return await this.initConfigFile(this.options.configFile);
    }
  }

  private async loadPackages(packages: string[]) {
    // install packages
    const packagesMap = await loadPackagesDocumentModels(packages);
    const subgraphsMap = await loadPackagesSubgraphs(packages);
    const listenersMap = await loadPackagesListeners(packages);
    this.updatePackagesMap(packagesMap);
    this.updateSubgraphsMap(subgraphsMap);
    this.updateListenersMap(listenersMap);

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(packagesMap.values()),
      ),
      subgraphs: subgraphsMap,
      listeners: this.getUniqueListeners(Array.from(listenersMap.values())),
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

  private initConfigFile(configFile: string) {
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

  private updateListenersMap(listenersMap: Map<string, Listener[]>) {
    const oldPackages = Array.from(this.listenerMap.keys());
    const newPackages = Array.from(listenersMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        console.log("> Removed Listeners from:", pkg);
      });
    this.listenerMap = listenersMap;
    this.eventEmitter.emit("listenersChange", Object.fromEntries(listenersMap));
  }

  private getUniqueListeners(listeners: Listener[][]): Listener[] {
    const uniqueListeners = new Map<string, Listener>();
    for (const packageListeners of listeners) {
      for (const listener of packageListeners) {
        uniqueListeners.set(listener.listenerId, listener);
      }
    }
    return Array.from(uniqueListeners.values());
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

  onListenersChange(
    handler: (listeners: Record<string, Listener[]>) => void,
  ): void {
    this.eventEmitter.on("listenersChange", handler);
  }
}
