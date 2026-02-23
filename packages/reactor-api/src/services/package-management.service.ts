/**
 * Package Management Service
 *
 * Provides business logic for installing, uninstalling, and listing packages at runtime.
 * Uses HttpPackageLoader to fetch packages from the registry and triggers hot reload
 * via a callback when the document model modules change.
 */

import { childLogger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type { HttpPackageLoader } from "../packages/http-loader.js";
import {
  InMemoryPackageStorage,
  type IPackageStorage,
  type InstalledPackageInfo,
} from "./package-storage.js";

/**
 * Result returned after successfully installing a package
 */
export interface InstallPackageResult {
  package: InstalledPackageInfo;
  documentModelsLoaded: number;
}

/**
 * Options for creating a PackageManagementService
 */
export interface PackageManagementServiceOptions {
  /** Storage backend for persisting package info (defaults to InMemoryPackageStorage) */
  storage?: IPackageStorage;
  /** Default registry URL to use when not specified in install calls */
  defaultRegistryUrl?: string;
  /** HTTP package loader instance for loading packages from registry */
  httpLoader?: HttpPackageLoader;
}

/**
 * Service for managing package installation/uninstallation at runtime.
 *
 * This service:
 * - Uses HttpPackageLoader to fetch document models from a registry
 * - Persists installed package metadata via IPackageStorage
 * - Triggers hot reload of document models via onModelsChanged callback
 */
export class PackageManagementService {
  private readonly storage: IPackageStorage;
  private readonly defaultRegistryUrl?: string;
  private readonly httpLoader?: HttpPackageLoader;
  private readonly logger = childLogger([
    "reactor-api",
    "package-management-service",
  ]);

  /** Callback invoked when document models change (for hot reload) */
  private onModelsChanged?: (models: DocumentModelModule[]) => void;

  /** Cache of loaded modules by package name */
  private loadedModulesCache = new Map<string, DocumentModelModule[]>();

  constructor(options: PackageManagementServiceOptions = {}) {
    this.storage = options.storage ?? new InMemoryPackageStorage();
    this.defaultRegistryUrl = options.defaultRegistryUrl;
    this.httpLoader = options.httpLoader;
  }

  /**
   * Set the callback to be invoked when document models change.
   * This is used to trigger hot reload of the GraphQL schema.
   */
  setOnModelsChanged(callback: (models: DocumentModelModule[]) => void): void {
    this.onModelsChanged = callback;
  }

  /**
   * Install a package from the registry.
   *
   * @param name - The package name (e.g., "@powerhousedao/vetra")
   * @param registryUrl - The registry URL (uses default if not provided)
   * @returns The install result with package info and loaded model count
   * @throws Error if no registry URL is available or package loading fails
   */
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

    // Check if already installed
    const existing = await this.storage.get(name);
    if (existing) {
      throw new Error(`Package ${name} is already installed`);
    }

    this.logger.info("Installing package @name from @url", name, url);

    // Load document models from the registry
    const models = await this.httpLoader.loadDocumentModels(name);

    // Extract document type IDs
    const documentTypes = models.map((m) => m.documentModel.global.id);

    // Create package info
    const packageInfo: InstalledPackageInfo = {
      name,
      registryUrl: url,
      installedAt: new Date(),
      documentTypes,
    };

    // Store the package info
    await this.storage.set(name, packageInfo);

    // Cache the loaded modules
    this.loadedModulesCache.set(name, models);

    this.logger.info(
      "Installed package @name with @count document models",
      name,
      models.length,
    );

    // Trigger hot reload
    this.triggerModelsChanged();

    return {
      package: packageInfo,
      documentModelsLoaded: models.length,
    };
  }

  /**
   * Uninstall a package.
   *
   * @param name - The package name to uninstall
   * @returns true if the package was uninstalled, false if it wasn't installed
   */
  async uninstallPackage(name: string): Promise<boolean> {
    const existing = await this.storage.get(name);
    if (!existing) {
      this.logger.warn("Package @name is not installed", name);
      return false;
    }

    this.logger.info("Uninstalling package @name", name);

    // Remove from storage
    await this.storage.delete(name);

    // Remove from local cache
    this.loadedModulesCache.delete(name);

    // Remove from http loader cache if available
    if (this.httpLoader) {
      this.httpLoader.removeFromCache(name);
    }

    // Trigger hot reload
    this.triggerModelsChanged();

    this.logger.info("Uninstalled package @name", name);
    return true;
  }

  /**
   * Get all installed packages.
   */
  async getInstalledPackages(): Promise<InstalledPackageInfo[]> {
    return this.storage.getAll();
  }

  /**
   * Get information about a specific installed package.
   */
  async getInstalledPackage(
    name: string,
  ): Promise<InstalledPackageInfo | undefined> {
    return this.storage.get(name);
  }

  /**
   * Get all document model modules from installed packages.
   */
  getAllLoadedModules(): DocumentModelModule[] {
    const allModules: DocumentModelModule[] = [];
    for (const modules of this.loadedModulesCache.values()) {
      allModules.push(...modules);
    }
    return allModules;
  }

  /**
   * Trigger the models changed callback with all currently loaded modules.
   */
  private triggerModelsChanged(): void {
    if (this.onModelsChanged) {
      const allModules = this.getAllLoadedModules();
      this.onModelsChanged(allModules);
    }
  }
}
