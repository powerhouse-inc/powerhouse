import { z } from "zod";

/**
 * The shared zod schemas for host.js blocks (D2.a). The `reactor` block
 * validates STRICTLY (D2.d — phase 0's tolerated-unknown-keys notice ends
 * here): a typo'd protocol key must fail, not silently not-apply, because
 * these are fleet-consensus settings. `config` stays loose — it is
 * runner-defined by design.
 */

export const profileSchema = z
  .strictObject({
    appId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })
  .optional();

export const reactorProtocolSchema = z.strictObject({
  featureFlags: z
    .strictObject({
      documentDecisions: z.boolean().optional(),
      authEnforcement: z.boolean().optional(),
      authGroups: z.boolean().optional(),
      authConditions: z.boolean().optional(),
    })
    .optional(),
  createSignaturePolicy: z.enum(["legacy", "v2-required"]).optional(),
  unsupportedStoredDocuments: z.enum(["refuse", "read-only"]).optional(),
});

export const reactorBackendSchema = z.strictObject({
  kind: z.enum(["in-process", "worker", "remote"]).optional(),
  storage: z
    .strictObject({
      kind: z.enum(["idb", "memory", "path", "postgres"]),
      dataDir: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  readModel: z.strictObject({ url: z.string().optional() }).optional(),
  packages: z
    .strictObject({
      cdnUrl: z.string().optional(),
      specs: z.array(z.string()).optional(),
      dynamic: z.boolean().optional(),
    })
    .optional(),
  remote: z
    .strictObject({
      host: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
});

export const reactorSchema = z.strictObject({
  backends: z.record(z.string(), reactorBackendSchema).optional(),
  placement: z
    .strictObject({
      primary: z.string().optional(),
      default: z.looseObject({}).optional(),
    })
    .optional(),
  workflows: z.boolean().optional(),
  protocol: reactorProtocolSchema.optional(),
});

/** Common runner options every host.runner carries; runner modules extend it
 * loosely with their own process options. */
export const runnerBaseSchema = z.looseObject({
  module: z.string().min(1),
  defaultVerb: z.string().optional(),
  port: z.number().int().positive().optional(),
});

/** A compound's children map (mutually exclusive with `reactor` — the XOR is
 * structural, enforced by the loader; schemas validate each side's shape). */
export const childrenSchema = z.record(
  z.string(),
  z.strictObject({
    host: z.string().min(1),
    plugins: z.array(z.string()).optional(),
    runner: z.looseObject({}).optional(),
    config: z.looseObject({}).optional(),
    reactor: reactorSchema.optional(),
  }),
);

/** Composed generic host shapes — the basis for the emitted editor schemas
 * (D2.a). Runner packages extend these with their own runner options; `config`
 * stays loose by design. */
export const reactorHostSchema = z.looseObject({
  name: z.string().min(1),
  runner: runnerBaseSchema,
  config: z.looseObject({}).optional(),
  profile: profileSchema,
  reactor: reactorSchema.optional(),
});

export const compoundHostSchema = z.looseObject({
  name: z.string().min(1),
  runner: runnerBaseSchema,
  children: childrenSchema,
  config: z.looseObject({}).optional(),
  profile: profileSchema,
});

const SCHEMA_BASE = "https://powerhouse.inc/schemas";

/** The emitted-schema set, keyed by published filename. Pure — the
 * emit-schemas script writes these to disk and the drift test re-derives
 * them, per the runtime-config-schema pattern. */
export function emittedHostSchemas(): Record<string, unknown> {
  const emit = (name: string, schema: z.ZodType) => ({
    $id: `${SCHEMA_BASE}/${name}.schema.json`,
    ...z.toJSONSchema(schema, { io: "input" }),
  });
  return {
    "host-reactor.schema.json": emit("host-reactor", reactorHostSchema),
    "host-compound.schema.json": emit("host-compound", compoundHostSchema),
  };
}
