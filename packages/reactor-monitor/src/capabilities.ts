import {
  ChannelScheme,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
} from "@powerhousedao/reactor";
import { DEFAULT_REACTOR_STORAGE } from "./store.js";
import { isLocalOnlySync } from "./sync-mode.js";
import type { ReactorDescriptor, ReactorKind } from "./types.js";

/**
 * Where the reactor's code actually runs. Mirrors {@link ReactorKind}, kept as
 * its own name because this is the field a ROUTER reads, and a router does not
 * care how the monitor spelled the descriptor.
 *
 * - `worker`: a SharedWorker in this origin, reached over RPC.
 * - `in-process`: the calling thread; every component is reachable directly.
 * - `remote`: an already-running reactor behind HTTP/GraphQL (stage 3).
 */
export type ReactorHosting = ReactorKind;

/**
 * Where the reactor keeps its authoritative operation store.
 *
 * - `idb`: browser IndexedDB-backed PGlite; survives a reload.
 * - `memory`: ephemeral PGlite; gone with the realm.
 * - `path`: a data directory on a Node host.
 * - `remote`: the store lives on the far side of the wire and is not this
 *   process's to open, close or heal.
 */
export type ReactorStorageKind = "idb" | "memory" | "path" | "remote";

/**
 * How {@link ManagedReactorBase.inspector} reaches the reactor's internals.
 *
 * - `direct`: live components, synchronous truth, no serialization limits.
 * - `rpc`: a proxy over a message port; everything is structured-cloned, so
 *   only what the dispatch layer models crosses (see the plan's W0.5 note on
 *   mailbox state).
 * - `none`: no inspection surface at all. A router must not promise
 *   observability for such a target.
 */
export type ReactorInspectionTransport = "direct" | "rpc" | "none";

/**
 * A sync transport the reactor can actually form a remote on, spelled EXACTLY
 * as the `ChannelConfig.type` the reactor routes it under -- these are the
 * reactor's own channel-type constants, not a monitor-side abstraction over
 * them:
 *
 * - `gql` ({@link GQL_CHANNEL_TYPE}): a Connect reactor's request channel. It
 *   polls a Switchboard, and a holder can ADD one by naming a URL, which is
 *   what makes it the only channel the monitor's add-remote form can create.
 * - `polling` ({@link POLLING_CHANNEL_TYPE}): a Switchboard reactor's response
 *   channel. Resolver-driven: it comes into being when a peer calls
 *   `registerChannel` against this reactor, so there is nothing for a holder
 *   to "add" from this side.
 * - `local` ({@link LOCAL_CHANNEL_TYPE}): a brokered-`MessagePort`
 *   `LocalChannel` peer (multi-reactor W1.2).
 *
 * Literal rather than abstract on purpose. An earlier reading labelled every
 * gql scheme `"gql"`, which made a SWITCHBOARD-scheme reactor claim a channel
 * type it does not route: the add-remote form would have offered to create a
 * `{type:"gql"}` remote that its `GqlResponseChannelFactory` refuses. Carrying
 * the literal truth here and letting each reader decide what it can do with a
 * given type keeps the contract free of a translation layer that could only
 * ever be wrong in one direction.
 *
 * A reactor declares one entry per composed factory (multi-reactor W3.0): a
 * CONNECT-scheme reactor declares `["gql", "local"]`, because the builder
 * composes its scheme factory and a `LocalChannelFactory` in a
 * `CompositeChannelFactory` that routes each remote on its channel type.
 * Modelled as a set because that is the shape a router needs to intersect two
 * reactors' transports.
 */
export type ReactorSyncChannel =
  | typeof GQL_CHANNEL_TYPE
  | typeof POLLING_CHANNEL_TYPE
  | typeof LOCAL_CHANNEL_TYPE;

/** Every channel type this contract has a row for; see {@link ReactorSyncChannel}. */
const REACTOR_SYNC_CHANNELS: readonly ReactorSyncChannel[] = [
  GQL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
];

function isReactorSyncChannel(type: string): type is ReactorSyncChannel {
  return REACTOR_SYNC_CHANNELS.some((known) => known === type);
}

