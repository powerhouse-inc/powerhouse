import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { z } from "zod";
import { buildDriveDeclarationSchema } from "./drive-schema.js";
import { pluginEntrySchema } from "./plugins.js";
import {
  envTokenable,
  tokenable,
  type EnvToken,
  type TokenableSchema,
  type TokenMode,
} from "./tokens.js";

/**
 * The zod single source for host.js blocks (typed-host-configs G1). Every
 * host type is z.input/z.output of these schemas; nothing is hand-mirrored.
 * Top-level host objects and the `reactor` block are STRICT (a typo fails);
 * `runner` stays loose until each runner declares its options (T2), and
 * `config` is runner-defined.
 *
 * Token-able fields (typed-host-configs 3.5): `reactor.backends.*.remote.url`
 * (required, a switchboard drive address), `reactor.drives` (whole list, e.g. `$map`),
 * `reactor.drives[].remote.url` and `storage.dataDir` (`$env` only). Their z.input admits tokens, their z.output is the resolved type.
 */

/** A host's `name` keys its run record, `.ph/run/<name>.json`, so it must be
 * one safe path segment. */
export const HOST_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const HOST_NAME_MAX_LENGTH = 128;
export const HOST_NAME_MESSAGE =
  "A host name is used as a file name, so use only letters, digits, '.', '_' and '-', start with a letter or digit, and keep it to 128 characters.";
export const hostNameSchema = z
  .string()
  .min(1)
  .max(HOST_NAME_MAX_LENGTH, HOST_NAME_MESSAGE)
  .regex(HOST_NAME_PATTERN, HOST_NAME_MESSAGE);

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

/** Compound wiring: the generic compound runner's `config` block.
 * (`projectDrivesIntoConnect` and `drivesPublicBase` were removed in T3: a
 * member consumes another member's drives through `$output` tokens.) */
export const compoundWiringSchema = z.strictObject({
  /** Member start order; must name declared children and agree with the
   * output-token dependencies (resolve/plan.ts). Optional: without it the
   * order is derived from the tokens. Unnamed members start after the named
   * ones, in declaration order. */
  startOrder: z.array(z.string().min(1)).optional(),
  /** Write .ph/run/<host>.json (default true). */
  runtimeRecord: z.boolean().optional(),
  /** Patch the baked CSP for the runtime registry on a served Connect
   * member (forwarded as `runner.cspRegistrySync` to every member whose
   * runner is `@powerhousedao/ph-cli/runners/connect`). */
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
    if (startOrder.indexOf(name) !== index) {
      ctx.addIssue({
        code: "custom",
        path: ["config", "startOrder", index],
        message: `startOrder names "${String(name)}" twice; each member starts once.`,
      });
      return;
    }
    if (typeof name === "string" && members.includes(name)) return;
    ctx.addIssue({
      code: "custom",
      path: ["config", "startOrder", index],
      message: `startOrder names "${String(name)}", which is not a member. Members: ${members.join(", ") || "(none)"}.`,
    });
  });
}

/** How a schema set wraps its token-able fields. Both modes share one static
 * type (declared input, resolved output); they differ at runtime only. */
interface FieldWrappers {
  any: <S extends z.ZodType>(schema: S) => TokenableSchema<S>;
  env: <S extends z.ZodType>(schema: S) => TokenableSchema<S, EnvToken>;
}

const ALLOW_TOKENS: FieldWrappers = { any: tokenable, env: envTokenable };
// A one-option union: the same validation as `schema`, typed like the
// "allow" wrappers so both modes share HostSchemas.
const FORBID_TOKENS: FieldWrappers = {
  any: (schema) => z.union([schema]),
  env: (schema) => z.union([schema]),
};

/** The replacement a non-drive `remote.url` message names. */
function useDriveUrl(host = "switchboard", member?: string): string {
  const memberPart = member ? `, member: "${member}"` : "";
  return (
    `remote: { url: ${host}.drives.<slug>.url } with ${host} from ../${host}/outputs.js, ` +
    `or remote: { url: { $output: { host: "${host}"${memberPart}, path: ["drives", "<slug>", "url"] } } }`
  );
}

