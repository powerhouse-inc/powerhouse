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
  // index of the arg that held an AbortSignal, stripped before posting
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

// fetches the next page of a PagedResults; its `next` closure lives owner-side
export type RpcNextPage = { k: "page"; id: CorrelationId; token: string };

export type ClientMessage =
  | RpcRequest
  | RpcAbort
  | RpcSubscribe
  | RpcUnsub
  | RpcNextPage;

export type OwnerMessage = RpcResponse | RpcError | RpcEvent;

export type RpcMessage = ClientMessage | OwnerMessage;
