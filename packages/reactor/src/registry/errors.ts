/**
 * Error thrown when a document model module is not found in the registry.
 */
export class ModuleNotFoundError extends Error {
  readonly documentType: string;
  readonly requestedVersion: number | undefined;

  constructor(documentType: string, version?: number) {
    const versionSuffix = version !== undefined ? ` version ${version}` : "";
    super(
      `Document model module not found for type: ${documentType}${versionSuffix}`,
    );
    this.name = "ModuleNotFoundError";
    this.documentType = documentType;
    this.requestedVersion = version;
  }

  static isError(error: unknown): error is ModuleNotFoundError {
    return Error.isError(error) && error.name === "ModuleNotFoundError";
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

  static isError(error: unknown): error is DuplicateModuleError {
    return Error.isError(error) && error.name === "DuplicateModuleError";
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

  static isError(error: unknown): error is DuplicateManifestError {
    return Error.isError(error) && error.name === "DuplicateManifestError";
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
