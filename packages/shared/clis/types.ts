import type { ArgParser } from "cmd-ts/dist/cjs/argparser.js";
import type { z } from "zod";
import type * as C from "../connect/connect-config-schema.js";
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

// Connect config types are inferred from the zod schemas in
// ../connect/connect-config-schema.ts, the single source of their shape and
// documentation. `PHConnectRuntimeConfig` is the served block: the authored
// one plus the fields the build and the host runner derive.

export type PHImageRef = z.infer<typeof C.connectImageRefSchema>;
export type PHSchemedImage = z.infer<typeof C.connectSchemedImageSchema>;
export type PHSchemedColor = z.infer<typeof C.connectSchemedColorSchema>;
export type PHLength = z.infer<typeof C.connectLengthSchema>;
export type PHEdges = z.infer<typeof C.connectEdgesSchema>;
export type PHBackgroundLayer = z.infer<typeof C.connectBackgroundLayerSchema>;
export type PHBackgroundLayers = z.infer<
  typeof C.connectBackgroundLayersSchema
>;
export type PHBackground = z.infer<typeof C.connectBackgroundSchema>;

export type PHConnectBranding = z.infer<typeof C.connectBrandingSchema>;
export type PHConnectLoader = z.infer<typeof C.connectLoaderSchema>;
export type PHConnectHome = z.infer<typeof C.connectHomeSchema>;
export type PHConnectExplorerIcons = z.infer<
  typeof C.connectExplorerIconsSchema
>;
export type PHConnectDefaultDriveRemote = z.infer<
  typeof C.connectDefaultDriveRemoteSchema
>;
export type PHConnectDefaultDriveLocal = z.infer<
  typeof C.connectDefaultDriveLocalSchema
>;
export type PHConnectDefaultDrive = z.infer<typeof C.connectDefaultDriveSchema>;
export type PHConnectDriveSection = z.infer<typeof C.connectDriveSectionSchema>;
export type PHConnectDriveSections = z.infer<
  typeof C.connectDriveSectionsSchema
>;
export type PHConnectDrives = z.infer<typeof C.connectDrivesSchema>;
export type PHConnectApp = z.infer<typeof C.connectAppSchema>;
export type PHConnectAi = z.infer<typeof C.connectAiSchema>;
export type PHConnectPackages = z.infer<typeof C.connectPackagesSchema>;
export type PHRenownRainbowAdapterConfig = z.infer<
  typeof C.connectRenownRainbowAdapterSchema
>;
export type PHRenownPrivyAdapterConfig = z.infer<
  typeof C.connectRenownPrivyAdapterSchema
>;
export type PHConnectRenownAdapters = z.infer<
  typeof C.connectRenownAdaptersSchema
>;
export type PHConnectRenown = z.infer<typeof C.connectRenownSchema>;
export type PHConnectSentry = z.infer<typeof C.connectSentrySchema>;
export type PHConnectOpenPanel = z.infer<typeof C.connectOpenPanelSchema>;

/**
 * Which reactor client Connect runs. One field selects all four shapes the
 * multi-reactor work standardized (each a peer `IReactorClient`):
 *  - `in-process`: the tab's own reactor on the main thread (PGlite in-tab).
 *  - `worker`:     the tab's own reactor in a SharedWorker (PGlite in-worker).
 *  - `remote`:     a pure client to a remote Switchboard reactor over GraphQL,
 *                  with NO local reactor and NO PGlite download.
 *  - `router`:     the tab's reactor (local) PLUS remote backends, routed.
 * Derived from the host's reactor backends (see reactorClientMode); when
 * unset, Connect falls back to the legacy `reactorWorker`/`multiReactor`
 * booleans.
 */
export type PHReactorClientMode = z.infer<
  typeof C.connectReactorClientModeSchema
>;
/** Served `instance`: the authored fields plus the derived `reactorClient`. */
export type PHConnectInstance = z.infer<typeof C.connectRuntimeInstanceSchema>;
/** Each flag implies its predecessors, and must match the fleet Connect syncs
 * with or the two compute different replay outcomes. */
export type PHConnectReactorFeatureFlags = z.infer<
  typeof C.connectReactorFeatureFlagsSchema
>;
export type PHConnectReactor = z.infer<typeof C.connectReactorSchema>;

export type PHConnectPwaUrlPattern = z.infer<
  typeof C.connectPwaUrlPatternSchema
>;
export type PHConnectPwaCacheStrategy = z.infer<
  typeof C.connectPwaCacheStrategySchema
>;
export type PHConnectPwaRuntimeCaching = z.infer<
  typeof C.connectPwaRuntimeCachingSchema
>;
export type PHConnectPwaIcon = z.infer<typeof C.connectPwaIconSchema>;
export type PHConnectPwaFileHandler = z.infer<
  typeof C.connectPwaFileHandlerSchema
>;
/** Served manifest overrides: the authored fields plus `categories`, derived
 * from every contributing `powerhouse.manifest.json`'s `category`. */
export type PHConnectPwaManifest = z.infer<
  typeof C.connectRuntimePwaManifestSchema
>;
/**
 * PWA / service-worker overrides contributed by a package or the project,
 * layered on Connect's hardcoded PWA defaults at build time. Scalars
 * deep-merge (later layer wins), arrays are additive and
 * `maximumFileSizeToCacheInBytes` takes the max. Precedence: defaults <
 * package fragments < project config.
 */
export type PHConnectPwa = z.infer<typeof C.connectRuntimePwaSchema>;

/** One entry of the host.js composition, projected into the served config as
 * DATA (module specifier + validated config). */
export type PHConnectCompositionEntry = z.infer<
  typeof C.connectCompositionEntrySchema
>;

/** The served `connect` block. For the authored block (powerhouse.config.json,
 * the connect host's `config`) see `ConnectConfig`. */
export type PHConnectRuntimeConfig = z.infer<
  typeof C.connectRuntimeConfigSchema
>;

/** Which Renown instance a reactor authenticates against, server-side. */
export type PHReactorRenown = {
  /** "self" reads this reactor's own renown read model; "remote" (default)
   * queries a Renown or Switchboard instance. */
  source?: "remote" | "self";
  /** Renown base URL; also the instance this reactor's own identity uses. */
  url?: string;
  /** Switchboard GraphQL endpoint to read credentials from directly. */
  switchboardUrl?: string;
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
    renown?: PHReactorRenown;
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
    driveId?: string;
    driveUrl?: string;
    connectPort?: number;
  };
  // Powerhouse workflows on this reactor and in Connect. PH_WORKFLOWS_ENABLED
  // wins for the reactor, connect.app.workflowsEnabled for Connect.
  workflows?: {
    enabled?: boolean;
  };
  packageRegistryUrl?: string;
  connect?: PHConnectRuntimeConfig;
};
