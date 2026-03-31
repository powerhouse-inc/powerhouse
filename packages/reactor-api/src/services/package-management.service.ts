import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import type { HttpPackageLoader } from "../packages/http-loader.js";
import {
  InMemoryPackageStorage,
  type IPackageStorage,
  type InstalledPackageInfo,
} from "./package-storage.js";

export interface InstallPackageResult {
  package: InstalledPackageInfo;
  documentModelsLoaded: number;
}

export interface PackageManagementServiceOptions {
  storage?: IPackageStorage;
  defaultRegistryUrl?: string;
  httpLoader?: HttpPackageLoader;
  documentModelRegistry?: IDocumentModelRegistry;
}

export class PackageManagementService {
  private readonly storage: IPackageStorage;
  private readonly defaultRegistryUrl?: string;
  private readonly httpLoader?: HttpPackageLoader;
  private readonly documentModelRegistry?: IDocumentModelRegistry;
  private readonly logger = childLogger([
    "reactor-api",
    "package-management-service",
  ]);

  private onModelsChanged?: (models: DocumentModelModule[]) => void;
  private loadedModulesCache = new Map<string, DocumentModelModule[]>();

  constructor(options: PackageManagementServiceOptions = {}) {
    this.storage = options.storage ?? new InMemoryPackageStorage();
    this.defaultRegistryUrl = options.defaultRegistryUrl;
    this.httpLoader = options.httpLoader;
    this.documentModelRegistry = options.documentModelRegistry;
  }

  setOnModelsChanged(callback: (models: DocumentModelModule[]) => void): void {
    this.onModelsChanged = callback;
  }

  async installPackage(
    name: string,
    registryUrl?: string,
  ): Promise<InstallPackageResult> {
    const url = registryUrl ?? this.defaultRegistryUrl;
    if (!url) {
      throw new Error(
        "No registry URL provided and no default registry URL configured",
      );
    }

    if (!this.httpLoader) {
      throw new Error("HttpPackageLoader not configured");
    }

    const existing = await this.storage.get(name);
    if (existing) {
      throw new Error(`Package ${name} is already installed`);
    }

    this.logger.info("Installing package @name from @url", name, url);

    const models = await this.httpLoader.loadDocumentModels(name);
    const documentTypes = models.map((m) => m.documentModel.global.id);

    const packageInfo: InstalledPackageInfo = {
      name,
      registryUrl: url,
      installedAt: new Date(),
      documentTypes,
    };

    await this.storage.set(name, packageInfo);
    this.loadedModulesCache.set(name, models);

    if (this.documentModelRegistry) {
      this.documentModelRegistry.registerModules(...models);
    }

    this.logger.info(
      "Installed package @name with @count document models",
      name,
      models.length,
    );

    this.triggerModelsChanged();

    return {
      package: packageInfo,
      documentModelsLoaded: models.length,
    };
  }

  async uninstallPackage(name: string): Promise<boolean> {
    const existing = await this.storage.get(name);
    if (!existing) {
      this.logger.warn("Package @name is not installed", name);
      return false;
    }

    this.logger.info("Uninstalling package @name", name);

    await this.storage.delete(name);
    this.loadedModulesCache.delete(name);

    if (this.httpLoader) {
      this.httpLoader.documentModelLoader.removeFromCache(name);
    }

    if (this.documentModelRegistry) {
      this.documentModelRegistry.unregisterModules(...existing.documentTypes);
    }

    this.triggerModelsChanged();

    this.logger.info("Uninstalled package @name", name);
    return true;
  }

  async getInstalledPackages(): Promise<InstalledPackageInfo[]> {
    return this.storage.getAll();
  }

  async getInstalledPackage(
    name: string,
  ): Promise<InstalledPackageInfo | undefined> {
    return this.storage.get(name);
  }

  getAllLoadedModules(): DocumentModelModule[] {
    const allModules: DocumentModelModule[] = [];
    for (const modules of this.loadedModulesCache.values()) {
      allModules.push(...modules);
    }
    return allModules;
  }

  private triggerModelsChanged(): void {
    if (this.onModelsChanged) {
      const allModules = this.getAllLoadedModules();
      this.onModelsChanged(allModules);
    }
  }
}
