export interface RegistryOptions {
  packagesDir: string;
}

export type {
  PackageInfo,
  PowerhouseManifest,
  PowerhouseManifestApp,
  PowerhouseManifestDocumentModel,
  PowerhouseManifestEditor,
} from "@powerhousedao/shared/registry";

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
