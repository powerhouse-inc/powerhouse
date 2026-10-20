// Single source of Connect's config (browser-safe, zod only). The PHConnect*
// types (../clis/types.ts) and the JSON Schema fragments Ajv consumes
// (./schema-fragments.ts) are derived from it.
//
// Never `.default(x)`: it fills values on parse; use `.meta({ default })`.
// Never `.meta({ id })`: it emits `$defs`, whose refs break once the fragment
// is embedded in another schema root.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Images, colours, lengths and backgrounds
// ---------------------------------------------------------------------------

const IMAGE_REF =
  "Image reference: a project-relative file path, a URL, or a data URI.";
const IMAGE_REF_OR_DEFAULT =
  "Image reference: a project-relative file path (resolved by the Connect build), a URL, or a data URI. null keeps the default.";

/** An image reference: a project-relative file path (the Connect build turns
 * it into a data URI or an emitted file), a URL, or a data URI. */
export const connectImageRefSchema = z.string().describe(IMAGE_REF);

/** An image reference where `null` (or omitting it) keeps the default. */
const optionalImageRef = (description = IMAGE_REF_OR_DEFAULT) =>
  connectImageRefSchema.nullable().optional().describe(description);

/** An image per colour scheme: one reference for both, or `{ light, dark }`
 * (`dark` falls back to `light`). */
export const connectSchemedImageSchema = z
  .union([
    connectImageRefSchema,
    z.strictObject({
      light: connectImageRefSchema,
      dark: connectImageRefSchema.nullable().optional(),
    }),
  ])
  .describe(
    "One image for both colour schemes, or { light, dark } (dark falls back to light).",
  );

/** A CSS colour per colour scheme (`dark` falls back to `light`). */
export const connectSchemedColorSchema = z.union([
  z.string(),
  z.strictObject({
    light: z.string(),
    dark: z.string().nullable().optional(),
  }),
]);

/** A CSS length: a number is px, a string is passed through as written. */
export const connectLengthSchema = z.union([z.number(), z.string()]);

const optionalLength = () =>
  connectLengthSchema
    .nullable()
    .optional()
    .describe(
      'A CSS length: a number is px; a string is used as written ("40%", "min(55%, 880px)", "calc(50% - 120px)").',
    );

/** Distances to the four edges; each is optional. */
export const connectEdgesSchema = z.strictObject({
  top: optionalLength(),
  right: optionalLength(),
  bottom: optionalLength(),
  left: optionalLength(),
});

/** One image of a decorated pane, absolutely positioned inside it. */
export const connectBackgroundLayerSchema = z
  .strictObject({
    src: connectSchemedImageSchema,
    position: connectEdgesSchema
      .nullable()
      .optional()
      .describe(
        "Distances to the pane's edges; at most one per axis. Omitted: centred both ways.",
      ),
    width: optionalLength(),
    height: optionalLength(),
    minWidth: optionalLength(),
    minHeight: optionalLength(),
    maxWidth: optionalLength(),
    maxHeight: optionalLength(),
    opacity: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .optional()
      .describe("0 to 1 (default 1)."),
    fade: connectEdgesSchema
      .nullable()
      .optional()
      .describe(
        "Feather depth per edge, fading the layer into the page colour.",
      ),
  })
  .describe(
    "An image laid over the page, absolutely positioned: the edges set in `position` pin it, an axis with neither edge set is centred.",
  );

/** A decorated pane: the page colour and the images laid over it. */
export const connectBackgroundLayersSchema = z.strictObject({
  color: connectSchemedColorSchema
    .nullable()
    .optional()
    .describe(
      "The page colour, or { light, dark }. Omitted or null: the theme's page background.",
    ),
  layers: z
    .array(connectBackgroundLayerSchema)
    .describe("Painted in order; the first is at the back."),
});

/** A pane's background: layers over a page colour, or one image as
 * shorthand for a single layer pinned bottom-right. */
export const connectBackgroundSchema = z
  .union([connectImageRefSchema, connectBackgroundLayersSchema])
  .describe(
    "Layered images over a page colour, or a single image pinned to the bottom-right corner. null keeps the default.",
  );