/** The reactor's store, and whether an acknowledged write outlives the realm. */
export type ReactorStorageCapability = {
  readonly kind: ReactorStorageKind;
  /**
   * True when a committed write survives the host going away. False for
   * `memory`, which is also what disqualifies a reactor from
   * {@link ReactorCapabilities.selfHeal}: there is nothing to reopen.
   */
  readonly durable: boolean;
};

/**
 * What one monitored reactor can and cannot do -- the explicit, typed,
 * queryable form of "capability variance across environments is a fact to
 * model explicitly, not paper over" (docs/plans/2026-10-03-multi-reactor.md,
 * stage 2).
 *
 * THIS IS A CONTRACT. It is the input the router client (plan: "Router
 * client", stages 1-3) selects targets on: placement, which reactor may host a
 * processor or fire a workflow trigger, which pair of reactors can be linked,
 * and what observability a caller may expect of a target. Every field is
 * therefore a statement about the reactor as BUILT -- read from the built
 * reactor itself wherever the descriptor cannot state it (see
 * {@link BuiltCapabilityFacts}) -- not a runtime health reading and not a wish.
 * Health lives in `IInspector` (`getStorageHealth`, `inspectRemotes`); this is
 * static for the life of the instance, which is what makes it cacheable by a
 * router.
 *
 * Adding a field is a contract change: a router that routes on it has to be
 * taught what it means first.
 */
export interface ReactorCapabilities {
  /** Where the reactor runs; see {@link ReactorHosting}. */
  readonly hosting: ReactorHosting;
  /** The authoritative operation store and its durability. */
  readonly storage: ReactorStorageCapability;
  /**
   * Whether this reactor can host processor factories.
   *
   * A factory is a FUNCTION, and functions do not survive `postMessage`, so a
   * worker-hosted reactor cannot be handed one from the tab -- exactly Connect's
   * live limitation (`apps/connect/src/store/reactor.ts`: processors are
   * silently skipped on the worker path; plan backlog item 2). In-process
   * reactors can, because the factory and the processor manager share a realm.
   * A remote reactor registers its own factories on its own side.
   *
   * A router must place a drive whose analytics/read-model processors must run
   * on a reactor where this is true.
   */
  readonly processors: boolean;
  /**
   * Whether this reactor may run the workflow engine.
   *
   * Always false for the browser hosting kinds: the engine forks child
   * processes and is Node-only, and workflow execution is a singleton pinned to
   * one designated Node reactor (plan agreed decision 3). A browser reactor
   * syncs workflow DOCUMENTS like any other document (asserted by
   * `test/workflow-assertions.test.ts`) and must never register the trigger
   * read model.
   */
  readonly workflows: boolean;
  /** How the inspector reaches the reactor; see {@link ReactorInspectionTransport}. */
  readonly inspection: ReactorInspectionTransport;
  /**
   * The sync transports this reactor can form a remote on, read off the
   * channel factory it was BUILT with ({@link BuiltReactor.syncChannelTypes})
   * and spelled as the `ChannelConfig.type`s it routes. Empty when the reactor
   * was built with no sync module at all (`sync.channelScheme: null`) -- such a
   * reactor is an island and no link of any kind can be made to it.
   *
   * `linkLocalSync` enforces its precondition through this field, the worker
   * handle exposes its adopt/remove methods on it, and the monitor's two sync
   * forms gate on it, so the contract and the behaviour cannot drift.
   */
  readonly syncChannels: readonly ReactorSyncChannel[];
  /**
   * Whether a poisoned PGlite session is recovered in place (W0.7/W0.8: the
   * instance is recreated against the same durable store and every holder
   * rewires) rather than ending the reactor.
   *
   * Requires a durable store this process opened: a `memory` store has nothing
   * to reopen without data loss, and a remote store is not ours to heal. A
   * router reading `selfHeal: false` knows a storage fault on that target is
   * terminal, not a blip.
   */
  readonly selfHeal: boolean;
}

