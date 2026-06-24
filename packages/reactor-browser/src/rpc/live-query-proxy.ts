import { fromErrorInfo } from "./error-info.js";
import type { CorrelationId, OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export type LiveQueryResultsCallback = (results: unknown) => void;
export type LiveQueryErrorCallback = (error: unknown) => void;

export interface ILiveQueryProxy {
  query(
    sql: string,
    params: unknown[],
    onResults: LiveQueryResultsCallback,
    onError?: LiveQueryErrorCallback,
  ): () => void;
}

type LiveSubscriber = {
  onResults: LiveQueryResultsCallback;
  onError?: LiveQueryErrorCallback;
};

export function createLiveQueryProxy(
  transport: IRpcTransport,
): ILiveQueryProxy {
  let counter = 0;
  const subscribers = new Map<CorrelationId, LiveSubscriber>();

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k === "event-live") {
      subscribers.get(msg.id)?.onResults(msg.results);
    } else if (msg.k === "err") {
      subscribers.get(msg.id)?.onError?.(fromErrorInfo(msg.error));
    }
  });

  return {
    query(sql, params, onResults, onError) {
      const id: CorrelationId = `live${++counter}`;
      subscribers.set(id, { onResults, onError });
      transport.post({ k: "sub-live", id, sql, params });
      return () => {
        subscribers.delete(id);
        transport.post({ k: "unsub-live", id });
      };
    },
  };
}
