// Single source of truth for JSON Schema shapes shared between the source
// PowerhouseConfig schema (packages/shared/clis/source-config-schema.ts) and
// the runtime RuntimePowerhouseConfig schema
// (packages/builder-tools/connect-utils/runtime-config-schema.ts).
//
// When a shared shape changes, edit it here — both schemas pick it up.

export const powerhousePackageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["packageName"],
  properties: {
    packageName: {
      type: "string",
      description: "Fully qualified npm package name (e.g. @scope/name).",
    },
    version: {
      type: "string",
      description: "Exact version (registry providers) or omit to take latest.",
    },
    provider: {
      type: "string",
      enum: ["npm", "github", "local", "registry"],
      description: "Where Connect should resolve the package from at runtime.",
    },
    url: {
      type: "string",
      description:
        "Override URL for non-registry providers (e.g. github tarball).",
    },
  },
} as const;

// Reusable shape for `connect.drives.sections.{remote,local}` — three
// affirmative-named toggles per section. The legacy public+cloud sections
// have been collapsed into a single `remote`.
const driveSectionSchema = {
  type: "object",
  additionalProperties: false,
  description:
    "Visibility and add/delete affordances for a drive section in the sidebar.",
  properties: {
    enabled: {
      type: "boolean",
      description: "When false, the section is hidden in the sidebar.",
      default: true,
    },
    allowAdd: {
      type: "boolean",
      description:
        "When false, the section's 'add drive' affordance is hidden.",
      default: true,
    },
    allowDelete: {
      type: "boolean",
      description:
        "When false, drives in this section cannot be deleted from the UI.",
      default: true,
    },
  },
} as const;

// Reusable shape for a runtime-caching / denylist URL match. A string is
// handed to Workbox verbatim; `{ source, flags }` is rebuilt into a RegExp at
// build time. Function patterns aren't serialisable and can't be expressed
// from config — only Connect's built-in rules use them (see the runtime-caching
// rules in builder-tools' connect-utils/service-worker/service-worker.ts).
const pwaUrlPatternSchema = {
  description:
    "URL match. A string is matched verbatim by Workbox; { source, flags } is rebuilt into a RegExp at build time.",
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      required: ["source"],
      properties: {
        source: { type: "string", description: "RegExp source." },
        flags: { type: "string", description: "RegExp flags (e.g. 'i')." },
      },
    },
  ],
} as const;

// Reusable web-app-manifest icon shape (manifest.icons and file-handler icons).
const pwaIconSchema = {
  type: "object",
  additionalProperties: false,
  required: ["src"],
  properties: {
    src: { type: "string" },
    sizes: { type: "string" },
    type: { type: "string" },
    purpose: { type: "string" },
  },
} as const;

