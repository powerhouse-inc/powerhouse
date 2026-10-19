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

/** An image reference: a project-relative file path (the Connect build turns
 * it into a data URI or an emitted file), a URL, or a data URI. */
export type PHImageRef = string;

/** An image per colour scheme: one reference for both, or `{ light, dark }`
 * (`dark` falls back to `light`). */
export type PHSchemedImage =
  | PHImageRef
  | { light: PHImageRef; dark?: PHImageRef | null };

/** A CSS colour per colour scheme (`dark` falls back to `light`). */
export type PHSchemedColor = string | { light: string; dark?: string | null };

/** A CSS length: a number is px, a string is passed through as written
 * ("40%", "min(55%, 880px)", "calc(50% - 120px)"). */
export type PHLength = number | string;

/** Distances to the four edges; each is optional. */
export type PHEdges = {
  top?: PHLength | null;
  right?: PHLength | null;
  bottom?: PHLength | null;
  left?: PHLength | null;
};

/** One image of a decorated pane, absolutely positioned inside it. The
 * edges set in `position` are the ones it is pinned to; an axis with neither
 * edge set is centred. Give `width` or `height`; the other follows the
 * image's aspect (an SVG needs a viewBox for that). */
export type PHBackgroundLayer = {
  src: PHSchemedImage;
  /** At most one edge per axis. Omitted: centred both ways. */
  position?: PHEdges | null;
  width?: PHLength | null;
  height?: PHLength | null;
  minWidth?: PHLength | null;
  minHeight?: PHLength | null;
  maxWidth?: PHLength | null;
  maxHeight?: PHLength | null;
  /** 0 to 1 (default 1). */
  opacity?: number | null;
  /** Feather depth per edge, fading the layer into the page colour. */
  fade?: PHEdges | null;
};

/** A decorated pane: the page colour and the images laid over it, painted
 * in order (the first at the back). The content of the pane paints above
 * them all. */
export type PHBackgroundLayers = {
  /** The page colour. Omitted or null: the theme's page background. */
  color?: PHSchemedColor | null;
  layers: PHBackgroundLayer[];
};

/** A pane's background: layers, or a single image as shorthand for one
 * layer pinned to the bottom-right corner. */
export type PHBackground = PHImageRef | PHBackgroundLayers;

/** Connect's identity and look. Core settings of the Connect host: every
 * field is optional, and `null` means "the default" (the same as omitting
 * it), so a scaffolded config can list them all. Paths are resolved by the
 * Connect build and dev server relative to the project root. */
export type PHConnectBranding = {
  /** Browser tab title, installed-app name and in-app brand text.
   * Default "Powerhouse Connect". */
  appName?: string | null;
  /** App icon master (1024x1024 PNG recommended, or an SVG). The favicons
   * and installed-app icons are its `<name>_16x16` / `_32x32` / `_64x64` /
   * `_192x192` / `_512x512` siblings; the 64 px one is the in-app logo.
   * Default: Connect's icon. */
  icon?: PHImageRef | null;
  /** The loading image shown at first paint, app start and while a drive or
   * editor loads. A path gets a gentle pulse; `{ src, animation, size }`
   * says otherwise. Default: Connect's animated logo. */
  loader?: PHImageRef | PHConnectLoader | null;
};

/** The loading image and the motion applied to it. */
export type PHConnectLoader = {
  src: PHImageRef;
  /** Default "pulse"; "none" for an image that animates itself. */
  animation?: "pulse" | "spin" | "none" | null;
  /** Width in CSS pixels (default 96); the height follows the image. */
  size?: number | null;
};

/** The home screen: the generic chrome's landing page, so the generic
 * plugin owns it (its entry `homeBackground`; `connect.home.background` on
 * the classic path). */
export type PHConnectHome = {
  /** Layered images over a page colour, or one image pinned bottom-right.
   * null: the bundled gradient. */
  background?: PHBackground | null;
};

