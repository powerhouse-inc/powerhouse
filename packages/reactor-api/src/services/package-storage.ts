/**
 * Package Storage Abstraction
 *
 * Provides a pluggable storage interface for persisting installed package information.
 * Different backends can be implemented (database, file-based, etc.) by implementing
 * the IPackageStorage interface.
 */

/**
 * Information about an installed package
 */
export interface InstalledPackageInfo {
  /** Package name (e.g., "@powerhousedao/vetra") */
  name: string;
  /** Package version if known */
  version?: string;
  /** Registry URL where the package was installed from */
  registryUrl: string;
  /** Timestamp when the package was installed */
  installedAt: Date;
  /** Document type IDs provided by this package */
  documentTypes: string[];
}

/**
 * Storage interface for installed packages.
 * Implement this interface for different storage backends (database, file-based, etc.)
 */
export interface IPackageStorage {
  /**
   * Get information about an installed package
   * @param name - The package name
   * @returns The package info or undefined if not found
   */
  get(name: string): Promise<InstalledPackageInfo | undefined>;

  /**
   * Get all installed packages
   * @returns Array of all installed package info
   */
  getAll(): Promise<InstalledPackageInfo[]>;

  /**
   * Store or update package information
   * @param name - The package name
   * @param info - The package information to store
   */
  set(name: string, info: InstalledPackageInfo): Promise<void>;

  /**
   * Delete a package from storage
   * @param name - The package name
   * @returns true if the package was deleted, false if it didn't exist
   */
  delete(name: string): Promise<boolean>;

  /**
   * Check if a package exists in storage
   * @param name - The package name
   * @returns true if the package exists
   */
  has(name: string): Promise<boolean>;
}

/**
 * Default in-memory implementation of IPackageStorage.
 * Data is lost when the process restarts.
 *
 * For production use, implement IPackageStorage with a persistent backend
 * (e.g., DatabasePackageStorage, FilePackageStorage).
 */
export class InMemoryPackageStorage implements IPackageStorage {
  private packages = new Map<string, InstalledPackageInfo>();

  async get(name: string): Promise<InstalledPackageInfo | undefined> {
    return this.packages.get(name);
  }

  async getAll(): Promise<InstalledPackageInfo[]> {
    return Array.from(this.packages.values());
  }

  async set(name: string, info: InstalledPackageInfo): Promise<void> {
    this.packages.set(name, info);
  }

  async delete(name: string): Promise<boolean> {
    return this.packages.delete(name);
  }

  async has(name: string): Promise<boolean> {
    return this.packages.has(name);
  }
}