// ---------------------------------------------------------------------------
// branding, home
// ---------------------------------------------------------------------------

/** The loading image and the motion applied to it. */
export const connectLoaderSchema = z.strictObject({
  src: connectImageRefSchema,
  animation: z
    .enum(["pulse", "spin", "none"])
    .nullable()
    .optional()
    .describe("Motion applied to the image (default pulse)."),
  size: z
    .number()
    .min(16)
    .max(512)
    .nullable()
    .optional()
    .describe(
      "Rendered width in CSS pixels (default 96); the height follows the image.",
    ),
});

/** `connect.branding`: Connect's identity and look. */
export const connectBrandingSchema = z
  .strictObject({
    appName: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Browser tab title, installed-app name and in-app brand text. null or omitted: 'Powerhouse Connect'.",
      ),
    icon: optionalImageRef(
      "App icon master (1024x1024 PNG recommended, or an SVG). The favicons and installed-app icons are found next to it as <name>_16x16.png, _32x32, _64x64, _192x192 and _512x512; the 64 px one is the in-app logo. null or omitted: Connect's icon.",
    ),
    favicon: z
      .string()
      .nullable()
      .optional()
      .describe(
        "The browser tab icon: a file (.ico, .svg or .png) relative to the project, served and built as icon.ico. A build input; the built runtime config leaves it out. `ph connect build --favicon` wins over it.",
      ),
    loader: z
      .union([connectImageRefSchema, connectLoaderSchema])
      .nullable()
      .optional()
      .describe(
        'The loading image (first paint, app start, drive and editor loading). A path gets a gentle pulse; { src, animation, size } says otherwise, with animation "none" for an image that animates itself (animated SVG, GIF or WebP). null or omitted: Connect\'s animated logo.',
      ),
  })
  .describe(
    "App identity and visual branding. Every field is optional; null means the default.",
  );

/** `connect.home`: the home screen (the generic chrome's landing page). */
export const connectHomeSchema = z
  .strictObject({
    background: connectBackgroundSchema
      .nullable()
      .optional()
      .describe(
        "The home screen's background: { color, layers } with each image positioned and sized, or one image pinned bottom-right. null or omitted: the bundled gradient.",
      ),
  })
  .describe("The home screen (the generic chrome's landing page).");

// ---------------------------------------------------------------------------
// app, ai, packages
// ---------------------------------------------------------------------------

export const connectAppSchema = z
  .strictObject({
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional().meta({
      description:
        "Log level applied by Connect's logger at boot. Affects browser-side output only.",
      default: "info",
    }),
    basePath: z.string().optional().meta({
      description:
        "Base path Connect is mounted under (e.g. '/connect' for subpath deploys). Normalised at runtime to start and end with '/'. Defaults to the build-time BASE_URL.",
      default: "/",
    }),
    offline: z.boolean().optional().meta({
      description:
        "When true (default), the build emits a precaching service worker so Connect's app shell works offline, and the SPA registers it at boot. Set false to opt this deployment out: no service worker is built, the SPA skips registration, and any previously-installed worker is unregistered.",
      default: true,
    }),
    studioMode: z.boolean().optional().meta({
      description:
        "Studio mode. Enables builder-only capabilities: Connect loads the vetra package and exposes DocumentModel (and vetra spec types) as creatable documents. Forced on by `ph vetra` / `ph connect studio`; false by default.",
      default: false,
    }),
    workflowsEnabled: z
      .boolean()
      .optional()
      .describe(
        "Powerhouse workflows in Connect. When true the tab loads the @powerhousedao/workflow package (workflow + connection documents, their editors and Workflow Studio) and the reactor worker registers its document models. Falls back to the top-level `workflows.enabled`; set it to override that for Connect. Independent of studioMode. False when neither is set.",
      ),
  })
  .describe("Top-level Connect application behaviour.");

export const connectAiSchema = z
  .strictObject({
    assistantEnabled: z.boolean().optional().meta({
      description:
        "When true, Connect mounts the in-browser AI assistant (bottom-right chat FAB that talks to a user-configured OpenAI-compatible endpoint and acts on the reactor). Disabled by default.",
      default: false,
    }),
  })
  .describe("AI assistant (chat) behaviour.");

