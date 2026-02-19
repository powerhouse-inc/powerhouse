export interface RegistryOptions {
  packagesDir: string;
}

export interface PowerhouseManifestDocumentModel {
  id: string;
  name: string;
}

export interface PowerhouseManifestEditor {
  id: string;
  name: string;
  documentTypes: string[];
}

export interface PowerhouseManifestApp {
  id: string;
  name: string;
  driveEditor?: string;
}

export interface PowerhouseManifest {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  publisher?: {
    name: string;
    url: string;
  };
  documentModels?: PowerhouseManifestDocumentModel[];
  editors?: PowerhouseManifestEditor[];
  apps?: PowerhouseManifestApp[];
  subgraphs?: unknown[];
  importScripts?: unknown[];
}

export interface PackageInfo {
  name: string;
  path: string;
  manifest: PowerhouseManifest | null;
}
