import {
  ChannelScheme,
  type ReactorFeatureFlags,
} from "@powerhousedao/reactor";
import type { WorkerPackageSource } from "@powerhousedao/reactor-browser/rpc";
import { reactorStorageNamespace } from "../naming.js";
import { DEFAULT_REACTOR_STORAGE } from "../store.js";
import type { ReactorDescriptor, ReactorStorageConfig } from "../types.js";

/**
 * What the tab sends the worker to build its reactor with.
 *
 * Every field must survive `postMessage`, which is why the worker path takes
 * models as package specs and URLs rather than as modules, and takes no
 * signer and no jwt handler: those are functions. The worker builds its own
 * `LocalSigner` and runs its channels unauthenticated.
 */
export type MonitorWorkerConstruct = {
  /** The descriptor name, for logs and `adminInfo().namespace`. */
  name: string;
  /** PGlite store namespace; derived from `name` by the tab. */
  namespace: string;
  storage?: ReactorStorageConfig;
  cdnUrl?: string;
  packageSpecs?: string[];
  packageSources?: WorkerPackageSource[];
  featureFlags?: Partial<ReactorFeatureFlags>;
  /** `null` builds no sync module; absent means {@link ChannelScheme.CONNECT}. */
  channelScheme?: ChannelScheme | null;
  /**
   * Builds the sync module on a lone `LocalChannelFactory`: local-ONLY, no gql
   * factory (multi-reactor W1.2). A gql `channelScheme` reactor adopts brokered
   * local peers without this, by composing a local factory onto its scheme
   * (W3.0); `channelScheme` is ignored when this is set.
   */
  localSync?: boolean;
};

const SCHEMES = new Set<string>(Object.values(ChannelScheme));

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`Invalid worker construct: ${field} must be string[]`);
  }
  return value as string[];
}

function asStorage(value: unknown): ReactorStorageConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "idb" || kind === "memory") {
    return { kind };
  }
  if (
    kind === "path" &&
    typeof (value as { dataDir?: unknown }).dataDir === "string"
  ) {
    return { kind: "path", dataDir: (value as { dataDir: string }).dataDir };
  }
  throw new Error(
    `Invalid worker construct: storage must be {kind:"idb"|"memory"} or {kind:"path",dataDir}`,
  );
}

function asScheme(value: unknown): ChannelScheme | null | undefined {
  if (value === undefined || value === null) {
    return value as null | undefined;
  }
  if (typeof value !== "string" || !SCHEMES.has(value)) {
    throw new Error(
      `Invalid worker construct: channelScheme must be null or one of ${[...SCHEMES].join(", ")}`,
    );
  }
  return value as ChannelScheme;
}

/**
 * Validates the untyped `construct` a `ReactorHost` hands its `build` hook.
 *
 * It arrives from another realm over `postMessage`, so nothing about it is
 * guaranteed by the type system — a tab on a different build of the library
 * is the normal case. Refusing a malformed construct here fails the boot with
 * a message the tab can read, instead of building a reactor over `undefined`.
 */
export function parseWorkerConstruct(raw: unknown): MonitorWorkerConstruct {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(
      "Invalid worker construct: expected an object from the tab's hello",
    );
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error(
      "Invalid worker construct: name must be a non-empty string",
    );
  }
  const namespace =
    typeof value.namespace === "string" && value.namespace !== ""
      ? value.namespace
      : reactorStorageNamespace(value.name);

  const construct: MonitorWorkerConstruct = { name: value.name, namespace };
  const storage = asStorage(value.storage);
  if (storage) {
    construct.storage = storage;
  }
  if (typeof value.cdnUrl === "string") {
    construct.cdnUrl = value.cdnUrl;
  }
  const specs = asStringArray(value.packageSpecs, "packageSpecs");
  if (specs) {
    construct.packageSpecs = specs;
  }
  if (value.packageSources !== undefined) {
    if (!Array.isArray(value.packageSources)) {
      throw new Error(
        "Invalid worker construct: packageSources must be an array",
      );
    }
    construct.packageSources = value.packageSources as WorkerPackageSource[];
  }
  if (value.featureFlags !== undefined) {
    if (typeof value.featureFlags !== "object" || value.featureFlags === null) {
      throw new Error(
        "Invalid worker construct: featureFlags must be an object",
      );
    }
    construct.featureFlags = value.featureFlags as Partial<ReactorFeatureFlags>;
  }
  const scheme = asScheme(value.channelScheme);
  if (scheme !== undefined) {
    construct.channelScheme = scheme;
  }
  if (value.localSync !== undefined) {
    if (typeof value.localSync !== "boolean") {
      throw new Error("Invalid worker construct: localSync must be a boolean");
    }
    construct.localSync = value.localSync;
  }
  return construct;
}