export const connectPackagesSchema = z
  .strictObject({
    externalEnabled: z.boolean().optional().meta({
      description:
        "When false, Connect refuses to load any package that wasn't bundled at build time. Affirmative replacement for the legacy PH_CONNECT_EXTERNAL_PACKAGES_DISABLED env var.",
      default: true,
    }),
    liveReload: z.boolean().optional().meta({
      description:
        "When true, Connect subscribes to the static-mode `/__packages` SSE channel so live publishes flow into the running tab without a page reload. Only works under hosting that serves this channel (e.g. ph-clint static mode).",
      default: false,
    }),
  })
  .describe(
    "Runtime behaviour for the Connect package manager (separate from top-level `packages[]`, which lists which packages to load).",
  );

// ---------------------------------------------------------------------------
// drives
// ---------------------------------------------------------------------------

const EXPLORER_ICONS_DESCRIPTION =
  "The drive explorer's icons (the generic plugin's); each null keeps the built-in icon.";

/** The drive explorer's icons: the generic chrome's, owned by the generic
 * plugin. Each `null` keeps the built-in icon. */
export const connectExplorerIconsSchema = z
  .strictObject({
    localDrive: optionalImageRef("Local drives without an icon of their own."),
    remoteDrive: optionalImageRef(
      "Remote drives without an icon of their own.",
    ),
    folder: optionalImageRef("Folders."),
    document: optionalImageRef(
      "Documents whose type has no icon in `documents`.",
    ),
    documents: z
      .record(z.string(), connectImageRefSchema)
      .nullable()
      .optional()
      .describe('Per document type, e.g. "acme/invoice".'),
  })
  .describe(EXPLORER_ICONS_DESCRIPTION);

export const connectDefaultDriveRemoteSchema = z.strictObject({
  url: z.string(),
  name: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});

export const connectDefaultDriveLocalSchema = z.strictObject({
  local: z
    .literal(true)
    .describe(
      "Discriminator: this entry is a local drive created on first boot.",
    ),
  id: z
    .string()
    .describe(
      "Stable drive id. The drive is created with this id on first boot and is not re-created on later boots.",
    ),
  name: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  app: z
    .string()
    .optional()
    .describe("Drive app (preferred editor) to open on the drive."),
});

export const connectDefaultDriveSchema = z.union([
  connectDefaultDriveRemoteSchema,
  connectDefaultDriveLocalSchema,
]);

/** `connect.drives.sections.{remote,local}`: three affirmative toggles. */
export const connectDriveSectionSchema = z
  .strictObject({
    enabled: z.boolean().optional().meta({
      description: "When false, the section is hidden in the sidebar.",
      default: true,
    }),
    allowAdd: z.boolean().optional().meta({
      description:
        "When false, the section's 'add drive' affordance is hidden.",
      default: true,
    }),
    allowDelete: z.boolean().optional().meta({
      description:
        "When false, drives in this section cannot be deleted from the UI.",
      default: true,
    }),
  })
  .describe(
    "Visibility and add/delete affordances for a drive section in the sidebar.",
  );

export const connectDriveSectionsSchema = z
  .strictObject({
    remote: connectDriveSectionSchema.optional(),
    local: connectDriveSectionSchema.optional(),
  })
  .describe(
    "Per-section visibility and affordance toggles. `remote` covers what was historically split into 'public' + 'cloud'; `local` is browser-local drives.",
  );

/** Mirrors DRIVES_PRESERVE_STRATEGIES (../clis/constants.ts, which imports
 * node: modules, so it is not imported here); a test pins the two. */
export const connectDrivePreserveStrategySchema = z.enum([
  "preserve-all",
  "preserve-by-url-and-detach",
]);

