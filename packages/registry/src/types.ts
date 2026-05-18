export interface RegistryOptions {
  packagesDir: string;
}

export type { PackageInfo } from "@powerhousedao/shared/registry";

export interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  s3ForcePathStyle?: boolean;
  keyPrefix?: string;
}

export interface WebhookConfig {
  /** Webhook URL to POST to */
  endpoint: string;
  /** Custom headers to include in the request */
  headers?: Record<string, string>;
}

export interface NotifyConfig {
  webhooks?: WebhookConfig[];
}

export interface RenownAuthConfig {
  /** Public URL of this registry. Used as the expected `aud` claim on
   *  Renown-signed bearer tokens. Required when renown auth is enabled. */
  publicUrl: string;
}

export interface RegistryConfig {
  port: number;
  storagePath: string;
  cdnCachePath: string;
  uplink?: string;
  webEnabled?: boolean;
  s3?: S3Config;
  notify?: NotifyConfig;
  maxBodySize?: string;
  /** Top-level verdaccio JWT signing secret. If unset, randomized per pod. */
  verdaccioSecret?: string;
  /** Enable Renown JWT auth in front of verdaccio. */
  renown?: RenownAuthConfig;
  /** Glob patterns served locally only — no npmjs uplink proxy. Lets you
   *  re-publish a workspace package whose version already exists on npmjs
   *  without bumping (verdaccio would otherwise reject with 409). */
  localPackagePatterns?: string[];
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
  webhooks?: string;
  publicUrl?: string;
  authRenown?: boolean;
  verdaccioSecret?: string;
  /** Comma-separated globs (e.g. "@powerhousedao/*,document-model,ph-cmd")
   *  served locally only — no npmjs uplink proxy. */
  localPackages?: string;
}
