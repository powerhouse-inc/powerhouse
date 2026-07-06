import type { ArgParser } from "cmd-ts/dist/cjs/argparser.js";
import type { getPackageManagerCommand } from "./args/common.js";
import type {
  DRIVES_PRESERVE_STRATEGIES,
  LOG_LEVELS,
  SERVICE_ACTIONS,
} from "./constants.js";

export type ServiceActions = typeof SERVICE_ACTIONS;
export type ServiceAction = ServiceActions[number];
export type DrivePreserveStrategies = typeof DRIVES_PRESERVE_STRATEGIES;
export type DrivePreserveStrategy = DrivePreserveStrategies[number];
export type LogLevels = typeof LOG_LEVELS;
export type LogLevel = LogLevels[number];

export type ParsedCmdResult<P> = P extends ArgParser<infer Out> ? Out : never;
export type PackageManagerArgs = ParsedCmdResult<
  typeof getPackageManagerCommand
>;

export type PHPackageProvider = "npm" | "github" | "local" | "registry";

export type PathValidation = (dir: string) => boolean;
export type PowerhousePackage = {
  packageName: string;
  version?: string;
  provider?: PHPackageProvider;
  url?: string;
};

export type PHConnectBranding = {
  appName?: string;
  homeBackground?: string | null;
};

export type PHConnectDefaultDrive = {
  url: string;
  name?: string | null;
  icon?: string | null;
};

export type PHConnectDriveSection = {
  enabled?: boolean;
  allowAdd?: boolean;
  allowDelete?: boolean;
};

export type PHConnectDriveSections = {
  remote?: PHConnectDriveSection;
  local?: PHConnectDriveSection;
};

export type PHConnectDrives = {
  allowAddDrive?: boolean;
  defaultDrives?: PHConnectDefaultDrive[];
  preserveStrategy?: DrivePreserveStrategy;
  sections?: PHConnectDriveSections;
};

export type PHConnectApp = {
  logLevel?: "debug" | "info" | "warn" | "error";
  basePath?: string;
  offline?: boolean;
};

export type PHConnectPackages = {
  externalEnabled?: boolean;
  /** Subscribe to the static-mode `/__packages` SSE channel for live reload. */
  liveReload?: boolean;
};

export type PHConnectRenown = {
  url?: string;
  networkId?: string;
  chainId?: number;
  /** Renown localStorage namespace; share it across Connects to share login. */
  namespace?: string;
};

export type PHConnectSentry = {
  /** Sentry DSN URL. `null` disables Sentry entirely. */
  dsn?: string | null;
  /** Sentry environment label. */
  env?: string;
  /** Enable Sentry performance tracing. */
  tracing?: boolean;
};

/**
 * A URL-matching pattern for a service-worker runtime-caching rule, in
 * JSON-serialisable form. A plain string is handed to Workbox verbatim (exact
 * URL or same-origin path match). `{ source, flags }` is reconstructed into a
 * `RegExp` at build time — use it for prefix/suffix/origin matches (e.g.
 * `{ source: "^https://api\\.acme\\.io/" }`). Function-valued patterns aren't
 * expressible here; regex covers the realistic package cases.
 */
export type PHConnectPwaUrlPattern =
  | string
  | { source: string; flags?: string };

export type PHConnectPwaCacheStrategy =
  | "CacheFirst"
  | "CacheOnly"
  | "NetworkFirst"
  | "NetworkOnly"
  | "StaleWhileRevalidate";

/** Serialisable subset of a Workbox `RuntimeCaching` rule. */
export type PHConnectPwaRuntimeCaching = {
  urlPattern: PHConnectPwaUrlPattern;
  handler: PHConnectPwaCacheStrategy;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "PATCH";
  options?: {
    cacheName?: string;
    /** Seconds a NetworkFirst rule waits for the network before falling back
     * to the cache. */
    networkTimeoutSeconds?: number;
    expiration?: { maxEntries?: number; maxAgeSeconds?: number };
    cacheableResponse?: {
      statuses?: number[];
      headers?: Record<string, string>;
    };
  };
};