/**
 * The facts about a reactor that only the BUILT reactor can state, and that
 * {@link reactorCapabilities} must therefore be GIVEN rather than re-derive
 * from the descriptor that asked for them.
 *
 * Both fields exist because the descriptor cannot express them:
 *
 * - `canSelfHeal`: whether this process owns a store it can reopen in place. A
 *   caller-supplied `pg` is the caller's to reopen and has no representation in
 *   a {@link ReactorDescriptor} at all, so durability alone would read `true`
 *   for a reactor that cannot heal.
 * - `syncChannelTypes`: which `ChannelConfig.type`s the built channel factory
 *   actually routes. `sync.local` and `channelScheme` describe a REQUEST; what
 *   routes is whatever factories were composed, which is also what a worker
 *   reports back over its built-config op after a later tab's descriptor lost
 *   the race to the construct that won the build (multi-reactor stage 2
 *   review).
 *
 * Required together, and supplied together, so a caller cannot thread one true
 * fact and leave the other to an approximation.
 */
export type BuiltCapabilityFacts = {
  readonly canSelfHeal: boolean;
  readonly syncChannelTypes: readonly string[];
};

/**
 * The contract rows for the channel types a BUILT reactor reports routing
 * ({@link BuiltReactor.syncChannelTypes}). This is the path every provisioned
 * reactor takes.
 *
 * A type this contract has no row for is dropped rather than passed through:
 * `syncChannels` is what a router selects on, and a router cannot route on a
 * transport it has never been taught. The monitor composes only the three
 * channel types {@link ReactorSyncChannel} names, so this filters nothing in
 * practice -- it exists so a reactor built with a custom factory downgrades to
 * "cannot be routed on that" instead of widening the contract silently.
 */
function builtSyncChannels(
  types: readonly string[],
): readonly ReactorSyncChannel[] {
  return types.filter(isReactorSyncChannel);
}

/**
 * The sync transports a descriptor's sync config WOULD resolve to, for the two
 * rows that have no built reactor to read: the `remote` kind (nothing is built
 * in this process at all) and a pre-provision query against a descriptor.
 *
 * Deliberately NOT how a provisioned reactor's capabilities are derived --
 * {@link builtSyncChannels} is -- because this can only restate the request.
 * It mirrors `buildMonitorReactor`'s branches: `sync.local` wins over
 * `channelScheme` and means local-ONLY (a lone `LocalChannelFactory`, no gql
 * factory at all), an explicit `channelScheme: null` builds no sync module and
 * so declares nothing, and a gql scheme declares its own type plus `local`,
 * which the builder composes onto it (multi-reactor W3.0).
 */
function descriptorSyncChannels(
  descriptor: ReactorDescriptor,
): readonly ReactorSyncChannel[] {
  if (descriptor.kind === "remote") {
    // Attached over the existing GQL channels (plan W3.1). Nothing on the far
    // side of the wire can be handed a MessagePort, so no local channel.
    return [GQL_CHANNEL_TYPE];
  }
  if (isLocalOnlySync(descriptor.sync?.local)) {
    return [LOCAL_CHANNEL_TYPE];
  }
  const scheme = descriptor.sync?.channelScheme;
  if (scheme === null) {
    return [];
  }
  return schemeSyncChannels(scheme ?? ChannelScheme.CONNECT);
}

/**
 * What one gql {@link ChannelScheme} contributes, plus the `local` channel the
 * builder composes onto every scheme. Exhaustive with a never-check so a new
 * scheme cannot silently inherit the CONNECT row and mislabel its channel.
 */
function schemeSyncChannels(
  scheme: ChannelScheme,
): readonly ReactorSyncChannel[] {
  switch (scheme) {
    case ChannelScheme.CONNECT:
      return [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE];
    case ChannelScheme.SWITCHBOARD:
      return [POLLING_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE];
    default: {
      const unsupported: never = scheme;
      throw new Error(
        `Unsupported channel scheme: ${JSON.stringify(unsupported)}`,
      );
    }
  }
}

/** The store class and durability a descriptor resolves to. */
function storageOf(descriptor: ReactorDescriptor): ReactorStorageCapability {
  if (descriptor.kind === "remote") {
    return { kind: "remote", durable: true };
  }
  const kind = descriptor.storage?.kind ?? DEFAULT_REACTOR_STORAGE.kind;
  return { kind, durable: kind !== "memory" };
}

