// JSON Schema (draft-07) shapes shared between the source PowerhouseConfig
// schema (../clis/source-config-schema.ts) and the runtime config schema
// (builder-tools/connect-utils/runtime-config-schema.ts).
//
// The Connect fragments are emitted from the zod schemas in
// ./connect-config-schema.ts; change a field there, never here.
// connect-config-schema.test.ts pins the emitted output.

import type { z } from "zod";
import { toJSONSchema } from "zod";
import {
  connectBackgroundLayerSchema,
  connectBackgroundSchema,
  connectBrandingSchema,
  connectConfigSchema,
  connectExplorerIconsSchema,
  connectHomeSchema,
} from "./connect-config-schema.js";

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

/** A draft-07 JSON Schema fragment, embeddable as a subschema. Declared
 * here rather than reusing zod's type, so schemas that embed a fragment
 * have a portable inferred type. */
export type JsonSchemaFragment = {
  properties?: Record<string, unknown>;
  [keyword: string]: unknown;
};

/** Emits a zod schema as a draft-07 fragment: input shape, no `$schema`. */
export function emitJsonSchemaFragment(schema: z.ZodType): JsonSchemaFragment {
  const { $schema: _, ...fragment } = toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    unrepresentable: "throw",
  });
  return fragment;
}

/** `schema` or null, keeping its description on the outer node. */
function orNull(schema: z.ZodType): z.ZodType {
  const nullable = schema.nullable();
  return schema.description ? nullable.describe(schema.description) : nullable;
}

/** One image of a decorated pane. */
export const phBackgroundLayerSchema = /* @__PURE__ */ emitJsonSchemaFragment(
  connectBackgroundLayerSchema,
);

/** A pane's background: layers over a page colour, or one image. */
export const phBackgroundSchema = /* @__PURE__ */ emitJsonSchemaFragment(
  orNull(connectBackgroundSchema),
);

/** The drive explorer's icons (the generic plugin's). */
export const phConnectExplorerIconsSchema =
  /* @__PURE__ */ emitJsonSchemaFragment(orNull(connectExplorerIconsSchema));

/** `connect.branding`. */
export const phConnectBrandingSchema = /* @__PURE__ */ emitJsonSchemaFragment(
  connectBrandingSchema,
);

/** `connect.home`. */
export const phConnectHomeSchema =
  /* @__PURE__ */ emitJsonSchemaFragment(connectHomeSchema);

/** The authored `connect` block, as validated by Ajv. */
export const phConnectRuntimeConfigSchema =
  /* @__PURE__ */ emitJsonSchemaFragment(connectConfigSchema);
