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
  /** Renown service base URL for credential verification (defaults to the
   *  SDK default, https://www.renown.id). */
  renownUrl?: string;
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
  /** Express `trust proxy`: hops in front of the registry, so rate limits key on client IPs */
  trustProxy?: number | string;
  s3?: S3Config;
  notify?: NotifyConfig;
  maxBodySize?: string;
  /** Seeds Verdaccio's stored signing secret when none is stored yet. */
  verdaccioSecret?: string;
  /** Enable Renown JWT auth in front of verdaccio. */
  renown?: RenownAuthConfig;
  /** Glob patterns served locally only — no npmjs uplink proxy. Lets you
   *  re-publish a workspace package whose version already exists on npmjs
   *  without bumping (verdaccio would otherwise reject with 409). */
  localPackagePatterns?: string[];
  /** Sizes of the storage plugin's Postgres pools; unset keeps its defaults */
  storagePoolMax?: number;
  storageLockPoolMax?: number;
  /** Postgres connection string. When set, the registry uses the DB-backed
   *  auth plugin (persistent accounts + package ownership) instead of the
   *  built-in htpasswd. */
  databaseUrl?: string;
  /** Directory verdaccio loads the auth plugin from. Defaults to the
   *  `plugins` dir next to the compiled code (dist/plugins). Overridable so
   *  tests can point at the built plugin while running from src. */
  pluginsDir?: string;
  /** AuthStore instance shared by the auth plugin and owner-lookup routes
   *  (one pool). Built from `databaseUrl` at runtime, or injected in tests. */
  authStore?: unknown;
  /** Handoff token for `authStore`, carried through verdaccio's plugin config
   *  (a live object can't survive it). Set at runtime; used for load detection. */
  authStoreToken?: string;
}

export interface RegistryCommandArgs {
  port: number;
  storageDir: string;
  cdnCacheDir: string;
  uplink?: string;
  /** How long verdaccio caches npmjs uplink metadata before refetching.
   *  See RegistryConfig.uplinkMaxage. */
  uplinkMaxage?: string;
  /** See RegistryConfig.trustProxy */
  trustProxy?: string;
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
  /** Renown service base URL (defaults to the SDK default). */
  renownUrl?: string;
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
  /** Workers run inside the server process; 0 leaves jobs to `ph-registry worker`. */
  workers?: number;
  /** Memory held for small published files, in MiB; 0 turns it off. */
  artifactCacheMb?: number;
  /** A direct connection for LISTEN when databaseUrl goes through a pooler */
  listenDatabaseUrl?: string;
  /** Apply migrations at boot; unset, only without databaseUrl (PGlite) */
  migrateOnBoot?: boolean;
  /** Connections in this process's own Postgres pool */
  dbPoolMax?: number;
  /** The storage plugin's pools: reads, and package-lock writes */
  storagePoolMax?: number;
  storageLockPoolMax?: number;
}

export interface WorkerCommandArgs {
  storageDir: string;
  cdnCacheDir: string;
  s3Bucket?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3KeyPrefix?: string;
  s3ForcePathStyle: boolean;
  databaseUrl?: string;
  listenDatabaseUrl?: string;
  migrateOnBoot?: boolean;
  dbPoolMax?: number;
  webhooks?: string;
  /** npm endpoint of a registry replica the worker fetches packages from */
  registryUrl: string;
  concurrency: number;
  /** Serves GET /-/metrics on this port when set */
  metricsPort?: number;
}
