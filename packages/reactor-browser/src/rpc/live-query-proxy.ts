import { fromErrorInfo } from "./error-info.js";
import type { MessageRouter } from "./message-router.js";
import type { CorrelationId } from "./protocol.js";

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

export function createLiveQueryProxy(router: MessageRouter): ILiveQueryProxy {
  let counter = 0;
  const subscribers = new Map<CorrelationId, LiveSubscriber>();

  router.on("event-live", (msg) => {
    subscribers.get(msg.id)?.onResults(msg.results);
  });
  router.on("live-err", (msg) => {
    // terminal: drop the subscriber (the host already tore down its side)
    const subscriber = subscribers.get(msg.id);
    if (subscriber) {
      subscribers.delete(msg.id);
      subscriber.onError?.(fromErrorInfo(msg.error));
    }
  });

  return {
    query(sql, params, onResults, onError) {
      const id: CorrelationId = `live${++counter}`;
      subscribers.set(id, { onResults, onError });
      router.post({ k: "sub-live", id, sql, params });
      return () => {
        subscribers.delete(id);
        router.post({ k: "unsub-live", id });
      };
    },
  };
}