export const connectDrivesSchema = z
  .strictObject({
    allowAddDrive: z.boolean().optional().meta({
      description:
        "When false, the SPA hides the 'add drive' affordance entirely (top-level). Per-section overrides live in `sections.{remote,local}.allowAdd`.",
      default: true,
    }),
    defaultDrives: z.array(connectDefaultDriveSchema).optional().meta({
      description:
        "Drives the SPA auto-connects to on first load. Each entry is either a remote drive (a URL, with optional name/icon overrides) or a local drive (created locally on first boot, with a stable id and optional name/icon/app).",
      default: [],
    }),
    preserveStrategy: connectDrivePreserveStrategySchema
      .optional()
      .describe(
        "Strategy applied when defaultDrives change between deploys. 'preserve-all' keeps user-added drives untouched; 'preserve-by-url-and-detach' detaches removed default drives. No schema default — opt-in only.",
      ),
    sections: connectDriveSectionsSchema.optional(),
    icons: connectExplorerIconsSchema
      .nullable()
      .optional()
      .describe(EXPLORER_ICONS_DESCRIPTION),
  })
  .describe("Default-drive and add-drive UI behaviour.");

// ---------------------------------------------------------------------------
// renown, sentry, openPanel
// ---------------------------------------------------------------------------

export const connectRenownRainbowAdapterSchema = z
  .strictObject({
    walletConnectProjectId: z
      .string()
      .optional()
      .describe(
        "WalletConnect project id; required for this adapter to function.",
      ),
    infuraProjectId: z
      .string()
      .optional()
      .describe("Optional Infura project id used to build RPC transports."),
  })
  .describe("wagmi + RainbowKit external-wallet adapter config.");

export const connectRenownPrivyAdapterSchema = z
  .strictObject({
    appId: z
      .string()
      .optional()
      .describe("Privy application id; required for this adapter to function."),
    clientId: z.string().optional().describe("Optional Privy client id."),
    methods: z
      .array(z.string())
      .optional()
      .describe(
        "Login methods this adapter offers; default per adapter when omitted.",
      ),
  })
  .describe("Privy embedded/social adapter config.");

export const connectRenownAdaptersSchema = z
  .strictObject({
    rainbow: connectRenownRainbowAdapterSchema.optional(),
    privy: connectRenownPrivyAdapterSchema.optional(),
  })
  .describe(
    "Per-adapter wallet config for in-page auth. Presence of an adapter key enables it; omit or leave empty for redirect-only behaviour.",
  );

export const connectRenownSchema = z
  .strictObject({
    url: z.string().optional().meta({
      description: "Renown auth service URL.",
      default: "https://www.renown.id",
    }),
    networkId: z.string().optional().meta({
      description: "CAIP-2 network namespace (e.g. 'eip155').",
      default: "eip155",
    }),
    chainId: z.number().optional().meta({
      description: "CAIP-2 chain reference within the network namespace.",
      default: 1,
    }),
    namespace: z
      .string()
      .optional()
      .describe(
        "Renown localStorage namespace; share it across Connects to share login.",
      ),
    switchboardUrl: z
      .string()
      .optional()
      .describe(
        "Switchboard GraphQL URL. When set, Connect enables in-page (no-redirect) Renown sign-in; otherwise it falls back to the redirect flow via `url`.",
      ),
    adapters: connectRenownAdaptersSchema.optional(),
  })
  .describe("Renown identity / authentication coordinates.");

export const connectSentrySchema = z
  .strictObject({
    dsn: z.string().nullable().optional().meta({
      description:
        "Sentry DSN URL. `null` disables Sentry entirely; the SPA never loads the Sentry SDK chunk.",
      default: null,
    }),
    env: z.string().optional().meta({
      description:
        "Sentry environment label, surfaced as the `environment` tag on every event.",
      default: "dev",
    }),
    tracing: z.boolean().optional().meta({
      description: "Enable Sentry performance tracing.",
      default: false,
    }),
  })
  .describe(
    "Sentry error-tracking coordinates. Set `dsn` to enable Sentry; leave `dsn` null to disable. The Sentry release tag stays build-time (stamped via Vite's `define` from WORKSPACE_VERSION) so it always matches the sourcemaps uploaded by CI.",
  );