/** The cloneable construct a descriptor boots its worker with. */
export function toWorkerConstruct(
  descriptor: ReactorDescriptor,
): MonitorWorkerConstruct {
  const construct: MonitorWorkerConstruct = {
    name: descriptor.name,
    namespace: reactorStorageNamespace(descriptor.name),
  };
  if (descriptor.storage) {
    construct.storage = descriptor.storage;
  }
  if (descriptor.packages?.cdnUrl !== undefined) {
    construct.cdnUrl = descriptor.packages.cdnUrl;
  }
  if (descriptor.packages?.specs) {
    construct.packageSpecs = descriptor.packages.specs;
  }
  if (descriptor.packages?.sources) {
    construct.packageSources = descriptor.packages.sources;
  }
  if (descriptor.featureFlags) {
    construct.featureFlags = descriptor.featureFlags;
  }
  if (descriptor.sync?.channelScheme !== undefined) {
    construct.channelScheme = descriptor.sync.channelScheme;
  }
  if (descriptor.sync?.local !== undefined) {
    construct.localSync = descriptor.sync.local;
  }
  return construct;
}

/**
 * The capability-relevant facts of whatever construct actually won the
 * build, reported over the "builtConfig" admin op (multi-reactor stage 2
 * review: a worker builds once and `ReactorHost` silently drops every
 * construct after the first, so a later-connecting tab's own descriptor is
 * not a safe thing to derive capabilities from).
 */
export type BuiltWorkerConfig = {
  storage: ReactorStorageConfig;
  /**
   * `BuiltReactor.syncChannelTypes`: the `ChannelConfig.type`s the worker's
   * channel factory actually routes.
   *
   * Reported instead of the construct's `channelScheme`/`localSync` on purpose.
   * Those two name a REQUEST, and the tab would have to re-run the builder's
   * branches on them to guess what routes -- which is how the tab came to put
   * `adoptLocalSyncPeer` on a handle whose worker had no local factory, and to
   * withhold it from one that did. The worker reads the fact off the factory it
   * built and sends that; the tab reads it, and neither side re-derives.
   */
  syncChannelTypes: readonly string[];
  canSelfHeal: boolean;
};

/**
 * The {@link BuiltWorkerConfig} for the construct that won, plus the two facts
 * only the built reactor knows.
 */
export function builtWorkerConfigOf(
  construct: MonitorWorkerConstruct,
  canSelfHeal: boolean,
  syncChannelTypes: readonly string[],
): BuiltWorkerConfig {
  return {
    storage: construct.storage ?? DEFAULT_REACTOR_STORAGE,
    syncChannelTypes: [...syncChannelTypes],
    canSelfHeal,
  };
}

/**
 * Validates the untyped payload the "builtConfig" admin op answers with.
 * Reuses the same realm-boundary discipline as {@link parseWorkerConstruct}:
 * it arrives over `postMessage` from a worker that may be on a different
 * build, so nothing about its shape is guaranteed by the type system.
 */
export function parseBuiltWorkerConfig(raw: unknown): BuiltWorkerConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(
      "Invalid built worker config: expected an object from the builtConfig admin op",
    );
  }
  const value = raw as Record<string, unknown>;
  const storage = asStorage(value.storage) ?? DEFAULT_REACTOR_STORAGE;
  // Required, not defaulted: a worker on a build that predates the routing
  // report cannot answer this, and silently reading its silence as "routes
  // nothing" would hide a real version skew behind a plausible-looking
  // contract. Refusing the payload sends the tab down the conservative
  // no-local fallback WITH a warning naming the worker.
  const syncChannelTypes = asStringArray(
    value.syncChannelTypes,
    "syncChannelTypes",
  );
  if (!syncChannelTypes) {
    throw new Error(
      "Invalid built worker config: syncChannelTypes must be string[]; a worker that does not report the channel types it routes cannot be taken to serve any",
    );
  }
  if (typeof value.canSelfHeal !== "boolean") {
    throw new Error(
      "Invalid built worker config: canSelfHeal must be a boolean",
    );
  }
  return {
    storage,
    syncChannelTypes,
    canSelfHeal: value.canSelfHeal,
  };
}
