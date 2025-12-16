import type {
  DocumentModelModule,
  UpgradeManifest,
  UpgradeReducer,
  UpgradeTransition,
} from "document-model";
import type { IDocumentModelRegistry } from "./interfaces.js";

/**
 * Error thrown when a document model module is not found in the registry.
 */
export class ModuleNotFoundError extends Error {
  constructor(documentType: string, version?: number) {
    const versionSuffix = version !== undefined ? ` version ${version}` : "";
    super(
      `Document model module not found for type: ${documentType}${versionSuffix}`,
    );
    this.name = "ModuleNotFoundError";
  }
}

/**
 * Error thrown when attempting to register a module that already exists.
 */
export class DuplicateModuleError extends Error {
  constructor(documentType: string, version?: number) {
    const versionSuffix = version !== undefined ? ` (version ${version})` : "";
    super(
      `Document model module already registered for type: ${documentType}${versionSuffix}`,
    );
    this.name = "DuplicateModuleError";
  }
}

/**
 * Error thrown when a module is invalid or malformed.
 */
export class InvalidModuleError extends Error {
  constructor(message: string) {
    super(`Invalid document model module: ${message}`);
    this.name = "InvalidModuleError";
  }
}

/**
 * Error thrown when attempting to register an upgrade manifest that already exists.
 */
export class DuplicateManifestError extends Error {
  constructor(documentType: string) {
    super(`Upgrade manifest already registered for type: ${documentType}`);
    this.name = "DuplicateManifestError";
  }
}

/**
 * Error thrown when an upgrade manifest is not found.
 */
export class ManifestNotFoundError extends Error {
  constructor(documentType: string) {
    super(`Upgrade manifest not found for type: ${documentType}`);
    this.name = "ManifestNotFoundError";
  }
}

/**
 * Error thrown when attempting a downgrade operation.
 */
export class DowngradeNotSupportedError extends Error {
  constructor(documentType: string, fromVersion: number, toVersion: number) {
    super(
      `Downgrade not supported for ${documentType}: cannot go from version ${fromVersion} to ${toVersion}`,
    );
    this.name = "DowngradeNotSupportedError";
  }
}

/**
 * Error thrown when a required upgrade transition is missing from the manifest.
 */
export class MissingUpgradeTransitionError extends Error {
  constructor(documentType: string, fromVersion: number, toVersion: number) {
    super(
      `Missing upgrade transition for ${documentType}: v${fromVersion} to v${toVersion}`,
    );
    this.name = "MissingUpgradeTransitionError";
  }
}

/**
 * Error thrown when getUpgradeReducer is called with a non-single-step version increment.
 */
export class InvalidUpgradeStepError extends Error {
  constructor(documentType: string, fromVersion: number, toVersion: number) {
    super(
      `Invalid upgrade step for ${documentType}: must be single version increment, got v${fromVersion} to v${toVersion}`,
    );
    this.name = "InvalidUpgradeStepError";
  }
}

/**
 * In-memory implementation of the IDocumentModelRegistry interface.
 * Manages document model modules with version-aware storage and upgrade manifest support.
 */
export class DocumentModelRegistry implements IDocumentModelRegistry {
  private modules: DocumentModelModule<any>[] = [];
  private manifests: UpgradeManifest<readonly number[]>[] = [];

  registerModules(...modules: DocumentModelModule<any>[]): void {
    for (const module of modules) {
      const documentType = module.documentModel.global.id;
      const version = module.version ?? 1;

      for (let i = 0; i < this.modules.length; i++) {
        const existing = this.modules[i];
        const existingType = existing.documentModel.global.id;
        const existingVersion = existing.version ?? 1;

        if (existingType === documentType && existingVersion === version) {
          throw new DuplicateModuleError(documentType, version);
        }
      }

      this.modules.push(module);
    }
  }

  unregisterModules(...documentTypes: string[]): boolean {
    let allFound = true;

    for (const documentType of documentTypes) {
      const hasModule = this.modules.some(
        (m) => m.documentModel.global.id === documentType,
      );

      if (!hasModule) {
        allFound = false;
      }

      this.modules = this.modules.filter(
        (m) => m.documentModel.global.id !== documentType,
      );
    }

    return allFound;
  }