export const phConnectRuntimeConfigSchema = {
  type: "object",
  additionalProperties: false,
  description:
    "Connect-specific UI customisations. All fields optional; omit the section entirely for default behaviour.",
  properties: {
    branding: {
      type: "object",
      additionalProperties: false,
      description: "App identity and visual branding.",
      properties: {
        appName: {
          type: "string",
          description:
            "Browser tab title and any in-app brand text. Defaults to 'Powerhouse Connect'.",
        },
        homeBackground: {
          type: ["string", "null"],
          description:
            "Hero image on the empty home screen. URL or path to override; null or omitted uses the bundled default image.",
        },
      },
    },
    app: {
      type: "object",
      additionalProperties: false,
      description: "Top-level Connect application behaviour.",
      properties: {
        logLevel: {
          type: "string",
          enum: ["debug", "info", "warn", "error"],
          description:
            "Log level applied by Connect's logger at boot. Affects browser-side output only.",
          default: "info",
        },
        basePath: {
          type: "string",
          description:
            "Base path Connect is mounted under (e.g. '/connect' for subpath deploys). Normalised at runtime to start and end with '/'. Defaults to the build-time BASE_URL.",
          default: "/",
        },
        offline: {
          type: "boolean",
          description:
            "When true (default), the build emits a precaching service worker so Connect's app shell works offline, and the SPA registers it at boot. Set false to opt this deployment out: no service worker is built, the SPA skips registration, and any previously-installed worker is unregistered.",
          default: true,
        },
        studioMode: {
          type: "boolean",
          description:
            "Studio mode. Enables builder-only capabilities: Connect loads the vetra package and exposes DocumentModel (and vetra spec types) as creatable documents. Forced on by `ph vetra` / `ph connect studio`; false by default.",
          default: false,
        },
      },
    },
    packages: {
      type: "object",
      additionalProperties: false,
      description:
        "Runtime behaviour for the Connect package manager (separate from top-level `packages[]`, which lists which packages to load).",
      properties: {
        externalEnabled: {
          type: "boolean",
          description:
            "When false, Connect refuses to load any package that wasn't bundled at build time. Affirmative replacement for the legacy PH_CONNECT_EXTERNAL_PACKAGES_DISABLED env var.",
          default: true,
        },
        liveReload: {
          type: "boolean",
          description:
            "When true, Connect subscribes to the static-mode `/__packages` SSE channel so live publishes flow into the running tab without a page reload. Only works under hosting that serves this channel (e.g. ph-clint static mode).",
          default: false,
        },
      },
    },
    drives: {
      type: "object",
      additionalProperties: false,
      description: "Default-drive and add-drive UI behaviour.",
      properties: {
        allowAddDrive: {
          type: "boolean",
          description:
            "When false, the SPA hides the 'add drive' affordance entirely (top-level). Per-section overrides live in `sections.{remote,local}.allowAdd`.",
          default: true,
        },
        defaultDrives: {
          type: "array",
          description:
            "Drives the SPA auto-connects to on first load. Each must specify a URL; name and icon are optional overrides.",
          default: [],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["url"],
            properties: {
              url: { type: "string" },
              name: { type: ["string", "null"] },
              icon: { type: ["string", "null"] },
            },
          },
        },
        preserveStrategy: {
          type: "string",
          enum: ["preserve-all", "preserve-by-url-and-detach"],
          description:
            "Strategy applied when defaultDrives change between deploys. 'preserve-all' keeps user-added drives untouched; 'preserve-by-url-and-detach' detaches removed default drives. No schema default — opt-in only.",
        },
        sections: {
          type: "object",
          additionalProperties: false,
          description:
            "Per-section visibility and affordance toggles. `remote` covers what was historically split into 'public' + 'cloud'; `local` is browser-local drives.",
          properties: {
            remote: driveSectionSchema,
            local: driveSectionSchema,
          },
        },
      },
    },
    renown: {
      type: "object",
      additionalProperties: false,
      description: "Renown identity / authentication coordinates.",
      properties: {
        url: {
          type: "string",
          description: "Renown auth service URL.",
          default: "https://www.renown.id",
        },
        networkId: {
          type: "string",
          description: "CAIP-2 network namespace (e.g. 'eip155').",
          default: "eip155",
        },
        chainId: {
          type: "number",
          description: "CAIP-2 chain reference within the network namespace.",
          default: 1,
        },
      },
    },
    sentry: {
      type: "object",
      additionalProperties: false,
      description:
        "Sentry error-tracking coordinates. Set `dsn` to enable Sentry; leave `dsn` null to disable. The Sentry release tag stays build-time (stamped via Vite's `define` from WORKSPACE_VERSION) so it always matches the sourcemaps uploaded by CI.",
      properties: {
        dsn: {
          type: ["string", "null"],
          description:
            "Sentry DSN URL. `null` disables Sentry entirely; the SPA never loads the Sentry SDK chunk.",
          default: null,
        },
        env: {
          type: "string",
          description:
            "Sentry environment label, surfaced as the `environment` tag on every event.",
          default: "dev",
        },
        tracing: {
          type: "boolean",
          description: "Enable Sentry performance tracing.",
          default: false,
        },
      },
    },
    instance: {
      type: "object",
      additionalProperties: false,
      required: ["namespace", "reactorWorker"],
      description:
        "Per-instance identity. Lets one origin host multiple isolated Connect instances, each with its own storage + SharedWorker namespace.",
      properties: {
        namespace: {
          type: ["string", "null"],
          description:
            "Explicit storage/SharedWorker namespace for this instance. `null` derives it from the base path (and, later, the configured endpoint), so root deployments stay byte-identical.",
          default: null,
        },
        reactorWorker: {
          type: "boolean",
          description:
            "Host the reactor in a shared worker instead of on the main thread. Off by default; the main-thread reactor stays the proven path until cutover is verified.",
          default: false,
        },
      },
    },
    pwa: {
      type: "object",
      additionalProperties: false,
      description:
        "Progressive-web-app / service-worker overrides, layered on Connect's built-in PWA defaults at build time. Scalar fields deep-merge (this layer wins); the array members (icons, file_handlers, globs, runtimeCaching and denylist patterns) are additive; maximumFileSizeToCacheInBytes takes the max across contributors. (categories is not set here — it is derived from the manifest's category field.) Only applied when connect.app.offline is true.",
      properties: {
        manifest: {
          type: "object",
          additionalProperties: false,
          description: "Web-app-manifest field overrides.",
          properties: {
            name: { type: "string" },
            short_name: { type: "string" },
            description: { type: "string" },
            theme_color: { type: "string" },
            background_color: { type: "string" },
            display: {
              type: "string",
              enum: ["fullscreen", "standalone", "minimal-ui", "browser"],
            },
            start_url: { type: "string" },
            scope: { type: "string" },
            icons: {
              type: "array",
              description:
                "Icons appended to the built-in set and de-duplicated by (src, sizes, purpose).",
              items: pwaIconSchema,
            },
            file_handlers: {
              type: "array",
              description:
                "File associations appended after Connect's built-in .phd/.phdm handler and de-duplicated on the whole entry. Entries only declare accepted types; there is no action field, because opening the files requires Connect's own runtime handling, so every handler opens at the app root.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["accept"],
                properties: {
                  accept: {
                    type: "object",
                    description:
                      "MIME type → file extensions. Each extension must start with '.'; browsers ignore entries without it.",
                    additionalProperties: {
                      type: "array",
                      items: { type: "string", pattern: "^\\." },
                    },
                  },
                  icons: {
                    type: "array",
                    description: "OS-level file-type icons.",
                    items: pwaIconSchema,
                  },
                  launch_type: {
                    type: "string",
                    enum: ["single-client", "multiple-clients"],
                  },
                },
              },
            },
            launch_handler: {
              type: "object",
              additionalProperties: false,
              required: ["client_mode"],
              description:
                "How the OS launches the app for handled files/links. Connect defaults to focus-existing.",
              properties: {
                client_mode: {
                  type: "string",
                  enum: [
                    "auto",
                    "focus-existing",
                    "navigate-existing",
                    "navigate-new",
                  ],
                },
              },
            },
          },
        },
        globPatterns: {
          type: "array",
          items: { type: "string" },
          description:
            "Extra Workbox precache globs, unioned with the built-ins.",
        },
        globIgnores: {
          type: "array",
          items: { type: "string" },
          description:
            "Extra precache ignore globs, unioned with the built-ins.",
        },
        maximumFileSizeToCacheInBytes: {
          type: "number",
          description:
            "Raise the precache file-size ceiling. The max across all contributors wins, so no contributor can shrink another's limit.",
        },
        runtimeCaching: {
          type: "array",
          description:
            "Runtime-caching rules appended after the built-in rules. Workbox is first-match-wins, so these cannot override a built-in rule matching the same URL.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["urlPattern", "handler"],
            properties: {
              urlPattern: pwaUrlPatternSchema,
              handler: {
                type: "string",
                enum: [
                  "CacheFirst",
                  "CacheOnly",
                  "NetworkFirst",
                  "NetworkOnly",
                  "StaleWhileRevalidate",
                ],
              },
              method: {
                type: "string",
                enum: ["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"],
              },
              options: {
                type: "object",
                additionalProperties: false,
                properties: {
                  cacheName: { type: "string" },
                  networkTimeoutSeconds: {
                    type: "number",
                    description:
                      "Seconds a NetworkFirst rule waits for the network before falling back to the cache.",
                  },
                  expiration: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      maxEntries: { type: "number" },
                      maxAgeSeconds: { type: "number" },
                    },
                  },
                  cacheableResponse: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      statuses: { type: "array", items: { type: "number" } },
                      headers: {
                        type: "object",
                        additionalProperties: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        navigateFallbackDenylist: {
          type: "array",
          description:
            "Extra SPA navigate-fallback denylist patterns, unioned with the built-ins.",
          items: pwaUrlPatternSchema,
        },
      },
    },
  },
} as const;
