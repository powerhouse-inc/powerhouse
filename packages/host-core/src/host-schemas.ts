import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { isOriginPlaceholderUrl } from "@powerhousedao/shared/connect/origin-placeholder";
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

/**
 * A URL, or one written against the page origin (`${origin}/graphql`): the
 * browser resolves the placeholder when it loads Connect's config, for a
 * member whose own server proxies the switchboard's paths.
 */
export const originOrUrlSchema = z.union([
  z.url(),
  z.string().refine(isOriginPlaceholderUrl, {
    message: "a URL, or ${origin}/<path> for a proxied sibling",
  }),
]);

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

/** The slug a drive link names: a `drives.<slug>.url` token's slug or a
 * literal address's served slug; undefined when only runtime knows it. */
function linkedSlug(url: unknown): string | undefined {
  if (typeof url === "string") return switchboardOfDrive(url)?.slug;
  const ref =
    typeof url === "object" && url !== null && "$output" in url
      ? (url as { $output: { path?: unknown } }).$output
      : undefined;
  const path = Array.isArray(ref?.path) ? (ref.path as unknown[]) : [];
  return path.length === 3 &&
    path[0] === "drives" &&
    typeof path[1] === "string" &&
    path[2] === "url"
    ? path[1]
    : undefined;
}

interface DeclaredReactorHost {
  runner?: { plugins?: unknown };
  reactor?: {
    backends?: Record<string, { kind: string; remote?: { url: unknown } }>;
    placement?: { drives?: Record<string, string> };
    drives?: unknown;
  };
}

/** The drives a declared host names (home drives, `reactor.drives`, plugin
 * `config.drive` links), or undefined when one is known only at runtime. */
function knownDriveSlugs(host: DeclaredReactorHost): string[] | undefined {
  const reactor = host.reactor ?? {};
  const slugs: string[] = [];
  for (const backend of Object.values(reactor.backends ?? {})) {
    if (backend.kind !== "remote") continue;
    const slug = linkedSlug(backend.remote?.url);
    if (slug === undefined) return undefined;
    slugs.push(slug);
  }
  if (reactor.drives !== undefined) {
    if (!Array.isArray(reactor.drives)) return undefined;
    for (const drive of reactor.drives as { slug?: unknown }[]) {
      if (typeof drive.slug === "string") slugs.push(drive.slug);
    }
  }
  const plugins = Array.isArray(host.runner?.plugins)
    ? (host.runner.plugins as unknown[])
    : [];
  for (const entry of plugins) {
    const config =
      typeof entry === "object" && entry !== null && "config" in entry
        ? (entry as { config: unknown }).config
        : undefined;
    if (typeof config !== "object" || config === null) continue;
    if (!("drive" in config) || config.drive === undefined) continue;
    const slug = linkedSlug(config.drive);
    if (slug === undefined) return undefined;
    slugs.push(slug);
  }
  return slugs;
}

/** Declared form, at host level so plugin drives are seen: a placement key
 * must name a drive the host names, when every drive is knowable. A host
 * with no remote backend is not checked: its plugins may contribute drives
 * (a switchboard's workflows drive) that no field names. */