export const connectOpenPanelSchema = z
  .strictObject({
    clientId: z.string().optional().meta({
      description:
        "OpenPanel client id. Empty string disables OpenPanel entirely.",
      default: "",
    }),
    apiUrl: z
      .string()
      .optional()
      .describe(
        "OpenPanel API URL for self-hosted instances (e.g. 'https://openpanel.example/api'). Omit to use OpenPanel's hosted API.",
      ),
    trackUiEvents: z.boolean().optional().meta({
      description: "Track UI events.",
      default: true,
    }),
    trackOperations: z.boolean().optional().meta({
      description: "Track document operations.",
      default: true,
    }),
  })
  .describe(
    "OpenPanel product analytics. Set `clientId` to enable; an empty `clientId` disables it. Events are only sent after the user accepts analytics cookies. Takes precedence over the build-time PH_CONNECT_OPENPANEL_* env vars.",
  );

// ---------------------------------------------------------------------------
// instance, reactor
// ---------------------------------------------------------------------------

/** Which reactor client Connect runs (see PHReactorClientMode). */
export const connectReactorClientModeSchema = z.enum([
  "in-process",
  "worker",
  "remote",
  "router",
]);

export const connectInstanceSchema = z
  .strictObject({
    namespace: z.string().nullable().meta({
      description:
        "Explicit storage/SharedWorker namespace for this instance. `null` derives it from the base path (and, later, the configured endpoint), so root deployments stay byte-identical.",
      default: null,
    }),
    reactorWorker: z.boolean().meta({
      description:
        "Host the reactor in a shared worker instead of on the main thread. Off by default; the main-thread reactor stays the proven path until cutover is verified. Packaged deployments load the worker from the prebuilt bundle `ph connect build` emits under __reactor_worker__/ (the dev server builds it lazily at the same path); when that bundle is absent the feature reports itself unavailable instead of starting a worker that cannot load.",
      default: false,
    }),
    multiReactor: z.boolean().optional().meta({
      description:
        "Opt-in multi-reactor routing. When on, Connect routes through the in-browser reactor plus remote backends instead of the single in-browser reactor. Off by default; the single-reactor path is unchanged.",
      default: false,
    }),
  })
  .describe(
    "Per-instance identity. Lets one origin host multiple isolated Connect instances, each with its own storage + SharedWorker namespace.",
  );

export const connectReactorFeatureFlagsSchema = z
  .strictObject({
    documentDecisions: z.boolean().optional().meta({
      description:
        "Decide writes from the document stream rather than the document meta cache, so a backdated deletion denies the operations that sort after it.",
      default: false,
    }),
    authEnforcement: z.boolean().optional().meta({
      description:
        "Enforce the auth scope's policy at admission, replay, and read. Requires documentDecisions.",
      default: false,
    }),
    authGroups: z.boolean().optional().meta({
      description:
        "Let `{ group }` principals match against the rosters of the group documents a policy names. Requires authEnforcement.",
      default: false,
    }),
    authConditions: z.boolean().optional().meta({
      description:
        "Evaluate `where` and `match` conditions on grants. Requires authGroups. Do not enable on a fleet `preflight:auth` reports as crossing a reducer version.",
      default: false,
    }),
  })
  .describe(
    "Enforcement flags. Each implies its predecessors, and the reactor refuses to boot on a set that names a later flag without an earlier one. These are consensus settings: a Connect syncing with a fleet must carry the same flags the fleet does, or the two reach different replay outcomes for the same history and diverge.",
  );

export const connectReactorSchema = z
  .strictObject({
    featureFlags: connectReactorFeatureFlagsSchema.optional(),
    createSignaturePolicy: z.enum(["legacy", "v2-required"]).optional().meta({
      description:
        "What new documents are created as. `v2-required` documents accept only v2 action signatures and take content-addressed ids; set `legacy` while any peer Connect syncs with predates them. Existing documents keep their policy.",
      default: "v2-required",
    }),
    unsupportedStoredDocuments: z
      .enum(["refuse", "read-only"])
      .optional()
      .meta({
        description:
          "What the reactor does when this browser's store holds documents at protocol versions this build does not run. `refuse` fails the boot and names the versions; `read-only` boots and keeps those documents read-only.",
        default: "refuse",
      }),
  })
  .describe(
    "Settings for the reactor Connect runs in the browser, on the main thread or in the shared worker alike.",
  );