/** How the inspector reaches a reactor of this hosting kind. */
function inspectionOf(hosting: ReactorHosting): ReactorInspectionTransport {
  switch (hosting) {
    case "in-process":
      return "direct";
    case "worker":
      return "rpc";
    case "remote":
      // No remote inspection surface exists yet; W3.2 serves `IInspector` over
      // HTTP/GraphQL from reactor-api and raises this to "rpc".
      return "none";
  }
}

/**
 * Derives a reactor's {@link ReactorCapabilities} from its descriptor.
 *
 * Called once per reactor at provision time, and the result is frozen onto the
 * handle: capabilities are a property of how the reactor was BUILT, so they
 * cannot change under a holder, and a router may cache them for the life of the
 * instance.
 *
 * Total over {@link ReactorKind} on purpose, `remote` included, even though
 * `provision()` still refuses that kind: the router is written against this
 * table, and a row that only appears once stage 3 lands is a row the router
 * design cannot account for. The `remote` row states today's truth (no
 * inspection surface, nothing here to self-heal), not stage 3's intent.
 *
 * `built` carries the facts the descriptor alone cannot express, and every
 * provisioned reactor passes it; see {@link BuiltCapabilityFacts}. Omitting it
 * leaves the descriptor-only APPROXIMATION, which is the right answer for
 * exactly two rows -- the `remote` kind, which this process builds nothing for,
 * and a pre-provision query about a descriptor that has not been built yet --
 * and a guess for every other. A caller that has a built reactor and omits it
 * states what was requested rather than what exists.
 */
export function reactorCapabilities(
  descriptor: ReactorDescriptor,
  built?: BuiltCapabilityFacts,
): ReactorCapabilities {
  const hosting = descriptor.kind;
  const storage = storageOf(descriptor);
  return Object.freeze({
    hosting,
    storage: Object.freeze(storage),
    // A worker cannot be handed a factory function over postMessage.
    processors: hosting !== "worker",
    // The engine forks child processes and is Node-only (agreed decision 3);
    // `remote` is the only hosting kind that can be a Node reactor.
    workflows: hosting === "remote",
    inspection: inspectionOf(hosting),
    syncChannels: Object.freeze(
      built
        ? builtSyncChannels(built.syncChannelTypes)
        : descriptorSyncChannels(descriptor),
    ),
    // `remote`'s store lives on the far side and is never ours to reopen;
    // otherwise defer to the actual built fact when one is known.
    selfHeal:
      hosting !== "remote" && (built ? built.canSelfHeal : storage.durable),
  });
}

/**
 * The capabilities to claim for a reactor whose built facts could NOT be read
 * -- today only a worker whose "builtConfig" admin round-trip failed
 * (`worker/client.ts`), which is also the shape of a tab talking to a worker on
 * an older build that does not report them at all.
 *
 * Conservative about `local` specifically, and that asymmetry is the point.
 * Declaring `local` puts `adoptLocalSyncPeer`/`removeLocalSyncPeer` on the
 * handle and lets `linkLocalSync` proceed, so a wrong `true` is discovered only
 * after a `MessageChannel` has been opened and one end TRANSFERRED into the
 * worker -- a failure with side effects where the whole design is a fail-fast
 * before any port moves. A wrong `false` only refuses a link that a
 * re-provision would then allow. So an unverifiable reactor claims no local
 * channel, whatever its descriptor asked for.
 */
export function unverifiedReactorCapabilities(
  descriptor: ReactorDescriptor,
): ReactorCapabilities {
  const approximated = reactorCapabilities(descriptor);
  return reactorCapabilities(descriptor, {
    canSelfHeal: approximated.selfHeal,
    syncChannelTypes: approximated.syncChannels.filter(
      (channel) => channel !== LOCAL_CHANNEL_TYPE,
    ),
  });
}

/**
 * Whether the reactor can form a remote on `channel`. The single place the
 * {@link ReactorCapabilities.syncChannels} contract is read, so a linker and a
 * router answer the question the same way.
 */
export function supportsSyncChannel(
  capabilities: ReactorCapabilities,
  channel: ReactorSyncChannel,
): boolean {
  return capabilities.syncChannels.includes(channel);
}