function refineDeclaredPlacementKeys(
  host: DeclaredReactorHost,
  ctx: z.RefinementCtx,
): void {
  const placed = Object.keys(host.reactor?.placement?.drives ?? {});
  if (placed.length === 0) return;
  const remote = Object.values(host.reactor?.backends ?? {}).some(
    (b) => b.kind === "remote",
  );
  if (!remote) return;
  const known = knownDriveSlugs(host);
  if (!known) return;
  // A literal address may carry the hashed slug of a `projectHash` drive.
  const names = (slug: string, served: string) =>
    served === slug ||
    (served.startsWith(`${slug}-`) &&
      /^[0-9a-f]{8}$/.test(served.slice(slug.length + 1)));
  for (const slug of placed) {
    if (known.some((served) => names(slug, served))) continue;
    ctx.addIssue({
      code: "custom",
      path: ["reactor", "placement", "drives", slug],
      message: `placement.drives.${slug} names no drive this host links to or declares (${[...new Set(known)].join(", ") || "none"}).`,
    });
  }
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
  // Every switchboard a slug is linked on: one slug on two is ambiguous.
  const linked = new Map<string, Set<string>>();
  const link = (slug: string, base: string) =>
    linked.set(slug, (linked.get(slug) ?? new Set()).add(base));
  for (const [name, backend] of Object.entries(backends)) {
    const url = backend.remote?.url;
    if (backend.kind !== "remote" || typeof url !== "string") continue;
    const home = switchboardOfDrive(url);
    if (!home) continue;
    baseOf.set(name, home.base);
    link(home.slug, home.base);
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

  const kept = new Set<string>();
  const declared = Array.isArray(reactor.drives)
    ? (reactor.drives as { slug: string; remote?: { url: string } }[])
    : [];
  declared.forEach((drive, index) => {
    if (!drive.remote) {
      kept.add(drive.slug);
      return;
    }
    const at = switchboardOfDrive(drive.remote.url);
    // An empty url already fails the field's own check.
    if (at || drive.remote.url === "") {
      if (at) link(drive.slug, at.base);
      return;
    }
    ctx.addIssue({
      code: "custom",
      path: ["drives", index, "remote", "url"],
      message: `remote.url must be a switchboard drive address (<switchboard>/d/<slug>), not ${drive.remote.url}: sync needs the drive. Use url: switchboard.drives.<slug>.url, or url: { $output: { host: "switchboard", path: ["drives", "<slug>", "url"] } }.`,
    });
  });

  const nameOf = (base: string) => byBase.get(base) ?? base;
  for (const [slug, name] of Object.entries(reactor.placement?.drives ?? {})) {
    const at = ["placement", "drives", slug];
    const on = [...(linked.get(slug) ?? [])];
    // Two drives answer to the key, whichever backend it names.
    if (on.length > 0 && kept.has(slug)) {
      ctx.addIssue({
        code: "custom",
        path: at,
        message: `Drive "${slug}" is both this reactor's own drive and on ${on.map(nameOf).join(" and ")}. Rename one, or link only one.`,
      });
      continue;
    }
    if (on.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: at,
        message: `Drive "${slug}" is on both ${on.map(nameOf).join(" and ")}. Rename one, or link only one.`,
      });
      continue;
    }
    const base = baseOf.get(name);
    if (base === undefined) continue;
    if (on.length === 0) {
      // A key that names no drive here (a hashed home drive) is not checked.
      if (!kept.has(slug)) continue;
      ctx.addIssue({
        code: "custom",
        path: at,
        message: `placement.drives.${slug} opens drive "${slug}" on "${name}", but this reactor keeps that drive itself. Only a drive on a switchboard can open there without a copy.`,
      });
      continue;
    }
    if (on[0] === base) continue;
    ctx.addIssue({
      code: "custom",
      path: at,
      message: `placement.drives.${slug} opens drive "${slug}" on "${name}" (${base}), but the drive is on ${on[0]}. Place it on the backend for that switchboard.`,
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
      // switchboard at `<base>`. `${origin}/d/<slug>` when the member's own
      // server proxies the switchboard (the browser then calls its page
      // origin; see `runner.proxy` on the connect runner).
      remote: z
        .strictObject({ url: tokenField.any(originOrUrlSchema) })
        .optional(),
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

/** Adds the host-level placement key check to a runner's declared schema. */
function withPlacementKeys<T>(schema: T): T {
  if (!(schema instanceof z.ZodType)) return schema;
  return schema.superRefine((host, ctx) => {
    if (typeof host === "object" && host !== null && "reactor" in host) {
      refineDeclaredPlacementKeys(host as DeclaredReactorHost, ctx);
    }
  }) as T;
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
    declaredHostSchema: withPlacementKeys(build(declaredSchemas)),
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