/** The drive explorer's icons: the generic chrome's, so the generic plugin
 * owns them (its entry `icons`; `connect.drives.icons` on the classic path).
 * Each `null` keeps the built-in icon. A package may ship its own document
 * icons; these override them per type. */
export type PHConnectExplorerIcons = {
  /** Local drives without an icon of their own. */
  localDrive?: PHImageRef | null;
  /** Remote drives without an icon of their own. */
  remoteDrive?: PHImageRef | null;
  folder?: PHImageRef | null;
  /** Documents whose type has no icon below. */
  document?: PHImageRef | null;
  /** Per document type, e.g. "acme/invoice". */
  documents?: Record<string, PHImageRef> | null;
};

export type PHConnectDefaultDriveRemote = {
  url: string;
  name?: string | null;
  icon?: string | null;
};

export type PHConnectDefaultDriveLocal = {
  /** Discriminator: this entry is a local drive created on first boot. */
  local: true;
  /** Stable drive id; the drive is not re-created on later boots. */
  id: string;
  name?: string | null;
  icon?: string | null;
  /** Drive app (preferred editor) to open on the drive. */
  app?: string;
};

export type PHConnectDefaultDrive =
  | PHConnectDefaultDriveRemote
  | PHConnectDefaultDriveLocal;

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
  /** The explorer's icons (generic plugin); null = the built-in icons. */
  icons?: PHConnectExplorerIcons | null;
};

export type PHConnectApp = {
  logLevel?: "debug" | "info" | "warn" | "error";
  basePath?: string;
  offline?: boolean;
  // Builder mode: Connect loads the vetra package and exposes DocumentModel +
  // vetra spec types as creatable docs. Forced on by `ph vetra`/studio.
  studioMode?: boolean;
  // Powerhouse workflows in Connect: the tab loads the workflow package
  // (workflow + connection document models, their editors and Workflow
  // Studio) and the reactor worker registers its models. Falls back to the
  // top-level `workflows.enabled` when unset. Independent of studioMode.
  workflowsEnabled?: boolean;
};

export type PHConnectAi = {
  /** Enables the in-browser AI assistant (chat FAB + window). Off by default. */
  assistantEnabled?: boolean;
};

export type PHConnectPackages = {
  externalEnabled?: boolean;
  /** Subscribe to the static-mode `/__packages` SSE channel for live reload. */
  liveReload?: boolean;
};

export type PHRenownRainbowAdapterConfig = {
  /** WalletConnect project id; required for the rainbow adapter to function. */
  walletConnectProjectId?: string;
  /** Optional Infura project id used to build RPC transports. */
  infuraProjectId?: string;
};

export type PHRenownPrivyAdapterConfig = {
  /** Privy application id; required for the privy adapter to function. */
  appId?: string;
  /** Optional Privy client id. */
  clientId?: string;
  /** Login methods this adapter offers; defaults per adapter when omitted. */
  methods?: string[];
};

export type PHConnectRenownAdapters = {
  rainbow?: PHRenownRainbowAdapterConfig;
  privy?: PHRenownPrivyAdapterConfig;
};

export type PHConnectRenown = {
  url?: string;
  networkId?: string;
  chainId?: number;
  /** Renown localStorage namespace; share it across Connects to share login. */
  namespace?: string;
  /** Switchboard GraphQL URL; when set, enables in-page (no-redirect) auth. */
  switchboardUrl?: string;
  /** Per-adapter wallet config; presence of a key enables that adapter. */
  adapters?: PHConnectRenownAdapters;
};

export type PHConnectSentry = {
  /** Sentry DSN URL. `null` disables Sentry entirely. */
  dsn?: string | null;
  /** Sentry environment label. */
  env?: string;
  /** Enable Sentry performance tracing. */
  tracing?: boolean;
};

export type PHConnectOpenPanel = {
  /** OpenPanel client id. Empty string (the default) disables OpenPanel. */
  clientId?: string;
  /** OpenPanel API URL, for self-hosted instances. */
  apiUrl?: string;
  /** Track UI events. */
  trackUiEvents?: boolean;
  /** Track document operations. */
  trackOperations?: boolean;
};

