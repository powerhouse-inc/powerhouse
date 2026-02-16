export interface RegistryOptions {
  packagesDir: string;
}

export interface PowerhouseManifest {
  name: string;
  description?: string;
  version?: string;
  modules?: {
    name: string;
    type: string;
    documentModel?: string;
  }[];
}

export interface PackageInfo {
  name: string;
  path: string;
  manifest: PowerhouseManifest | null;
}
