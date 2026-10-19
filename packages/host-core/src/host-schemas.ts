import { z } from "zod";
import { drivesSchema } from "./drive-schema.js";
import { pluginEntrySchema } from "./plugins.js";
import { forbidRef, ref, type RefFn, type TokenMode } from "./tokens.js";

/**
 * The zod single source for host.js blocks (typed-host-configs G1). Every
 * host type is z.input/z.output of these schemas; nothing is hand-mirrored.
 * Top-level host objects and the `reactor` block are STRICT (a typo fails);
 * `runner` stays loose until each runner declares its options (T2), and
 * `config` is runner-defined.
 */

export const profileSchema = z.strictObject({
  appId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

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

export const runnerKindSchema = z.enum(["reactor", "compound"]);
export type RunnerKind = z.infer<typeof runnerKindSchema>;

export const reactorBackendKindSchema = z.enum([
  "in-process",
  "worker",
  "remote",
]);

// Path-equality for the one-dir guard: pure string normalisation (the host
// core stays Node-free); the server repeats the check with path.resolve.
const samePath = (a: string, b: string): boolean => {
  const norm = (p: string) =>
    p.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\.\//, "");
  return norm(a) === norm(b);
};

/** Compound wiring: the generic compound runner's `config` block. */
export const compoundWiringSchema = z.strictObject({
  /** Project the reactor member's created drives into the connect member. */
  projectDrivesIntoConnect: z.boolean().optional(),
  /** --drives-public-base equivalent. */
  drivesPublicBase: z.string().nullable().optional(),
  /** Member start order; must name declared children. Unnamed members start
   * after the named ones, in declaration order. */
  startOrder: z.array(z.string().min(1)).optional(),
  /** Write .ph/run/<host>.json (default true). */
  runtimeRecord: z.boolean().optional(),
  /** Patch the baked CSP for the runtime registry on a served connect member
   * (forwarded to the connect runner as a runner option). */
  cspRegistrySync: z.boolean().optional(),
});

/** `config.startOrder ⊆ keys(children)`, checked where both are visible.
 * Apply it LAST (`.superRefine(refineStartOrder)`) to a runner's final host
 * schema: zod refuses to `.extend()` a refined object. */
export function refineStartOrder(
  host: { children: Record<string, unknown>; config?: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  const startOrder = host.config?.startOrder;
  if (!Array.isArray(startOrder)) return;
  const members = Object.keys(host.children);
  startOrder.forEach((name: unknown, index) => {
    if (typeof name === "string" && members.includes(name)) return;
    ctx.addIssue({
      code: "custom",
      path: ["config", "startOrder", index],
      message: `startOrder names "${String(name)}", which is not a member. Members: ${members.join(", ") || "(none)"}.`,
    });
  });
}

/**
 * Builds the host schema set. `ref` is the token-able field wrapper: "allow"
 * (declared form) accepts `T | Token`, "forbid" (resolved form) accepts `T`.
 * T1 defines the seam only: no field is wrapped yet (T3 applies it to
 * remote/drive URLs, storage.dataDir, …), so both modes are identical today.
 */
function buildHostSchemas(_ref: RefFn) {
  const reactorBackendSchema = z
    .strictObject({
      kind: reactorBackendKindSchema,
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
          /** on-demand model resolution (was DYNAMIC_MODEL_LOADING). */
          dynamic: z.boolean().optional(),
        })
        .optional(),
      // `host` (sibling reference) stays accepted until T3 makes `url` a
      // required ref() and removes it.
      remote: z
        .strictObject({
          host: z.string().optional(),
          url: z.string().optional(),
        })
        .optional(),
      // Deployment topology (R1): field names match the real switchboard
      // options (projectionWorker / workerPool).
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
    })
    // Two PGlite instances on one data dir corrupt it: the reactor store
    // (storage.dataDir) and the read-model store (readModel.url) must differ.
    // Postgres is exempt: one database legitimately serves both stores.
    .superRefine((backend, ctx) => {
      const store = backend.storage;
      const storeDir = store?.kind === "path" ? store.dataDir : undefined;
      const readModel = backend.readModel?.url;
      if (storeDir && readModel && samePath(storeDir, readModel)) {
        ctx.addIssue({
          code: "custom",
          path: ["readModel", "url"],
          message:
            `readModel.url must not be the reactor's storage dir (${readModel}): ` +
            "two PGlite instances on one data dir corrupt it. Omit readModel.url " +
            "to get the classic <root>/.ph/read-storage next to the reactor store.",
        });
      }
    });

  const reactorSchema = z.strictObject({
    backends: z.record(z.string(), reactorBackendSchema).optional(),
    placement: z
      .strictObject({
        primary: z.string().optional(),
        default: z.looseObject({}).optional(),
      })
      .optional(),
    protocol: reactorProtocolSchema.optional(),
    /** DEPRECATED (dies in R2): workflows become a listed plugin. */
    workflows: z.boolean().optional(),
    // R1 core keys: identity/signing, package registry, storage namespace,
    // access control — capabilities and intrinsics of the reactor.
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
    // Core-declared, seeded by the host runtime.
    drives: drivesSchema.optional(),
  });

  /** Common runner options; runner modules extend it with their own. */
  const runnerBaseSchema = z.looseObject({
    module: z.string().min(1),
    defaultVerb: z.string().min(1).optional(),
    port: z.number().int().positive().optional(),
    /** Bind address; each runner documents its default. */
    host: z.string().min(1).optional(),
    /** THE COMPOSITION: plugin entries; presence is activation. */
    plugins: z.array(pluginEntrySchema).optional(),
  });

  /** A compound member wrapper. Sections are FULL STATEMENTS except `runner`,
   * which key-merges over the member's own. Plugins live in `runner.plugins`
   * (as on a standalone host); there is no wrapper-level `plugins`. */
  const childWrapperSchema = z.strictObject({
    host: z.string().min(1),
    runner: runnerBaseSchema.partial().optional(),
    config: z.looseObject({}).optional(),
    reactor: reactorSchema.optional(),
  });

  const childrenSchema = z.record(z.string(), childWrapperSchema);

  const reactorHostSchema = z.strictObject({
    name: z.string().min(1),
    runner: runnerBaseSchema,
    config: z.looseObject({}).optional(),
    profile: profileSchema.optional(),
    reactor: reactorSchema.optional(),
  });

  const compoundHostSchema = z.strictObject({
    name: z.string().min(1),
    runner: runnerBaseSchema,
    children: childrenSchema,
    config: z.looseObject({}).optional(),
    profile: profileSchema.optional(),
  });

  return {
    reactorBackendSchema,
    reactorSchema,
    runnerBaseSchema,
    childWrapperSchema,
    childrenSchema,
    reactorHostSchema,
    compoundHostSchema,
  };
}

export type HostSchemas = ReturnType<typeof buildHostSchemas>;

/** The host schema set in declared ("allow": ref fields take tokens) or
 * resolved ("forbid") form. */
export function makeHostSchemas(options: { tokens: TokenMode }): HostSchemas {
  return buildHostSchemas(options.tokens === "allow" ? ref : forbidRef);
}

const resolved = makeHostSchemas({ tokens: "forbid" });

export const reactorBackendSchema = resolved.reactorBackendSchema;
export const reactorSchema = resolved.reactorSchema;
export const runnerBaseSchema = resolved.runnerBaseSchema;
export const childWrapperSchema = resolved.childWrapperSchema;
export const childrenSchema = resolved.childrenSchema;
export const reactorHostSchema = resolved.reactorHostSchema;
export const compoundHostSchema = resolved.compoundHostSchema;

/** The generic compound runner's host: the base with its wiring config. */
export const genericCompoundHostSchema = compoundHostSchema
  .extend({ config: compoundWiringSchema.optional() })
  .superRefine(refineStartOrder);

/* -------------------------------------------------------------------- types */

export type Profile = z.infer<typeof profileSchema>;
export type ReactorProtocol = z.infer<typeof reactorProtocolSchema>;
export type ReactorBackend = z.infer<typeof reactorBackendSchema>;
export type ReactorBackendKind = ReactorBackend["kind"];
export type ReactorStorageConfig = NonNullable<ReactorBackend["storage"]>;
export type ReactorPackageConfig = NonNullable<ReactorBackend["packages"]>;
export type ReactorRemoteConfig = NonNullable<ReactorBackend["remote"]>;
export type ReactorConfig = z.infer<typeof reactorSchema>;
export type RunnerBase = z.infer<typeof runnerBaseSchema>;
export type ChildWrapper = z.infer<typeof childWrapperSchema>;
export type CompoundWiring = z.infer<typeof compoundWiringSchema>;

/** What a host.js author writes (z.input), per runner kind. The `never`
 * sides make reactor XOR children a type error. */
export type ReactorHostInput = z.input<typeof reactorHostSchema> & {
  children?: never;
};
export type CompoundHostInput = z.input<typeof compoundHostSchema> & {
  reactor?: never;
};
export type HostDefinition = ReactorHostInput | CompoundHostInput;

/** What a verb receives (z.output) from the base schemas. */
export type ReactorHost = z.output<typeof reactorHostSchema>;
export type CompoundHost = z.output<typeof compoundHostSchema>;

/* --------------------------------------------------------------- JSON Schema */

const SCHEMA_BASE = "https://powerhouse.inc/schemas";

/** One host schema as an editor JSON Schema with a stable `$id` — the
 * per-runner emission helper (runner packages emit their own hostSchema). */
export function emitHostJsonSchema(
  name: string,
  schema: z.ZodType,
): Record<string, unknown> {
  return {
    $id: `${SCHEMA_BASE}/${name}.schema.json`,
    ...z.toJSONSchema(schema, { io: "input" }),
  };
}

/** The emitted-schema set, keyed by published filename. Pure — the
 * emit-schemas script writes these and the drift test re-derives them. */
export function emittedHostSchemas(): Record<string, unknown> {
  return {
    "host-reactor.schema.json": emitHostJsonSchema(
      "host-reactor",
      reactorHostSchema,
    ),
    "host-compound.schema.json": emitHostJsonSchema(
      "host-compound",
      compoundHostSchema,
    ),
  };
}
