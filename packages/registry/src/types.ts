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
  /** How long verdaccio caches npmjs uplink metadata before refetching.
   *  Accepts verdaccio time strings (`"30s"`, `"2m"`, `"1h"`, etc).
   *  Default `"2m"` matches verdaccio upstream — shortens the publish-to-
   *  install propagation window in dev. Bump for production deployments
   *  that want to reduce npmjs load. */
  uplinkMaxage?: string;
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
  /** Postgres connection string. When set, the registry uses the DB-backed
   *  auth plugin (persistent accounts + package ownership) instead of the
   *  built-in htpasswd. */
  databaseUrl?: string;
  /** Directory verdaccio loads the auth plugin from. Defaults to the
   *  `plugins` dir next to the compiled code (dist/plugins). Overridable so
   *  tests can point at the built plugin while running from src. */
  pluginsDir?: string;
  /** Injected AuthStore (tests only) — passed to the auth plugin instead of
   *  building one from `databaseUrl`. */
  authStore?: unknown;
}

export interface RegistryCommandArgs {
  port: number;
  storageDir: string;
  cdnCacheDir: string;
  uplink?: string;
  /** How long verdaccio caches npmjs uplink metadata before refetching.
   *  See RegistryConfig.uplinkMaxage. */
  uplinkMaxage?: string;
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
  /** Postgres connection string for the DB-backed auth plugin. */
  databaseUrl?: string;
  /** Override the dir verdaccio loads the auth plugin from (tests). */
  pluginsDir?: string;
  /** Injected AuthStore (tests only). */
  authStore?: unknown;
}
