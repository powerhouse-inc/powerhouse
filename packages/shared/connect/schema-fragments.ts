// Single source of truth for JSON Schema shapes shared between the source
// PowerhouseConfig schema (packages/shared/clis/source-config-schema.ts) and
// the runtime RuntimePowerhouseConfig schema
// (packages/builder-tools/connect-utils/runtime-config-schema.ts).
//
// When a shared shape changes, edit it here — both schemas pick it up.
// See CONNECT-CONFIG.md §12.7 for the architecture rationale.

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
    drives: {
      type: "object",
      additionalProperties: false,
      description: "Default-drive and add-drive UI behaviour.",
      properties: {
        allowAddDrive: {
          type: "boolean",
          description:
            "When false, the SPA hides the 'add drive' affordance. Defaults to true.",
        },
        defaultDrives: {
          type: "array",
          description:
            "Drives the SPA auto-connects to on first load. Each must specify a URL; name and icon are optional overrides.",
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
      },
    },
  },
} as const;