/** The `$output` of a declared `remote.url` that reads `endpoints.graphql`. */
function endpointsGraphqlRef(
  url: unknown,
): { host: string; member?: string } | undefined {
  if (typeof url !== "object" || url === null || !("$output" in url)) {
    return undefined;
  }
  const ref = (url as { $output: unknown }).$output;
  if (typeof ref !== "object" || ref === null) return undefined;
  const { host, member, path } = ref as Record<string, unknown>;
  if (typeof host !== "string" || !Array.isArray(path)) return undefined;
  if (path.join(".") !== "endpoints.graphql") return undefined;
  return { host, ...(typeof member === "string" ? { member } : {}) };
}

interface ResolvedReactorBlock {
  backends?: Record<string, { kind: string; remote?: { url: unknown } }>;
  placement?: { drives?: Record<string, string> };
  drives?: unknown;
}

/** Resolved-form checks across backends, drives and placement: one base is
 * one remote backend, and a drive placed on a remote is on its switchboard. */
function refineResolvedReactor(
  reactor: ResolvedReactorBlock,
  ctx: z.RefinementCtx,
): void {
  const backends = reactor.backends ?? {};
  const baseOf = new Map<string, string>();
  const byBase = new Map<string, string>();
  const homeBase = new Map<string, string>();
  for (const [name, backend] of Object.entries(backends)) {
    const url = backend.remote?.url;
    if (backend.kind !== "remote" || typeof url !== "string") continue;
    const home = switchboardOfDrive(url);
    if (!home) continue;
    baseOf.set(name, home.base);
    if (!homeBase.has(home.slug)) homeBase.set(home.slug, home.base);
    const first = byBase.get(home.base);
    if (first === undefined) {
      byBase.set(home.base, name);
      continue;
    }
    ctx.addIssue({
      code: "custom",
      path: ["backends", name, "remote", "url"],
      message: `backends "${first}" and "${name}" both open drives on the same switchboard (${home.base}). Keep "${first}", and list the second drive under reactor.drives with its remote.url instead.`,
    });
  }

  const declared = Array.isArray(reactor.drives)
    ? (reactor.drives as { slug: string; remote?: { url: string } }[])
    : [];
  for (const [slug, name] of Object.entries(reactor.placement?.drives ?? {})) {
    const base = baseOf.get(name);
    if (base === undefined) continue;
    const at = ["placement", "drives", slug];
    const drive = declared.find((d) => d.slug === slug);
    if (drive && !drive.remote) {
      ctx.addIssue({
        code: "custom",
        path: at,
        message: `placement.drives.${slug} opens drive "${slug}" on "${name}", but this reactor keeps that drive itself. Only a drive on a switchboard can open there without a copy.`,
      });
      continue;
    }
    const driveBase = drive?.remote
      ? switchboardOfDrive(drive.remote.url)?.base
      : homeBase.get(slug);
    // A key that names no drive here (a hashed home drive) is not checked.
    if (driveBase === undefined || driveBase === base) continue;
    ctx.addIssue({
      code: "custom",
      path: at,
      message: `placement.drives.${slug} opens drive "${slug}" on "${name}" (${base}), but the drive is on ${driveBase}. Place it on the backend for that switchboard.`,
    });
  }
}

/**
 * Builds the host schema set. "allow" (declared form) accepts `T | Token` in
 * every token-able field; "forbid" (resolved form) accepts `T` only.
 */