  getModule(documentType: string, version?: number): DocumentModelModule<any> {
    let latestModule: DocumentModelModule<any> | undefined;
    let latestVersion = -1;

    for (let i = 0; i < this.modules.length; i++) {
      const module = this.modules[i];
      const moduleType = module.documentModel.global.id;
      const moduleVersion = module.version ?? 1;

      if (moduleType === documentType) {
        if (version !== undefined && moduleVersion === version) {
          return module;
        }

        if (moduleVersion > latestVersion) {
          latestModule = module;
          latestVersion = moduleVersion;
        }
      }
    }

    if (version === undefined && latestModule !== undefined) {
      return latestModule;
    }

    throw new ModuleNotFoundError(documentType, version);
  }

  getAllModules(): DocumentModelModule<any>[] {
    return [...this.modules];
  }

  clear(): void {
    this.modules = [];
    this.manifests = [];
  }

  getSupportedVersions(documentType: string): number[] {
    const versions: number[] = [];

    for (const module of this.modules) {
      if (module.documentModel.global.id === documentType) {
        versions.push(module.version ?? 1);
      }
    }

    if (versions.length === 0) {
      throw new ModuleNotFoundError(documentType);
    }

    return versions.sort((a, b) => a - b);
  }

  getLatestVersion(documentType: string): number {
    let latest = -1;
    let found = false;

    for (const module of this.modules) {
      if (module.documentModel.global.id === documentType) {
        found = true;
        const version = module.version ?? 1;
        if (version > latest) {
          latest = version;
        }
      }
    }

    if (!found) {
      throw new ModuleNotFoundError(documentType);
    }

    return latest;
  }

  registerUpgradeManifests(
    ...manifests: UpgradeManifest<readonly number[]>[]
  ): void {
    for (const manifest of manifests) {
      for (let i = 0; i < this.manifests.length; i++) {
        if (this.manifests[i].documentType === manifest.documentType) {
          throw new DuplicateManifestError(manifest.documentType);
        }
      }
      this.manifests.push(manifest);
    }
  }

  getUpgradeManifest(
    documentType: string,
  ): UpgradeManifest<readonly number[]> | undefined {
    for (let i = 0; i < this.manifests.length; i++) {
      if (this.manifests[i].documentType === documentType) {
        return this.manifests[i];
      }
    }
    return undefined;
  }

  computeUpgradePath(
    documentType: string,
    fromVersion: number,
    toVersion: number,
  ): UpgradeTransition[] {
    if (fromVersion === toVersion) {
      return [];
    }

    if (toVersion < fromVersion) {
      throw new DowngradeNotSupportedError(
        documentType,
        fromVersion,
        toVersion,
      );
    }

    const manifest = this.getUpgradeManifest(documentType);
    if (manifest === undefined) {
      throw new ManifestNotFoundError(documentType);
    }

    const path: UpgradeTransition[] = [];
    for (let v = fromVersion + 1; v <= toVersion; v++) {
      const key = `v${v}`;

      if (!(key in manifest.upgrades)) {
        throw new MissingUpgradeTransitionError(documentType, v - 1, v);
      }

      const transition =
        manifest.upgrades[key as keyof typeof manifest.upgrades];
      path.push(transition);
    }

    return path;
  }

  getUpgradeReducer(
    documentType: string,
    fromVersion: number,
    toVersion: number,
  ): UpgradeReducer<any, any> {
    if (toVersion !== fromVersion + 1) {
      throw new InvalidUpgradeStepError(documentType, fromVersion, toVersion);
    }

    const manifest = this.getUpgradeManifest(documentType);
    if (manifest === undefined) {
      throw new ManifestNotFoundError(documentType);
    }

    const key = `v${toVersion}`;

    if (!(key in manifest.upgrades)) {
      throw new MissingUpgradeTransitionError(
        documentType,
        fromVersion,
        toVersion,
      );
    }

    const transition = manifest.upgrades[key as keyof typeof manifest.upgrades];
    return transition.upgradeReducer;
  }
}
