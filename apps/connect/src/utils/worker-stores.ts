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

/** Closes and releases the worker's stores for retirement, a failed boot and the admin flows. */
export function createWorkerStores({
  locks,
  stopReactor,
  relational,
  reactor,
  forget,
  close = closeWithin,
}: Options) {
  // Returns the lock release: a store whose close hung keeps its lock until the worker dies.
  const closeAll = async (closer: StoreCloser): Promise<() => void> => {
    const relationalClosed = await closer(relational().store);
    const reactorClosed = await closer(reactor().store);
    const relationalNamespace = relational().namespace;
    const reactorNamespace = reactor().namespace;
    return () => {
      if (relationalClosed && relationalNamespace) {
        locks.release(relationalNamespace);
      }
      if (reactorClosed && reactorNamespace) {
        locks.release(reactorNamespace);
      }
    };
  };

  const releaseAll = async (): Promise<void> => {
    const release = await closeAll(close);
    forget();
    release();
  };

  return {
    releaseAfterBootFailure: releaseAll,
    /** A retired worker must stop writing before a fresh one opens the same stores. */
    retire: async (): Promise<void> => {
      await stopReactor();
      await releaseAll();
    },
    /** Closes the stores, then runs `flow`, which releases their locks once done with the files. */
    runAdmin: async (
      closer: StoreCloser,
      flow: (release: () => void) => Promise<void>,
    ): Promise<void> => {
      await flow(await closeAll(closer));
    },
    /** Closes a store whose open failed, keeping its lock if the close hangs. */
    releaseFailedOpen: async (
      namespace: string,
      store: Closable | undefined,
    ): Promise<void> => {
      if (await close(store)) locks.release(namespace);
    },
  };
}
