// JSON Schema (draft-07) for the source `powerhouse.config.json` (the file at
// the project root, hand-edited by developers, consumed by the `ph` CLI).
//
// Mirrors the `PowerhouseConfig` TypeScript type in ./types.ts. Drift between
// the TS type and this schema is guarded by ./source-config-schema.test.ts.
//
// Shared field shapes (PowerhousePackage, PHConnectRuntimeConfig) are imported
// from `@powerhousedao/shared/connect` so the source schema and the runtime
// schema (in builder-tools/connect-utils) stay in sync by construction.
//
// See CONNECT-CONFIG.md §12.7 and §12.8 for architecture and hosting.

import {
  phConnectRuntimeConfigSchema,
  powerhousePackageSchema,
} from "../connect/schema-fragments.js";
import { LOG_LEVELS } from "./constants.js";

export const SOURCE_CONFIG_SCHEMA_ID =
  "https://powerhouse.inc/schemas/powerhouse.source.json";

export const sourceConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: SOURCE_CONFIG_SCHEMA_ID,
  title: "Powerhouse source configuration",
  description:
    "Project-root powerhouse.config.json: the developer-edited build manifest read by the `ph` CLI and Vite plugins.",
  type: "object",
  additionalProperties: false,
  // No fields are strictly required at the file level: the `ph` CLI merges
  // DEFAULT_CONFIG (constants.ts) into whatever the file contains, so an
  // empty `{}` is a valid source config. The schema describes what fields
  // are *recognised* and their shapes, not what must be present.
  properties: {
    $schema: {
      type: "string",
      description:
        "Optional JSON Schema reference for editor autocomplete. Set to the GitHub-hosted schema URL.",
    },
    logLevel: {
      type: "string",
      enum: [...LOG_LEVELS],
      description: "Log level for CLI commands and the reactor.",
    },
    documentModelsDir: {
      type: "string",
      description: "Path to the project's document model definitions.",
    },
    editorsDir: {
      type: "string",
      description: "Path to the project's editors.",
    },
    processorsDir: {
      type: "string",
      description: "Path to the project's processors.",
    },
    subgraphsDir: {
      type: "string",
      description: "Path to the project's subgraphs.",
    },
    importScriptsDir: {
      type: "string",
      description: "Path to the project's import scripts.",
    },
    skipFormat: {
      type: "boolean",
      description:
        "When true, codegen skips Prettier formatting on generated files.",
    },
    interactive: {
      type: "boolean",
      description: "Run CLI commands in interactive mode where applicable.",
    },
    watch: {
      type: "boolean",
      description: "Watch source files and rerun on changes.",
    },
    reactor: {
      type: "object",
      additionalProperties: false,
      description: "Reactor server configuration.",
      properties: {
        port: {
          type: "number",
          description: "Port the reactor HTTP server listens on.",
        },
        https: {
          oneOf: [
            { type: "boolean" },
            {
              type: "object",
              additionalProperties: false,
              required: ["keyPath", "certPath"],
              properties: {
                keyPath: {
                  type: "string",
                  description: "Path to TLS private key.",
                },
                certPath: {
                  type: "string",
                  description: "Path to TLS certificate.",
                },
              },
            },
          ],
          description:
            "Enable HTTPS. `true` for self-signed; object with key/cert paths for custom TLS.",
        },
        storage: {
          type: "object",
          additionalProperties: false,
          required: ["type"],
          description: "Reactor persistent storage backend.",
          properties: {
            type: {
              type: "string",
              enum: ["filesystem", "memory", "postgres", "browser"],
            },
            filesystemPath: {
              type: "string",
              description: "Required when `type: filesystem`.",
            },
            postgresUrl: {
              type: "string",
              description: "Required when `type: postgres`.",
            },
          },
        },
      },
    },
    auth: {
      type: "object",
      additionalProperties: false,
      required: ["admins"],
      description: "Authentication and authorisation settings.",
      properties: {
        enabled: {
          type: "boolean",
          description: "Master toggle for the auth subsystem.",
        },
        admins: {
          type: "array",
          items: { type: "string" },
          description: "DIDs granted admin role.",
        },
        defaultProtection: {
          type: "boolean",
          description:
            "When true, newly-created drives default to authenticated-only access.",
        },
      },
    },
    switchboard: {
      type: "object",
      additionalProperties: false,
      description: "Switchboard server configuration.",
      properties: {
        database: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: {
              type: "string",
              description: "Database connection URL.",
            },
          },
        },
        port: {
          type: "number",
          description: "Port the switchboard HTTP server listens on.",
        },
      },
    },
    studio: {
      type: "object",
      additionalProperties: false,
      required: ["https"],
      description: "Connect Studio dev-server configuration.",
      properties: {
        port: {
          type: "number",
          description: "Port the studio dev server listens on.",
        },
        host: {
          type: "string",
          description: "Host interface to bind.",
        },
        https: {
          type: "boolean",
          description: "Serve studio over HTTPS.",
        },
        openBrowser: {
          type: "boolean",
          description: "Open a browser tab on studio start.",
        },
      },
    },
    packages: {
      type: "array",
      description:
        "Powerhouse packages this project depends on. Shape is shared with the runtime config.",
      items: powerhousePackageSchema,
    },
    vetra: {
      type: "object",
      additionalProperties: false,
      required: ["driveId", "driveUrl"],
      description: "Vetra integration coordinates.",
      properties: {
        driveId: { type: "string" },
        driveUrl: { type: "string" },
      },
    },
    packageRegistryUrl: {
      type: "string",
      description:
        "Project-wide package registry endpoint. Used by `ph install` / `ph publish` / `ph registry-login` and Switchboard, and copied verbatim into the runtime config so the Connect SPA's Package Manager UI reads the same registry.",
    },
    connect: {
      ...phConnectRuntimeConfigSchema,
      description:
        "Connect-specific UI customisations. Copied verbatim into the runtime config at build time.",
    },
  },
} as const;
