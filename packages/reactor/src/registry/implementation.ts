import type {
  DocumentModelModule,
  UpgradeManifest,
  UpgradeReducer,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  DowngradeNotSupportedError,
  DuplicateManifestError,
  DuplicateModuleError,
  InvalidUpgradeStepError,
  ManifestNotFoundError,
  MissingUpgradeTransitionError,
  ModuleNotFoundError,
} from "./errors.js";
import type {
  IDocumentModelRegistry,
  RegistrationResult,
} from "./interfaces.js";

/**
 * In-memory implementation of the IDocumentModelRegistry interface.
 * Manages document model modules with version-aware storage and upgrade manifest support.
 */
export class DocumentModelRegistry implements IDocumentModelRegistry {
  private modules: DocumentModelModule<any>[] = [];
  private manifests: UpgradeManifest<readonly number[]>[] = [];

  registerModules(
    ...modules: DocumentModelModule<any>[]
  ): RegistrationResult<DocumentModelModule<any>>[] {
    return modules.map((module) => {
      try {
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
        return { status: "success" as const, item: module };
      } catch (error) {
        return {
          status: "error" as const,
          item: module,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });
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
    ...manifestsToRegister: UpgradeManifest<readonly number[]>[]
  ): RegistrationResult<UpgradeManifest<readonly number[]>>[] {
    return manifestsToRegister.map((manifestToRegister) => {
      try {
        if (!manifestToRegister.documentType) {
          throw new Error("Upgrade manifest is missing a documentType");
        }

        for (const registeredManifest of this.manifests) {
          if (
            registeredManifest.documentType === manifestToRegister.documentType
          ) {
            throw new DuplicateManifestError(manifestToRegister.documentType);
          }
        }

        this.manifests.push(manifestToRegister);
        return { status: "success" as const, item: manifestToRegister };
      } catch (error) {
        return {
          status: "error" as const,
          item: manifestToRegister,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });
  }

  unregisterUpgradeManifests(...documentTypes: string[]): boolean {
    let allFound = true;

    for (const documentType of documentTypes) {
      const hasManifest = this.manifests.some(
        (m) => m.documentType === documentType,
      );

      if (!hasManifest) {
        allFound = false;
      }

      this.manifests = this.manifests.filter(
        (m) => m.documentType !== documentType,
      );
    }

    return allFound;
  }

  getUpgradeManifest(documentType: string): UpgradeManifest<readonly number[]> {
    for (let i = 0; i < this.manifests.length; i++) {
      if (this.manifests[i].documentType === documentType) {
        return this.manifests[i];
      }
    }
    throw new ManifestNotFoundError(documentType);
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
