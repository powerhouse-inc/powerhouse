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

export type RpcReload = { k: "reload"; reason: string };

// Cloneable subset of renown's user — action-signer attribution + the address
// the worker mints bearer tokens for. Matches UserActionSigner's shape.
export type ReactorIdentity = {
  address: string;
  chainId: number;
  networkId: string;
};

export type RpcIdentity = { k: "identity"; user: ReactorIdentity | null };

export type ClientMessage =
  | RpcRequest
  | RpcAbort
  | RpcSubscribe
  | RpcUnsub
  | RpcNextPage
  | RpcHello
  | RpcRegisterPackages
  | RpcUnregisterPackages
  | RpcIdentity;

export type OwnerMessage = RpcResponse | RpcError | RpcEvent | RpcReload;

export type RpcMessage = ClientMessage | OwnerMessage;
