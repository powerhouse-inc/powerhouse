import type {
  DocumentModelModule,
  UpgradeManifest,
  UpgradeReducer,
  UpgradeTransition,
} from "document-model";

/**
 * Registry for managing document model modules.
 * Provides centralized access to document models' reducers, utils, and specifications.
 * Supports version-aware module storage and upgrade manifest management.
 */
export interface IDocumentModelRegistry {
  /**
   * Register multiple modules at once.
   * Modules without a version field default to version 1.
   *
   * @param modules Document model modules to register
   * @throws DuplicateModuleError if a module with the same document type and version is already registered
   */
  registerModules(...modules: DocumentModelModule<any>[]): void;

  /**
   * Unregister all versions of the specified document types.
   *
   * @param documentTypes The document types to unregister
   * @returns true if all modules were unregistered, false if any were not found
   */
  unregisterModules(...documentTypes: string[]): boolean;

  /**
   * Get a specific document model module by document type and optional version.
   * If version is not specified, returns the latest version.
   *
   * @param documentType The document type identifier
   * @param version Optional version number to retrieve
   * @returns The document model module
   * @throws ModuleNotFoundError if the document type or version is not registered
   */
  getModule(documentType: string, version?: number): DocumentModelModule<any>;

  /**
   * Get all registered document model modules.
   *
   * @returns Array of all registered modules
   */
  getAllModules(): DocumentModelModule<any>[];

  /**
   * Clear all registered modules and upgrade manifests.
   */
  clear(): void;

  /**
   * Get all supported versions for a document type, sorted in ascending order.
   *
   * @param documentType The document type identifier
   * @returns Array of version numbers sorted ascending
   * @throws ModuleNotFoundError if no modules are registered for the document type
   */
  getSupportedVersions(documentType: string): number[];

  /**
   * Get the latest (highest) version number for a document type.
   *
   * @param documentType The document type identifier
   * @returns The highest version number registered for this document type
   * @throws ModuleNotFoundError if no modules are registered for the document type
   */
  getLatestVersion(documentType: string): number;

  /**
   * Register upgrade manifests that define upgrade paths between versions.
   *
   * @param manifests Upgrade manifests to register
   * @throws DuplicateManifestError if a manifest for the same document type is already registered
   */
  registerUpgradeManifests(
    ...manifests: UpgradeManifest<readonly number[]>[]
  ): void;

  /**
   * Get the upgrade manifest for a document type.
   *
   * @param documentType The document type identifier
   * @returns The upgrade manifest, or undefined if not found
   */
  getUpgradeManifest(
    documentType: string,
  ): UpgradeManifest<readonly number[]> | undefined;

  /**
   * Compute the upgrade path from one version to another.
   * Returns the sequence of upgrade transitions needed.
   *
   * @param documentType The document type identifier
   * @param fromVersion The starting version
   * @param toVersion The target version
   * @returns Array of upgrade transitions in order
   * @throws DowngradeNotSupportedError if toVersion is less than fromVersion
   * @throws ManifestNotFoundError if no upgrade manifest is registered
   * @throws MissingUpgradeTransitionError if any transition in the path is missing
   */
  computeUpgradePath(
    documentType: string,
    fromVersion: number,
    toVersion: number,
  ): UpgradeTransition[];

  /**
   * Get the upgrade reducer for a single-step version transition.
   *
   * @param documentType The document type identifier
   * @param fromVersion The starting version
   * @param toVersion The target version (must be fromVersion + 1)
   * @returns The upgrade reducer function
   * @throws InvalidUpgradeStepError if toVersion is not fromVersion + 1
   * @throws ManifestNotFoundError if no upgrade manifest is registered
   * @throws MissingUpgradeTransitionError if the transition is not found
   */
  getUpgradeReducer(
    documentType: string,
    fromVersion: number,
    toVersion: number,
  ): UpgradeReducer<any, any>;
}