export type PHConnectPwaIcon = {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
};

/**
 * A File Handling API entry a package or project contributes: the OS-level
 * file types the installed Connect PWA offers to open. There is deliberately
 * no `action` field — consuming launched files requires runtime code that
 * lives in Connect itself, so every handler (built-in or contributed) opens
 * at Connect's app root, injected at build time.
 */
export type PHConnectPwaFileHandler = {
  /** MIME type → file extensions (each must start with "."). */
  accept: Record<string, string[]>;
  /** OS-level file-type icons. */
  icons?: PHConnectPwaIcon[];
  launch_type?: "single-client" | "multiple-clients";
};

/** Web-app-manifest fields a package or project may override. */
export type PHConnectPwaManifest = {
  name?: string;
  short_name?: string;
  description?: string;
  theme_color?: string;
  background_color?: string;
  display?: "fullscreen" | "standalone" | "minimal-ui" | "browser";
  start_url?: string;
  scope?: string;
  icons?: PHConnectPwaIcon[];
  /** Extra file associations, appended after Connect's built-in `.phd`/`.phdm` handler. */
  file_handlers?: PHConnectPwaFileHandler[];
  /** How the OS launches the app for handled files/links. */
  launch_handler?: {
    client_mode:
      | "auto"
      | "focus-existing"
      | "navigate-existing"
      | "navigate-new";
  };
};

/**
 * PWA / service-worker overrides contributed by a package or the project.
 * Layered on top of Connect's hardcoded PWA defaults at build time. Object
 * fields deep-merge (later layer wins); `icons`, `file_handlers`,
 * `globPatterns`, `globIgnores`, `runtimeCaching` and
 * `navigateFallbackDenylist` are additive (concatenated/unioned);
 * `maximumFileSizeToCacheInBytes` takes the max across contributors.
 * Precedence: defaults < package fragments < project config.
 */
export type PHConnectPwa = {
  manifest?: PHConnectPwaManifest;
  /** Extra Workbox precache globs, unioned with the built-in patterns. */
  globPatterns?: string[];
  /** Extra Workbox precache ignore globs, unioned with the built-in list. */
  globIgnores?: string[];
  /** Raise the precache file-size ceiling; the max across contributors wins. */
  maximumFileSizeToCacheInBytes?: number;
  /** Additional runtime-caching rules, appended after the built-in rules. */
  runtimeCaching?: PHConnectPwaRuntimeCaching[];
  /** Extra SPA-fallback denylist patterns, unioned with the built-in list. */
  navigateFallbackDenylist?: PHConnectPwaUrlPattern[];
};

export type PHConnectRuntimeConfig = {
  branding?: PHConnectBranding;
  app?: PHConnectApp;
  packages?: PHConnectPackages;
  drives?: PHConnectDrives;
  renown?: PHConnectRenown;
  sentry?: PHConnectSentry;
  pwa?: PHConnectPwa;
};

export type PowerhouseConfig = {
  // required
  logLevel: LogLevel;
  documentModelsDir: string;
  editorsDir: string;
  processorsDir: string;
  subgraphsDir: string;
  importScriptsDir: string;
  skipFormat: boolean;

  // optional
  interactive?: boolean;
  watch?: boolean;
  reactor?: {
    port?: number;
    https?:
      | undefined
      | boolean
      | {
          keyPath: string;
          certPath: string;
        };
    storage?: {
      type: "filesystem" | "memory" | "postgres" | "browser";
      filesystemPath?: string;
      postgresUrl?: string;
    };
  };
  auth?: {
    enabled?: boolean;
    admins: string[];
  };
  switchboard?: {
    database?: {
      url?: string;
    };
    port?: number;
  };
  studio?: {
    port?: number;
    host?: string;
    https: boolean;
    openBrowser?: boolean;
  };
  packages?: PowerhousePackage[];
  vetra?: {
    driveId: string;
    driveUrl: string;
  };
  packageRegistryUrl?: string;
  connect?: PHConnectRuntimeConfig;
};
