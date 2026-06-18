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

export type ClientMessage =
  | RpcRequest
  | RpcAbort
  | RpcSubscribe
  | RpcUnsub
  | RpcNextPage
  | RpcHello
  | RpcRegisterPackages
  | RpcUnregisterPackages;

export type OwnerMessage = RpcResponse | RpcError | RpcEvent | RpcReload;

export type RpcMessage = ClientMessage | OwnerMessage;
