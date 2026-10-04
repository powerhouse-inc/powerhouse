import type { RemoteFilter } from "@powerhousedao/reactor";

export type CorrelationId = string;

export type ErrorInfo = {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorInfo;
};

export type RpcRequest = {
  k: "req";
  id: CorrelationId;
  method: string;
  args: unknown[];
  abortAt?: number;
};

export type RpcResponse = { k: "res"; id: CorrelationId; value: unknown };

export type RpcError = { k: "err"; id: CorrelationId; error: ErrorInfo };

/** Failed document subscribe; routed to the change-subscription registry. */
export type RpcSubError = { k: "sub-err"; id: CorrelationId; error: ErrorInfo };

/** Failed live query; routed to the live-query registry. */
export type RpcLiveError = {
  k: "live-err";
  id: CorrelationId;
  error: ErrorInfo;
};

export type RpcAbort = { k: "abort"; targetId: CorrelationId };

export type RpcSubscribe = {
  k: "sub";
  id: CorrelationId;
  search: unknown;
  view?: unknown;
};

export type RpcEvent = { k: "event"; id: CorrelationId; change: unknown };

export type RpcUnsub = { k: "unsub"; id: CorrelationId };

export type RpcNextPage = { k: "page"; id: CorrelationId; token: string };

// Bumped when the tab<->owner wire protocol changes incompatibly; a tab whose
// version differs from the owner's baseline is told to reload.
export const RPC_PROTOCOL_VERSION = 3;

/**
 * A package the worker loads by URL rather than by registry spec: local
 * project packages, whose models the registry does not serve. The URL must be
 * a worker-importable models entry - the dev server's transformed
 * `document-models/index.js` in dev, a prebuilt bundle under
 * `__reactor_worker__/packages/` in production.
 */
export type WorkerPackageSource = {
  name: string;
  version?: string;
  url: string;
};

/**
 * What a tab tells the worker about the build it is running, so the worker can
 * tell whether it may serve that tab (see `ReactorHost.handleHello`).
 *
 * `appBuildId` is opaque: the host only ever compares it for equality.
 */
export type VersionFingerprint = {
  appBuildId: string;
  rpcProtocolVersion: number;
  models: { id: string; version: number }[];
  // Enabled enforcement flags, sorted and joined. In the fingerprint so a
  // worker cannot keep enforcing the set it booted with after a config change.
  featureFlags?: string;
  /**
   * Content token of the worker bundle this tab resolved, where the deployment
   * serves one and the tab could read it (dev; see
   * `apps/connect/src/utils/reactor-worker-url.ts`). Separate from
   * `appBuildId` because it can be ABSENT for a tab of the very same build --
   * the metadata fetch is per-tab and can fail transiently -- and an absent
   * token has to read as "unknown", not as "a different build". Additive: a
   * tab that never sends it is treated leniently, so no protocol bump.
   */
  buildDigest?: string;
};

export type RpcHello = {
  k: "hello";
  id: CorrelationId;
  version: VersionFingerprint;
  construct?: unknown;
  packages?: string[];
};

export type RpcRegisterPackages = {
  k: "register-packages";
  id: CorrelationId;
  specs: string[];
  /** URL-addressed packages; the worker REPLACES a source it already loaded. */
  sources?: WorkerPackageSource[];
};

export type RpcUnregisterPackages = {
  k: "unregister-packages";
  id: CorrelationId;
  names: string[];
};

// `workerGen` (present on restart-driven reloads) is the new SharedWorker name
// suffix every tab should adopt so they converge on one fresh worker.
export type RpcReload = { k: "reload"; reason: string; workerGen?: string };

// Worker lifecycle/admin channel, separate from the IReactorClient RPC surface.
export type RpcAdmin = {
  k: "admin";
  id: CorrelationId;
  method: "info" | "restart" | "clearStorage" | "migrate";
};

export type WorkerMigrationState = {
  status: "idle" | "needed" | "migrating" | "failed";
  legacyMajor?: number;
  phase?: "clone" | "dump" | "restore";
  error?: string;
};

// Owner -> tab push of the worker's migration state (initial seed on connect +
// on every change), so tabs can drive the migration banner from one flag.
export type RpcMigration = { k: "migration"; state: WorkerMigrationState };