// ---------------------------------------------------------------------------
// pwa
// ---------------------------------------------------------------------------

/** A runtime-caching / denylist URL match. A string is handed to Workbox
 * verbatim; `{ source, flags }` is rebuilt into a RegExp at build time. */
export const connectPwaUrlPatternSchema = z
  .union([
    z.string(),
    z
      .strictObject({
        source: z.string().describe("RegExp source."),
        flags: z.string().optional().describe("RegExp flags (e.g. 'i')."),
      })
      // Not expressible in JSON Schema, so only the zod path checks it.
      .refine(
        (p) => {
          try {
            new RegExp(p.source, p.flags);
            return true;
          } catch {
            return false;
          }
        },
        { message: "source/flags do not compile to a valid RegExp" },
      ),
  ])
  .describe(
    "URL match. A string is matched verbatim by Workbox; { source, flags } is rebuilt into a RegExp at build time.",
  );

export const connectPwaCacheStrategySchema = z.enum([
  "CacheFirst",
  "CacheOnly",
  "NetworkFirst",
  "NetworkOnly",
  "StaleWhileRevalidate",
]);

/** Serialisable subset of a Workbox `RuntimeCaching` rule. */
export const connectPwaRuntimeCachingSchema = z.strictObject({
  urlPattern: connectPwaUrlPatternSchema,
  handler: connectPwaCacheStrategySchema,
  method: z.enum(["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"]).optional(),
  options: z
    .strictObject({
      cacheName: z.string().optional(),
      networkTimeoutSeconds: z
        .number()
        .optional()
        .describe(
          "Seconds a NetworkFirst rule waits for the network before falling back to the cache.",
        ),
      expiration: z
        .strictObject({
          maxEntries: z.number().optional(),
          maxAgeSeconds: z.number().optional(),
        })
        .optional(),
      cacheableResponse: z
        .strictObject({
          statuses: z.array(z.number()).optional(),
          headers: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const connectPwaIconSchema = z.strictObject({
  src: z.string(),
  sizes: z.string().optional(),
  type: z.string().optional(),
  purpose: z.string().optional(),
});

/** A File Handling API entry. No `action`: every handler opens at Connect's
 * app root, because consuming launched files needs Connect's own code. */
export const connectPwaFileHandlerSchema = z.strictObject({
  accept: z
    .record(
      z.string(),
      z.array(z.string().regex(/^\./, "file extensions must start with '.'")),
    )
    .describe(
      "MIME type → file extensions. Each extension must start with '.'; browsers ignore entries without it.",
    ),
  icons: z
    .array(connectPwaIconSchema)
    .optional()
    .describe("OS-level file-type icons."),
  launch_type: z.enum(["single-client", "multiple-clients"]).optional(),
});

/** Web-app-manifest fields a package or project may override. */
export const connectPwaManifestSchema = z
  .strictObject({
    name: z.string().optional(),
    short_name: z.string().optional(),
    description: z.string().optional(),
    theme_color: z.string().optional(),
    background_color: z.string().optional(),
    display: z
      .enum(["fullscreen", "standalone", "minimal-ui", "browser"])
      .optional(),
    start_url: z.string().optional(),
    scope: z.string().optional(),
    icons: z
      .array(connectPwaIconSchema)
      .optional()
      .describe(
        "Icons appended to the built-in set and de-duplicated by (src, sizes, purpose).",
      ),
    file_handlers: z
      .array(connectPwaFileHandlerSchema)
      .optional()
      .describe(
        "File associations appended after Connect's built-in .phd/.phdm handler and de-duplicated on the whole entry. Entries only declare accepted types; there is no action field, because opening the files requires Connect's own runtime handling, so every handler opens at the app root.",
      ),
    launch_handler: z
      .strictObject({
        client_mode: z.enum([
          "auto",
          "focus-existing",
          "navigate-existing",
          "navigate-new",
        ]),
      })
      .optional()
      .describe(
        "How the OS launches the app for handled files/links. Connect defaults to focus-existing.",
      ),
  })
  .describe("Web-app-manifest field overrides.");

const pwaShape = {
  globPatterns: z
    .array(z.string())
    .optional()
    .describe("Extra Workbox precache globs, unioned with the built-ins."),
  globIgnores: z
    .array(z.string())
    .optional()
    .describe("Extra precache ignore globs, unioned with the built-ins."),
  maximumFileSizeToCacheInBytes: z
    .number()
    .optional()
    .describe(
      "Raise the precache file-size ceiling. The max across all contributors wins, so no contributor can shrink another's limit.",
    ),
  runtimeCaching: z
    .array(connectPwaRuntimeCachingSchema)
    .optional()
    .describe(
      "Runtime-caching rules appended after the built-in rules. Workbox is first-match-wins, so these cannot override a built-in rule matching the same URL.",
    ),
  navigateFallbackDenylist: z
    .array(connectPwaUrlPatternSchema)
    .optional()
    .describe(
      "Extra SPA navigate-fallback denylist patterns, unioned with the built-ins.",
    ),
};

const PWA_DESCRIPTION =
  "Progressive-web-app / service-worker overrides, layered on Connect's built-in PWA defaults at build time. Scalar fields deep-merge (this layer wins); the array members (icons, file_handlers, globs, runtimeCaching and denylist patterns) are additive; maximumFileSizeToCacheInBytes takes the max across contributors. (categories is not set here — it is derived from the manifest's category field.) Only applied when connect.app.offline is true.";

/** `connect.pwa` as authored. */
export const connectPwaSchema = z
  .strictObject({ manifest: connectPwaManifestSchema.optional(), ...pwaShape })
  .describe(PWA_DESCRIPTION);

// ---------------------------------------------------------------------------
// The connect block
// ---------------------------------------------------------------------------

/**
 * The `connect` block as authored: powerhouse.config.json's `connect`, the
 * connect host's `config`, and `ph connect config` writes. Every field is
 * optional; omit the section entirely for default behaviour.
 */
export const connectConfigSchema = z
  .strictObject({
    branding: connectBrandingSchema.optional(),
    home: connectHomeSchema.optional(),
    app: connectAppSchema.optional(),
    ai: connectAiSchema.optional(),
    packages: connectPackagesSchema.optional(),
    drives: connectDrivesSchema.optional(),
    renown: connectRenownSchema.optional(),
    sentry: connectSentrySchema.optional(),
    openPanel: connectOpenPanelSchema.optional(),
    instance: connectInstanceSchema.optional(),
    reactor: connectReactorSchema.optional(),
    pwa: connectPwaSchema.optional(),
  })
  .describe(
    "Connect-specific UI customisations. All fields optional; omit the section entirely for default behaviour.",
  );

export type ConnectConfig = z.output<typeof connectConfigSchema>;
export type ConnectConfigInput = z.input<typeof connectConfigSchema>;

// ---------------------------------------------------------------------------
// The served runtime config: authored fields plus what is derived or
// projected. These fields are never authored, so the authored schema (and
// the JSON Schema fragment emitted from it) rejects them.
// ---------------------------------------------------------------------------

/** One entry of the host.js composition, projected into the served config as
 * data (module specifier + validated config). */
export const connectCompositionEntrySchema = z.strictObject({
  module: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
});

/** `instance` plus `reactorClient`, derived from the host's reactor backends. */
export const connectRuntimeInstanceSchema = connectInstanceSchema.extend({
  reactorClient: connectReactorClientModeSchema.optional(),
});

/** The manifest plus `categories`, derived from contributors' `category`. */
export const connectRuntimePwaManifestSchema = connectPwaManifestSchema.extend({
  categories: z.array(z.string()).optional(),
});

export const connectRuntimePwaSchema = connectPwaSchema.extend({
  manifest: connectRuntimePwaManifestSchema.optional(),
});

/** The served `connect` block (runtime powerhouse.config.json). */
export const connectRuntimeConfigSchema = connectConfigSchema.extend({
  composition: z.array(connectCompositionEntrySchema).optional(),
  instance: connectRuntimeInstanceSchema.optional(),
  pwa: connectRuntimePwaSchema.optional(),
});

export type ConnectRuntimeConfig = z.output<typeof connectRuntimeConfigSchema>;
