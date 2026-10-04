import { DEFAULT_REACTOR_STORAGE } from "./store.js";
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
 * A sync transport the reactor can actually form a remote on.
 *
 * - `gql`: the Connect/Switchboard GraphQL channels (poll or resolver driven).
 * - `local`: a brokered-`MessagePort` `LocalChannel` peer (multi-reactor W1.2).
 *
 * A reactor wires ONE channel factory, so this is at most one entry today; it
 * is modelled as a set because that is the shape a router needs to intersect
 * two reactors' transports, and because a reactor that wires several factories
 * is a plausible later change that must not break the contract's type.
 */
export type ReactorSyncChannel = "gql" | "local";

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
 * therefore a statement about the reactor as provisioned, derived from its
 * descriptor alone -- not a runtime health reading and not a wish. Health lives
 * in `IInspector` (`getStorageHealth`, `inspectRemotes`); this is static for
 * the life of the instance, which is what makes it cacheable by a router.
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
   * The sync transports this reactor can form a remote on, derived from the
   * descriptor's sync mode. Empty when the reactor was built with no sync
   * module at all (`sync.channelScheme: null`) -- such a reactor is an island
   * and no link of any kind can be made to it.
   *
   * `linkLocalSync` enforces its precondition through this field, so the
   * contract and the behaviour cannot drift.
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
 * The sync transports a descriptor's sync config resolves to.
 *
 * `sync.local` wins over `channelScheme` exactly as `buildMonitorReactor` does
 * -- a local-sync reactor is local-only because the builder wires one channel
 * factory and W1.2 is Switchboard-free. An explicit `channelScheme: null`
 * builds no sync module, hence no transports. Everything else (including an
 * absent `sync`) gets the gql default.
 */
function syncChannelsOf(
  descriptor: ReactorDescriptor,
): readonly ReactorSyncChannel[] {
  if (descriptor.kind === "remote") {
    // Attached over the existing GQL channels (plan W3.1).
    return ["gql"];
  }
  if (descriptor.sync?.local) {
    return ["local"];
  }
  if (descriptor.sync?.channelScheme === null) {
    return [];
  }
  return ["gql"];
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
 * `built`, when supplied, carries the one fact the descriptor alone cannot
 * express: whether this process actually owns a reopenable store
 * (`BuiltReactor.canSelfHeal`, `build-reactor.ts`). A caller-supplied `pg`
 * has no representation in {@link ReactorDescriptor} at all, so a worker's
 * built-config report (multi-reactor stage 2 review) and `provisionInProcess`
 * both pass the actual built value rather than let `selfHeal` be re-derived
 * from storage durability alone and risk disagreeing with the real reactor.
 * Omitted, `selfHeal` falls back to the durability-only approximation, which
 * is exact for every descriptor that never reaches a caller-supplied `pg`.
 */
export function reactorCapabilities(
  descriptor: ReactorDescriptor,
  built?: { readonly canSelfHeal: boolean },
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
    syncChannels: Object.freeze(syncChannelsOf(descriptor)),
    // `remote`'s store lives on the far side and is never ours to reopen;
    // otherwise defer to the actual built fact when one is known.
    selfHeal:
      hosting !== "remote" && (built ? built.canSelfHeal : storage.durable),
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
