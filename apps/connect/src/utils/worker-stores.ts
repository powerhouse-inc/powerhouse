import { closeWithin } from "./close-within.js";
import type { StoreLocks } from "./store-lock.js";

type Closable = { close: () => Promise<void> };

export type StoreCloser = (store: Closable | undefined) => Promise<boolean>;

export type OpenStore = { namespace?: string; store?: Closable };

type Options = {
  locks: StoreLocks;
  /** Stops the reactor and sync manager, bounded. */
  stopReactor: () => Promise<void>;
  relational: () => OpenStore;
  reactor: () => OpenStore;
  /** Clears the worker's refs to both stores. */
  forget: () => void;
  close?: StoreCloser;
};

/** Every close and release of the worker's stores, run one flow at a time. */
export function createWorkerStores({
  locks,
  stopReactor,
  relational,
  reactor,
  forget,
  close = closeWithin,
}: Options) {
  // Closed but not yet released by the closing flow; a hung close stays here.
  const kept = new Set<string>();
  // Once set, an admin flow could touch files another worker now owns.
  let handedOff = false;
  let tail: Promise<unknown> = Promise.resolve();

  const serial = <T>(flow: () => Promise<T>): Promise<T> => {
    const run = tail.then(flow);
    tail = run.catch(() => undefined);
    return run;
  };

  // Returns the lock release, covering only the stores this call closed.
  const closeAll = async (closer: StoreCloser): Promise<() => void> => {
    const open = [relational(), reactor()];
    forget();
    const closed: string[] = [];
    for (const { namespace, store } of open) {
      const done = await closer(store);
      if (!namespace) continue;
      if (done && !kept.has(namespace)) closed.push(namespace);
      kept.add(namespace);
    }
    return () => {
      for (const namespace of closed) {
        kept.delete(namespace);
        locks.release(namespace);
      }
    };
  };

  const releaseAll = async (): Promise<void> => {
    (await closeAll(close))();
  };

  return {
    releaseAfterBootFailure: () => serial(releaseAll),
    /** A retired worker must stop writing before a fresh one opens the same stores. */
    retire: (): Promise<void> => {
      handedOff = true;
      return serial(async () => {
        await stopReactor();
        await releaseAll();
      });
    },
    /** `flow` gets the closed stores' lock release, to call once done with the files. */
    runAdmin: (
      closer: StoreCloser,
      flow: (release: () => void) => Promise<void>,
    ): Promise<void> =>
      serial(async () => {
        if (handedOff) {
          throw new Error(
            "This worker no longer owns its stores; reload into the current one",
          );
        }
        handedOff = true;
        await stopReactor();
        await flow(await closeAll(closer));
      }),
    /** Closes a store whose open failed, keeping its lock if the close hangs. */
    releaseFailedOpen: async (
      namespace: string,
      store: Closable | undefined,
    ): Promise<void> => {
      if ((await close(store)) && !kept.has(namespace)) {
        locks.release(namespace);
      } else {
        kept.add(namespace);
      }
    },
  };
}
