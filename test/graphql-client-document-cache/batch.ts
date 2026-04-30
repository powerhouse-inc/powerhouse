import { funnel } from "remeda";

type PromiseCallbacks<Result> = Readonly<
  Parameters<ConstructorParameters<typeof Promise<Result>>[0]>
>;

type BatchRequest<Params extends unknown[], Result> = {
  readonly params: Params;
  readonly promiseCallbacks: PromiseCallbacks<Result>;
};

export type Batch<Params extends unknown[], Result> = {
  call: (...params: Params) => Promise<Result>;
  cancel: () => void;
  flush: () => void;
  readonly isIdle: boolean;
};

/**
 * A reference implementation for an async batching utility function built on
 * top of the `funnel` general purpose execution utility function. It will
 * accumulate all params passed to an async `call` method within the defined
 * burst duration and then use an async executor to process them in one
 * invocation. It then extracts an individual result for each call which is
 * used to resolve the original call.
 *
 * This allows synchronizing multiple async calls while keeping each call site
 * isolated from the rest (for example, as react components).
 *
 * This reference implementation can be copied into your project as-is, or you
 * can use it as the basis for a more complex implementation with additional
 * features.
 *
 * @param callback - The main function that takes a batch and returns an
 * aggregated response. The typing for the it's parameters will derive the
 * typing for the extractor and the `call` method.
 * @param extractor - A function that takes the aggregated response and extracts
 * from it the result for each individual call. The function is called with both
 * the index in the batch, and the params passed to the `call` method. This
 * allows handling APIs that return batch results as both objects and arrays.
 * @param maxBurstDurationMs - The period of time where the batcher would
 * collect params before triggering the executor. When set to 0 the batcher
 * does not incur any additional delays to the execution and would trigger at
 * the next tick, just like a regular async function would. This is also the
 * default value.
 * @returns A Funnel object with the `call` method augmented to support async
 * response.
 */
export function batch<Params extends unknown[], BatchResponse, Result>(
  callback: (requests: readonly Params[]) => Promise<BatchResponse>,
  extractor: (
    response: BatchResponse,
    index: number,
    ...params: Params
  ) => Result,
  maxBurstDurationMs = 0,
): Batch<Params, Result> {
  const batchFunnel = funnel(
    (requests: readonly BatchRequest<Params, Result>[]) => {
      callback(requests.map(({ params }) => params))
        .then((response) => {
          for (const [
            index,
            {
              params,
              promiseCallbacks: [resolve, reject],
            },
          ] of requests.entries()) {
            try {
              const result = extractor(response, index, ...params);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        })
        .catch((error) => {
          for (const {
            promiseCallbacks: [, reject],
          } of requests) {
            reject(error);
          }
        });
    },
    {
      reducer: (
        requests: readonly BatchRequest<Params, Result>[] | undefined,
        request: BatchRequest<Params, Result>,
      ) => [...(requests ?? []), request],
      maxBurstDurationMs,
      triggerAt: "end",
    },
  );

  return {
    ...batchFunnel,

    call: (...params: Params) =>
      new Promise<Result>((...promiseCallbacks) => {
        batchFunnel.call({ promiseCallbacks, params });
      }),
  };
}
