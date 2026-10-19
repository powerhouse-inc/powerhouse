import { z } from "zod";

/**
 * R1 — the host plugin framework (bridge-runners-to-plugins plan,
 * customization-references/host-core as the blueprint).
 *
 * A plugin is hooks + contributions; hooks are boot wiring (main realm only),
 * contributions are declarative, serializable surface. Host RUNTIMES define
 * the hook vocabulary and interleave their own wiring between stages — they
 * are never plugins themselves.
 *
 * host.js carries the COMPOSITION as `runner.plugins` entries:
 *   string | { module, enabled?, verbs?, config? }
 * Presence is activation (enabled defaults true); `verbs` scopes an entry to
 * matching run verbs; `config` is validated against the plugin's declared
 * zod schema. Entries resolve from the PROJECT's dependency tree exactly
 * like runner modules.
 */

export class PluginError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}\n  Hint: ${hint}` : message);
    this.name = "PluginError";
  }
}

/* ------------------------------------------------------------------ entries */

export const pluginEntryObjectSchema = z.strictObject({
  module: z.string().min(1),
  /** Presence is activation BY DEFAULT; false is the explicit off-switch. */
  enabled: z.boolean().optional(),
  /** "*" (default) or the run verbs this entry is active for. */
  verbs: z
    .union([z.literal("*"), z.array(z.string().min(1)).min(1)])
    .optional(),
  /** Validated against the plugin's declared configSchema at resolution. */
  config: z.record(z.string(), z.unknown()).optional(),
});

export const pluginEntrySchema = z.union([
  z.string().min(1),
  pluginEntryObjectSchema,
]);

export type PluginEntry = z.infer<typeof pluginEntrySchema>;

/* --------------------------------------------------------- drive references */

/**
 * A DRIVE REFERENCE in a plugin entry's config: "the drive `slug` that
 * compound member `from` serves". The generic compound runner substitutes it
 * with the URL that member's runner handle reported (`driveUrls`) before the
 * member host is validated — so a connect member can say
 * `{ drive: { from: "vetra-switchboard", slug: "workflows" } }` instead of
 * spelling the sibling's URL. Outside a compound a reference cannot resolve:
 * runners reject it at boot (there is no sibling to point at).
 */
export const driveReferenceSchema = z.strictObject({
  from: z.string().min(1),
  slug: z.string().min(1),
});

export type DriveReference = z.infer<typeof driveReferenceSchema>;

export function isDriveReference(value: unknown): value is DriveReference {
  return driveReferenceSchema.safeParse(value).success;
}

/** The config keys of an entry that still hold a drive reference, e.g. after
 * a standalone run skipped compound substitution. */
export function unresolvedDriveReferences(
  config: Record<string, unknown> | undefined,
): { key: string; reference: DriveReference }[] {
  return Object.entries(config ?? {}).flatMap(([key, value]) =>
    isDriveReference(value) ? [{ key, reference: value }] : [],
  );
}

export interface NormalizedPluginEntry {
  module: string;
  enabled: boolean;
  verbs: "*" | string[];
  config: Record<string, unknown>;
}

export function normalizePluginEntry(
  entry: PluginEntry,
): NormalizedPluginEntry {
  if (typeof entry === "string") {
    return { module: entry, enabled: true, verbs: "*", config: {} };
  }
  return {
    module: entry.module,
    enabled: entry.enabled ?? true,
    verbs: entry.verbs ?? "*",
    config: entry.config ?? {},
  };
}

/** Module is the identity key: a duplicate makes override targeting and
 * ordering ambiguous, so it fails loudly. */
export function normalizePluginEntries(
  entries: readonly PluginEntry[],
  where: string,
): NormalizedPluginEntry[] {
  const normalized = entries.map(normalizePluginEntry);
  const seen = new Set<string>();
  for (const entry of normalized) {
    if (seen.has(entry.module)) {
      throw new PluginError(
        `${where}: plugin "${entry.module}" is listed twice.`,
        "Module specifiers are the identity key of a composition; a plugin meant to run twice needs distinct subpath specifiers.",
      );
    }
    seen.add(entry.module);
  }
  return normalized;
}

export function entryActiveForVerb(
  entry: NormalizedPluginEntry,
  verb: string,
): boolean {
  if (!entry.enabled) return false;
  return entry.verbs === "*" || entry.verbs.includes(verb);
}

/* ---------------------------------------------------------------- hierarchy */

/**
 * The appliesTo hierarchy. "reactor" is the base every reactor host extends;
 * "compound" is its own branch (plugins over the member set — e.g. the clint
 * proxy). Host runtimes register their id with a parent; compatibility walks
 * the parent chain.
 */
const HOST_TYPE_PARENTS: Record<string, string | null> = {
  reactor: null,
  compound: null,
  connect: "reactor",
  switchboard: "reactor",
  mastra: "reactor",
};

export function registerHostType(id: string, parent: string | null): void {
  if (id in HOST_TYPE_PARENTS && HOST_TYPE_PARENTS[id] !== parent) {
    throw new PluginError(
      `Host type "${id}" is already registered with parent "${String(HOST_TYPE_PARENTS[id])}".`,
    );
  }
  HOST_TYPE_PARENTS[id] = parent;
}

export function hostTypeSatisfies(
  hostType: string,
  appliesTo: string,
): boolean {
  let current: string | null = hostType;
  while (current !== null) {
    if (current === appliesTo) return true;
    current = current in HOST_TYPE_PARENTS ? HOST_TYPE_PARENTS[current] : null;
  }
  return false;
}

/* ------------------------------------------------------------------- plugin */

/** Hook kinds (v1 §2.2). The hook VOCABULARY is defined by host runtimes;
 * plugins implement subsets of it. */
export type Provide<T, C> = (ctx: C) => T | Promise<T>;
export type Transform<T, C> = (value: T, ctx: C) => T | Promise<T>;
export type Observe<C> = (ctx: C) => void | Promise<void>;

/**
 * Core contributions — declarative, serializable, realm-crossing. Host
 * runtimes extend this with their own kinds (UI slots live in connect-host,
 * never here). `drives` entries use the drive declaration shape from
 * drives.ts; kept as unknown here to avoid a cycle — the merge is shape-blind.
 */
export interface Contributions {
  drives?: unknown[];
  packages?: string[];
  configDeclarations?: { name: string; type?: string; description?: string }[];
  [kind: string]: unknown[] | undefined;
}

export interface HostPlugin<
  THooks = Record<string, unknown>,
  TConfig = unknown,
> {
  /** Stable id; used in ordering, dependsOn, and every diagnostic. */
  name: string;
  /** Host-type requirement; the entry is rejected on a host outside the
   * hierarchy branch. Default: "reactor". */
  appliesTo?: string;
  /** Coarse ordering bucket (Vite-style). Default: "normal". */
  enforce?: "pre" | "post";
  /** Hard dependencies on OTHER PLUGINS — the host runtime is implied and
   * never named. Missing dependency or cycle fails boot naming both sides. */
  dependsOn?: string[];
  /** Declared config shape; entry config is validated against it. A plugin
   * without a schema accepts no config (passing one is a boot error). */
  configSchema?: z.ZodType<TConfig>;
  hooks?: Partial<THooks>;
  contributions?: Contributions;
}

/** A plugin module default-exports either a HostPlugin object (no config
 * accepted) or a factory `(config) => HostPlugin`. */
export type HostPluginModule<
  THooks = Record<string, unknown>,
  TConfig = unknown,
> =
  | HostPlugin<THooks, TConfig>
  | ((config: TConfig) => HostPlugin<THooks, TConfig>);

export interface ResolvedPlugin<THooks = Record<string, unknown>> {
  entry: NormalizedPluginEntry;
  plugin: HostPlugin<THooks>;
  /** Provenance for contribution merge ordering. */
  provenance: "built-in" | "local" | "dependency";
}

/* ----------------------------------------------------------------- ordering */

/** Registration order, bucketed pre → normal → post (stable within buckets),
 * then dependsOn topo-sorted within the bucketed order. */
export function resolveOrder<THooks>(
  plugins: readonly HostPlugin<THooks>[],
): HostPlugin<THooks>[] {
  const buckets: Record<"pre" | "normal" | "post", HostPlugin<THooks>[]> = {
    pre: [],
    normal: [],
    post: [],
  };
  for (const plugin of plugins)
    buckets[plugin.enforce ?? "normal"].push(plugin);
  const bucketed = [...buckets.pre, ...buckets.normal, ...buckets.post];

  const byName = new Map(bucketed.map((p) => [p.name, p]));
  for (const plugin of bucketed) {
    for (const dep of plugin.dependsOn ?? []) {
      if (!byName.has(dep)) {
        throw new PluginError(
          `Plugin "${plugin.name}" depends on missing plugin "${dep}".`,
          "dependsOn names PLUGINS only — the host runtime is implied and never named.",
        );
      }
    }
  }

  const ordered: HostPlugin<THooks>[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (plugin: HostPlugin<THooks>, chain: string[]): void => {
    const mark = state.get(plugin.name);
    if (mark === "done") return;
    if (mark === "visiting") {
      throw new PluginError(
        `Plugin dependency cycle: ${[...chain, plugin.name].join(" -> ")}.`,
      );
    }
    state.set(plugin.name, "visiting");
    for (const dep of plugin.dependsOn ?? []) {
      visit(byName.get(dep)!, [...chain, plugin.name]);
    }
    state.set(plugin.name, "done");
    ordered.push(plugin);
  };
  for (const plugin of bucketed) visit(plugin, []);
  return ordered;
}

/* -------------------------------------------------------------------- hooks */

export async function runProvideHook<T, C>(
  name: string,
  plugins: readonly HostPlugin[],
  ctx: C,
): Promise<T | undefined> {
  const impls = plugins.filter((p) => typeof p.hooks?.[name] === "function");
  if (impls.length > 1) {
    throw new PluginError(
      `Hook "${name}" is provided by ${impls.map((p) => `"${p.name}"`).join(" and ")} — provide hooks have one winner.`,
    );
  }
  const impl = impls[0]?.hooks?.[name] as Provide<T, C> | undefined;
  return impl ? await impl(ctx) : undefined;
}

export async function runTransformHook<T, C>(
  name: string,
  plugins: readonly HostPlugin[],
  ctx: C,
  seed: T,
): Promise<T> {
  let value = seed;
  for (const plugin of plugins) {
    const impl = plugin.hooks?.[name] as Transform<T, C> | undefined;
    if (typeof impl === "function") value = await impl(value, ctx);
  }
  return value;
}

/** Sequential observe, in plugin order — for lifecycle moments whose order
 * is load-bearing (teardown: the switchboard stops privacy before workflows
 * before the api, per the carve map). */
export async function runObserveHookSequential<C>(
  name: string,
  plugins: readonly HostPlugin[],
  ctx: C,
): Promise<void> {
  for (const plugin of plugins) {
    const impl = plugin.hooks?.[name] as Observe<C> | undefined;
    if (typeof impl === "function") await impl(ctx);
  }
}

export async function runObserveHook<C>(
  name: string,
  plugins: readonly HostPlugin[],
  ctx: C,
): Promise<void> {
  await Promise.all(
    plugins.map(async (plugin) => {
      const impl = plugin.hooks?.[name] as Observe<C> | undefined;
      if (typeof impl === "function") await impl(ctx);
    }),
  );
}

/* ------------------------------------------------------------ contributions */

export interface ContributionSource {
  pluginName: string;
  provenance: "built-in" | "local" | "dependency";
}

export interface MergedContribution<T = unknown> {
  value: T;
  source: ContributionSource;
}

/** Array kinds concatenate in provenance-then-order sequence (built-in first,
 * so later sources read as overrides where consumers want last-wins). */
export function mergeContributions(
  resolved: readonly {
    plugin: HostPlugin;
    provenance: ContributionSource["provenance"];
  }[],
): Record<string, MergedContribution[]> {
  const rank: Record<ContributionSource["provenance"], number> = {
    "built-in": 0,
    local: 1,
    dependency: 2,
  };
  const sorted = [...resolved].sort(
    (a, b) => rank[a.provenance] - rank[b.provenance],
  );
  const merged: Record<string, MergedContribution[]> = {};
  for (const { plugin, provenance } of sorted) {
    for (const [kind, values] of Object.entries(plugin.contributions ?? {})) {
      if (!values) continue;
      const bucket = (merged[kind] ??= []);
      for (const value of values) {
        bucket.push({ value, source: { pluginName: plugin.name, provenance } });
      }
    }
  }
  return merged;
}
