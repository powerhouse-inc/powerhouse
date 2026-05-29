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

  get(name: string): Promise<InstalledPackageInfo | undefined> {
    return Promise.resolve(this.packages.get(name));
  }

  getAll(): Promise<InstalledPackageInfo[]> {
    return Promise.resolve(Array.from(this.packages.values()));
  }

  set(name: string, info: InstalledPackageInfo): Promise<void> {
    this.packages.set(name, info);
    return Promise.resolve();
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.packages.delete(name));
  }

  has(name: string): Promise<boolean> {
    return Promise.resolve(this.packages.has(name));
  }
}