export type WorkerInspectorInfo = {
  namespace: string;
  ownerId: string;
  bootedAtMs: number;
  connectedClients: number;
  appBuildId: string;
  rpcProtocolVersion: number;
  /** Flags this worker is enforcing, from the fingerprint that built it. */
  featureFlags?: string;
};

// Cloneable subset of renown's user (matches UserActionSigner); token minting + attribution.
export type ReactorIdentity = {
  address: string;
  chainId: number;
  networkId: string;
};

export type RpcIdentity = { k: "identity"; user: ReactorIdentity | null };

// Distributed EventBus: worker -> all tabs, fire-and-forget. `eventType` is a
// reactor IEventBus numeric type; `event` is the (cloneable) payload.
export type RpcBusEvent = { k: "bus-event"; eventType: number; event: unknown };

export type OpKind = "sync-op" | "db-op" | "inspector-op";

export type MethodCallMessage<K extends OpKind> = {
  k: K;
  id: CorrelationId;
  method: string;
  args: unknown[];
};

// syncManager commands (add/remove/triggerPull/list); the reply value is the
// reactor's RemoteMeta (its DriveCollectionId degrades to plain
// {driveId,branch} over postMessage and is rehydrated tab-side).
export type RpcSyncOp = MethodCallMessage<"sync-op">;

export type RpcDbOp = MethodCallMessage<"db-op">;

export type RpcInspectorOp = MethodCallMessage<"inspector-op">;

/**
 * Delivers one end of a monitor-brokered `MessageChannel` into a worker
 * reactor and asks it to adopt the peer as a {@link LOCAL_CHANNEL_TYPE} remote
 * (multi-reactor W1.2 -- see docs/plans/2026-10-03-multi-reactor.md).
 *
 * `port` is a live {@link MessagePort}, so this message MUST be posted with
 * `port` in the transfer list -- it is moved into the worker, never cloned. The
 * worker registers it under {@link peerId}/{@link channelName} with its
 * `LocalChannelTransportProvider` and adds a local remote for
 * {@link collectionIdKey}/{@link filter}, so `LocalChannelFactory` resolves the
 * brokered port the handshake then runs over.
 *
 * Additive to the wire protocol: a worker that predates it never handles the
 * kind, so no {@link RPC_PROTOCOL_VERSION} bump -- the monitor provisions both
 * ends from one build.
 */
export type RpcAdoptSyncPeer = {
  k: "adopt-sync-peer";
  id: CorrelationId;
  peerId: string;
  channelName: string;
  collectionIdKey: string;
  remoteName: string;
  filter: RemoteFilter;
  port: MessagePort;
};

export type RpcLiveSubscribe = {
  k: "sub-live";
  id: CorrelationId;
  sql: string;
  params: unknown[];
};

export type RpcLiveEvent = {
  k: "event-live";
  id: CorrelationId;
  results: unknown;
};

export type RpcLiveUnsub = { k: "unsub-live"; id: CorrelationId };

// Liveness heartbeat. The tab pings; the owner answers synchronously (even
// mid-build/mid-migration) so a silently-evicted worker is detectable. The pong
// echoes ownerId/bootedAtMs so a respawned (different) instance is identifiable.
export type RpcPing = { k: "ping"; id: CorrelationId };

export type RpcPong = {
  k: "pong";
  id: CorrelationId;
  ownerId: string;
  bootedAtMs: number;
};

export type ClientMessage =
  | RpcRequest
  | RpcAbort
  | RpcSubscribe
  | RpcUnsub
  | RpcNextPage
  | RpcHello
  | RpcRegisterPackages
  | RpcUnregisterPackages
  | RpcIdentity
  | RpcAdmin
  | RpcSyncOp
  | RpcDbOp
  | RpcInspectorOp
  | RpcAdoptSyncPeer
  | RpcLiveSubscribe
  | RpcLiveUnsub
  | RpcPing;

export type OwnerMessage =
  | RpcResponse
  | RpcError
  | RpcSubError
  | RpcLiveError
  | RpcEvent
  | RpcReload
  | RpcBusEvent
  | RpcLiveEvent
  | RpcMigration
  | RpcPong;

export type RpcMessage = ClientMessage | OwnerMessage;

/** Error reply kind for a client message kind, so it reaches the right registry. */
export function responseErrorKind(
  k: ClientMessage["k"],
): "err" | "sub-err" | "live-err" {
  if (k === "sub") {
    return "sub-err";
  }
  if (k === "sub-live") {
    return "live-err";
  }
  return "err";
}