function buildHostSchemas(tokenField: FieldWrappers) {
  const resolved = tokenField === FORBID_TOKENS;
  const reactorBackendSchema = z
    .strictObject({
      kind: reactorBackendKindSchema,
      storage: z
        .strictObject({
          kind: z.enum(["idb", "memory", "path", "postgres"]),
          /** `"${userData}/…"` sugar or `{ $env: "NAME" }`. */
          dataDir: tokenField.env(z.string()).optional(),
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
      // A switchboard drive address, `<base>/d/<slug>`: typically a
      // producer's `drives.<slug>.url` output token. The backend is the
      // switchboard at `<base>`.
      remote: z.strictObject({ url: tokenField.any(z.url()) }).optional(),
    })
    // Two PGlite instances on one data dir corrupt it: the reactor store
    // (storage.dataDir) and the read-model store (readModel.url) must differ.
    // Postgres is exempt: one database legitimately serves both stores.
    .superRefine((backend, ctx) => {
      // 2.1 "a remote backend needs url": `remote` is optional for the
      // in-process/worker kinds, but a remote backend attaches by URL only.
      if (backend.kind === "remote" && !backend.remote) {
        ctx.addIssue({
          code: "custom",
          path: ["remote", "url"],
          message: `a "remote" backend needs remote.url, a switchboard drive address: ${useDriveUrl()}.`,
        });
      }
      const url: unknown = backend.remote?.url;
      const graphqlRef = resolved ? undefined : endpointsGraphqlRef(url);
      if (graphqlRef) {
        ctx.addIssue({
          code: "custom",
          path: ["remote", "url"],
          message: `remote.url reads ${graphqlRef.host}'s endpoints.graphql; it must be a switchboard drive address (<switchboard>/d/<slug>): sync needs the drive. Use ${useDriveUrl(graphqlRef.host, graphqlRef.member)}.`,
        });
      }
      if (resolved && typeof url === "string" && !switchboardOfDrive(url)) {
        ctx.addIssue({
          code: "custom",
          path: ["remote", "url"],
          message: `remote.url must be a switchboard drive address (<switchboard>/d/<slug>), not ${url}: sync needs the drive. Use ${useDriveUrl()}.`,
        });
      }
      const store = backend.storage;
      const storeDir = store?.kind === "path" ? store.dataDir : undefined;
      const readModel = backend.readModel?.url;
      // In the declared form dataDir may still be a `$env` token: compare
      // only resolved strings (resolved validation re-runs this check).
      if (
        typeof storeDir === "string" &&
        readModel &&
        samePath(storeDir, readModel)
      ) {
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

  const reactorSchema = z
    .strictObject({
      backends: z.record(z.string(), reactorBackendSchema).optional(),
      placement: z
        .strictObject({
          primary: z.string().optional(),
          /** Declared drive slug → backend name. A local backend keeps a
           * synced copy; the drive's own remote backend opens it there with
           * no copy. An unlisted drive keeps a synced copy. */
          drives: z.record(z.string().min(1), z.string().min(1)).optional(),
        })
        .optional(),
      protocol: reactorProtocolSchema.optional(),
      /** DEPRECATED (dies in R2): workflows become a listed plugin. */
      workflows: z.boolean().optional(),
      // R1 core keys: identity/signing and storage namespace.
      renown: z
        .strictObject({
          url: z.string().optional(),
          networkId: z.string().optional(),
          chainId: z.number().int().optional(),
        })
        .optional(),
      namespace: z.string().min(1).optional(),
      // Core-declared, seeded by the host runtime. Token-able as a whole
      // (3.3): a `$map` over a producer's `drives` output (or an `$output` of
      // an array of declarations) renders the list at resolve time.
      drives: tokenField
        .any(z.array(buildDriveDeclarationSchema(tokenField.any)))
        .optional(),
    })
    .superRefine((reactor, ctx) => {
      const backends = reactor.backends ?? {};
      for (const [slug, name] of Object.entries(
        reactor.placement?.drives ?? {},
      )) {
        if (Object.hasOwn(backends, name)) continue;
        ctx.addIssue({
          code: "custom",
          path: ["placement", "drives", slug],
          message: `placement.drives.${slug} names backend "${name}", which is not in backends (${Object.keys(backends).join(", ") || "none"}).`,
        });
      }
      // Tokens are resolved only here; the declared form checks names.
      if (resolved) refineResolvedReactor(reactor, ctx);
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
    // 0 passes here; the member runner's own schema decides whether it may.
    runner: runnerBaseSchema
      .partial()
      .extend({ port: z.number().int().min(0).max(65535).optional() })
      .optional(),
    config: z.looseObject({}).optional(),
    reactor: reactorSchema.optional(),
  });

  const childrenSchema = z.record(z.string(), childWrapperSchema);

  const reactorHostSchema = z.strictObject({
    name: hostNameSchema,
    runner: runnerBaseSchema,
    config: z.looseObject({}).optional(),
    profile: profileSchema.optional(),
    reactor: reactorSchema.optional(),
  });

  const compoundHostSchema = z.strictObject({
    name: hostNameSchema,
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
    /** This set's field wrapper, for a runner's OWN token-able fields inside
     * `defineHostSchemas`: declared, `T | Token` in and `T` out; resolved,
     * `T` only. Both modes share one static type. */
    tokenable: tokenField.any,
    /** As `tokenable`, but the only token accepted is `$env`. */
    envTokenable: tokenField.env,
  };
}

export type HostSchemas = ReturnType<typeof buildHostSchemas>;

/** The host schema set in declared ("allow": token-able fields take tokens)
 * or resolved ("forbid") form. */
export function makeHostSchemas(options: { tokens: TokenMode }): HostSchemas {
  return buildHostSchemas(
    options.tokens === "allow" ? ALLOW_TOKENS : FORBID_TOKENS,
  );
}

/**
 * One runner definition, two schemas (3.5): `build` runs over the DECLARED
 * set (tokens allowed; its z.input types host files) and the RESOLVED set
 * (no tokens; `validateHost` checks it before the verb). Export both, type
 * the host as `z.input<typeof declaredHostSchema>`, refine last inside the
 * builder (zod can't extend a refined object), and wrap the runner's own
 * token-able fields with `s.tokenable` / `s.envTokenable`.
 */
export function defineHostSchemas<T>(build: (schemas: HostSchemas) => T): {
  declaredHostSchema: T;
  hostSchema: T;
} {
  return {
    declaredHostSchema: build(declaredSchemas),
    hostSchema: build(resolvedSchemas),
  };
}

const declaredSchemas = makeHostSchemas({ tokens: "allow" });
const resolvedSchemas = makeHostSchemas({ tokens: "forbid" });

/* The exported base blocks are the RESOLVED form (what verbs receive). The
 * declared forms are `declaredHostSchemas` / `defineHostSchemas`. */
export const declaredHostSchemas: HostSchemas = declaredSchemas;
export const reactorBackendSchema = resolvedSchemas.reactorBackendSchema;
export const reactorSchema = resolvedSchemas.reactorSchema;
export const runnerBaseSchema = resolvedSchemas.runnerBaseSchema;
export const childWrapperSchema = resolvedSchemas.childWrapperSchema;
export const childrenSchema = resolvedSchemas.childrenSchema;
export const reactorHostSchema = resolvedSchemas.reactorHostSchema;
export const compoundHostSchema = resolvedSchemas.compoundHostSchema;

/** The generic compound runner's host: the base with its wiring config. */
const genericCompound = defineHostSchemas((s) =>
  s.compoundHostSchema
    .extend({ config: compoundWiringSchema.optional() })
    .superRefine(refineStartOrder),
);
export const genericCompoundHostSchema = genericCompound.hostSchema;
export const declaredGenericCompoundHostSchema =
  genericCompound.declaredHostSchema;

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
export type ReactorHostInput = z.input<
  typeof declaredSchemas.reactorHostSchema
> & {
  children?: never;
};
export type CompoundHostInput = z.input<
  typeof declaredSchemas.compoundHostSchema
> & {
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
    // Editor schemas describe what authors write: the declared form.
    "host-reactor.schema.json": emitHostJsonSchema(
      "host-reactor",
      declaredSchemas.reactorHostSchema,
    ),
    "host-compound.schema.json": emitHostJsonSchema(
      "host-compound",
      declaredSchemas.compoundHostSchema,
    ),
  };
}
