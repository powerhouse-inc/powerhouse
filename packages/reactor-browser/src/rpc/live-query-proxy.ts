import { fromErrorInfo } from "./error-info.js";
import type { MessageRouter } from "./message-router.js";
import { createCorrelatedSubscriptions } from "./subscription.js";

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
  const subs = createCorrelatedSubscriptions<
    LiveSubscriber,
    "event-live",
    "live-err"
  >(router, {
    idPrefix: "live",
    eventKind: "event-live",
    errKind: "live-err",
    onEvent: (sub, msg) => sub.onResults(msg.results),
    onError: (sub, msg) => sub.onError?.(fromErrorInfo(msg.error)),
    close: (id) => ({ k: "unsub-live", id }),
  });

  return {
    query(sql, params, onResults, onError) {
      return subs.subscribe({ onResults, onError }, (id) => ({
        k: "sub-live",
        id,
        sql,
        params,
      }));
    },
  };
}
