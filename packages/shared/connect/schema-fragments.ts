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
          description:
            "Optional hero image on the empty home screen. Provide AVIF for the modern path and a PNG/JPG fallback.",
          oneOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                avif: {
                  type: "string",
                  description: "URL or path to AVIF asset (preferred).",
                },
                png: {
                  type: "string",
                  description: "URL or path to PNG/JPG fallback.",
                },
              },
            },
          ],
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
  },
} as const;