/**
 * Which reactor client Connect runs. One field selects all four shapes the
 * multi-reactor work standardized (each a peer `IReactorClient`):
 *  - `in-process`: the tab's own reactor on the main thread (PGlite in-tab).
 *  - `worker`:     the tab's own reactor in a SharedWorker (PGlite in-worker).
 *  - `remote`:     a pure client to a remote Switchboard reactor over GraphQL,
 *                  with NO local reactor and NO PGlite download.
 *  - `router`:     the tab's reactor (local) PLUS remote backends, routed.
 * Derived from the host's reactor backends (see reactorClientMode): a lone
 * remote backend -> `remote`, local+remote -> `router`, a worker backend ->
 * `worker`, else `in-process`. When unset, Connect falls back to the legacy
 * `reactorWorker`/`multiReactor` booleans, so existing configs are unchanged.
 */
export type PHReactorClientMode = "in-process" | "worker" | "remote" | "router";

export type PHConnectInstance = {
  namespace: string | null;
  reactorWorker: boolean;
  /** Routes through the in-browser reactor plus remote backends. Off by default. */
  multiReactor?: boolean;
  /** Explicit client selection; supersedes reactorWorker/multiReactor when set. */
  reactorClient?: PHReactorClientMode;
};

/** Each flag implies its predecessors, and must match the fleet Connect syncs
 * with or the two compute different replay outcomes. */
export type PHConnectReactorFeatureFlags = {
  /** Decide writes from the document stream instead of the meta cache. */
  documentDecisions?: boolean;
  /** Enforce the auth scope's policy at admission, replay, and read. */
  authEnforcement?: boolean;
  /** Let `{ group }` principals match, via the group documents' rosters. */
  authGroups?: boolean;
  /** Evaluate `where` / `match` conditions on grants. */
  authConditions?: boolean;
};

export type PHConnectReactor = {
  featureFlags?: PHConnectReactorFeatureFlags;
  /** What new documents are created as; `legacy` while peers predate v2-required documents. */
  createSignaturePolicy?: "legacy" | "v2-required";
  /** Stored documents at protocol versions this build does not run: refuse to boot, or keep them read-only. */
  unsupportedStoredDocuments?: "refuse" | "read-only";
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
  /** App-store-style categories. NOT authored under `connect.pwa` — derived at
   * build/runtime from the `category` field of every contributing
   * `powerhouse.manifest.json` (project + packages), unioned across them. */
  categories?: string[];
};

/**
 * PWA / service-worker overrides contributed by a package or the project.
 * Layered on top of Connect's hardcoded PWA defaults at build time. Scalar
 * fields deep-merge (later layer wins); every array member — the manifest
 * arrays (`icons`, `file_handlers`, and the derived `categories`) plus the
 * top-level `globPatterns`, `globIgnores`, `runtimeCaching` and
 * `navigateFallbackDenylist` — is additive (concatenated/unioned);
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

/** One entry of the host.js composition, projected into the served config as
 * DATA (module specifier + validated config) — the browser pipeline resolves
 * and runs them (rewire R3). Verb filtering happens at the runner. */
export type PHConnectCompositionEntry = {
  module: string;
  config?: Record<string, unknown>;
};

export type PHConnectRuntimeConfig = {
  /** The plugin composition this Connect boots with (rewire R3): present
   * only when the host file declares runner.plugins — absent means the
   * classic defaults. */
  composition?: PHConnectCompositionEntry[];
  branding?: PHConnectBranding;
  home?: PHConnectHome;
  app?: PHConnectApp;
  ai?: PHConnectAi;
  packages?: PHConnectPackages;
  drives?: PHConnectDrives;
  renown?: PHConnectRenown;
  sentry?: PHConnectSentry;
  openPanel?: PHConnectOpenPanel;
  instance?: PHConnectInstance;
  reactor?: PHConnectReactor;
  pwa?: PHConnectPwa;
};

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
