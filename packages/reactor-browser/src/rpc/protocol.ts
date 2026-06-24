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
export const RPC_PROTOCOL_VERSION = 2;

export type VersionFingerprint = {
  appBuildId: string;
  rpcProtocolVersion: number;
  models: { id: string; version: number }[];
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
  method: "info" | "restart";
};

export type WorkerInspectorInfo = {
  namespace: string;
  ownerId: string;
  bootedAtMs: number;
  connectedClients: number;
  appBuildId: string;
  rpcProtocolVersion: number;
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

// Request/response for syncManager commands (add/remove/triggerPull/list); the
// reply value is the reactor's RemoteMeta (its DriveCollectionId degrades to
// plain {driveId,branch} over postMessage and is rehydrated tab-side).
export type RpcSyncOp = {
  k: "sync-op";
  id: CorrelationId;
  method: string;
  args: unknown[];
};

export type RpcDbOp = {
  k: "db-op";
  id: CorrelationId;
  method: string;
  args: unknown[];
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
  rows: unknown[];
};

export type RpcLiveUnsub = { k: "unsub-live"; id: CorrelationId };

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
  | RpcLiveSubscribe
  | RpcLiveUnsub;

export type OwnerMessage =
  | RpcResponse
  | RpcError
  | RpcEvent
  | RpcReload
  | RpcBusEvent
  | RpcLiveEvent;

export type RpcMessage = ClientMessage | OwnerMessage;
