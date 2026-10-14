import { z } from "zod";
import { drivesSchema } from "./drives.js";
import { pluginEntrySchema } from "./plugins.js";

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
  // Deployment topology (R1): where reactor work runs — same family as the
  // retired reactorWorker/multiReactor flags. Field names match the real
  // switchboard options (projectionWorker / workerPool).
  projection: z
    .strictObject({
      enabled: z.boolean().optional(),
      dbPoolSize: z.number().int().positive().optional(),
    })
    .optional(),
  executors: z
    .strictObject({
      numWorkers: z
        .union([z.number().int().positive(), z.literal("auto")])
        .optional(),
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
  protocol: reactorProtocolSchema.optional(),
  /** DEPRECATED (dies in R2): workflows become a listed plugin — presence is
   * activation. Kept parsing until the switchboard rewire lands. */
  workflows: z.boolean().optional(),
  // R1 core keys (rewire plan): identity/signing, package registry, storage
  // namespace, access control — capabilities and intrinsics of the reactor.
  renown: z
    .strictObject({
      url: z.string().optional(),
      networkId: z.string().optional(),
      chainId: z.number().int().optional(),
    })
    .optional(),
  packages: z.strictObject({ registryUrl: z.string().optional() }).optional(),
  namespace: z.string().min(1).optional(),
  auth: z
    .strictObject({
      enabled: z.boolean().optional(),
      admins: z.array(z.string()).optional(),
      renown: z.looseObject({}).optional(),
    })
    .optional(),
  // A reactor without drives is not a running reactor: core-declared,
  // seeded by the host runtime (onReactorReady -> seed -> onDrivesReady).
  drives: drivesSchema.optional(),
});

/** Common runner options every host.runner carries; runner modules extend it
 * loosely with their own process options. */
export const runnerBaseSchema = z.looseObject({
  module: z.string().min(1),
  defaultVerb: z.string().optional(),
  port: z.number().int().positive().optional(),
  /** Bind address; each runner documents its default (0.0.0.0 for servers,
   * localhost for vite dev, 127.0.0.1 for serve). */
  host: z.string().min(1).optional(),
  /** THE COMPOSITION: the plugin entries this host boots with. Presence is
   * activation; see plugins.ts for entry semantics. */
  plugins: z.array(pluginEntrySchema).optional(),
});

/** A compound's children map (mutually exclusive with `reactor` — the XOR is
 * structural, enforced by the loader; schemas validate each side's shape). */
export const childrenSchema = z.record(
  z.string(),
  z.strictObject({
    host: z.string().min(1),
    // Wrapper sections are FULL STATEMENTS (the member host file is source
    // material via sibling imports, not an implicit base). Plugins live
    // inside the wrapper's runner section, same as on a standalone host.
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
