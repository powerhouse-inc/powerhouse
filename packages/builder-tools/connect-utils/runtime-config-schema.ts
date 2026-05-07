// JSON Schema (draft-07) for dist/powerhouse.config.json — the runtime
// artifact emitted into the build output and fetched by the Connect SPA at
// boot.
//
// This is a strict SUBSET of the source PowerhouseConfig schema (see
// CONNECT-CONFIG.md §4.3) plus two runtime-only fields (schemaVersion,
// localPackage). Field shapes shared with the source schema
// (PowerhousePackage, PHConnectRuntimeConfig) are imported from the shared
// fragments module so the two schemas stay in sync by construction.
//
// See CONNECT-CONFIG.md §12.7 and §12.8 for architecture and hosting.

import {
  phConnectRuntimeConfigSchema,
  powerhousePackageSchema,
} from "@powerhousedao/shared/connect";

export const RUNTIME_CONFIG_SCHEMA_ID =
  "https://powerhouse.inc/schemas/powerhouse.config.json";

// GitHub-hosted schema URL. Points at the JSON artifact committed alongside
// this TS module. Currently tracks the `main` branch — schema edits go live
// for editors as soon as they merge. Migrate to a `schema-v<N>` tag pinned
// to schemaVersion if/when stability across edits becomes a concern. See
// CONNECT-CONFIG.md §12.8.2 for the versioning trade-offs.
export const RUNTIME_CONFIG_SCHEMA_URL =
  "https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/packages/builder-tools/connect-utils/runtime-config.schema.json";

export const runtimeConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: RUNTIME_CONFIG_SCHEMA_ID,
  title: "Powerhouse Connect runtime configuration",
  description:
    "Runtime configuration loaded by Connect at boot from /powerhouse.config.json.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "packages", "localPackage"],
  properties: {
    $schema: {
      type: "string",
      description:
        "Optional JSON Schema reference for editor autocomplete. Set to the GitHub-hosted schema URL.",
    },
    schemaVersion: {
      const: 2,
      description:
        "Schema version. Must match the SPA bundle that ships with this dist. The SPA throws on mismatch to prevent SPA/config skew.",
    },
    packages: {
      type: "array",
      description:
        "Powerhouse packages this Connect instance loads at runtime.",
      items: powerhousePackageSchema,
    },
    localPackage: {
      description:
        "Identity of the consumer project itself, captured at build time. null for Docker images and other generic deploys with no host project.",
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["name", "version"],
          properties: {
            name: { type: "string" },
            version: { type: "string" },
          },
        },
      ],
    },
    connect: phConnectRuntimeConfigSchema,
  },
} as const;
