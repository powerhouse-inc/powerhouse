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

export interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  s3ForcePathStyle?: boolean;
  keyPrefix?: string;
}

export interface RegistryConfig {
  port: number;
  storagePath: string;
  cdnCachePath: string;
  uplink?: string;
  webEnabled?: boolean;
  s3?: S3Config;
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

export interface RegistryCommandArgs {
  port: number;
  storageDir: string;
  cdnCacheDir: string;
  uplink?: string;
  s3Bucket?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3KeyPrefix?: string;
  s3ForcePathStyle: boolean;
  webEnabled: boolean;
}
