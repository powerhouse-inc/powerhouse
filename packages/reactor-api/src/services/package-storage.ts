export interface InstalledPackageInfo {
  name: string;
  version?: string;
  registryUrl: string;
  installedAt: Date;
  documentTypes: string[];
}

export interface IPackageStorage {
  get(name: string): Promise<InstalledPackageInfo | undefined>;
  getAll(): Promise<InstalledPackageInfo[]>;
  set(name: string, info: InstalledPackageInfo): Promise<void>;
  delete(name: string): Promise<boolean>;
  has(name: string): Promise<boolean>;
}

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
