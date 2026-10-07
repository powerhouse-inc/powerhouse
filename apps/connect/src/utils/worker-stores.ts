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
  /** True once the worker told its tabs to leave; its stores may be another's. */
  isRetired: () => boolean;
  /** Retires the worker, reloading every tab, now and later, into a fresh one. */
  retireWorker: (reason: string) => void;
  close?: StoreCloser;
};

export type AdminFlow = {
  close: StoreCloser;
  /** Runs once the flow is let through, before the reactor stops. */
  begin?: () => void;
  /** Works on the closed stores' files; resolves to the reload reason. */
  run: () => Promise<string>;
  /** The reload reason when `run` throws. */
  failed: string;
};

/** Every close and release of the worker's stores, run one flow at a time. */
export function createWorkerStores({
  locks,
  stopReactor,
  relational,
  reactor,
  forget,
  isRetired,
  retireWorker,
  close = closeWithin,
}: Options) {
  // Closed but not yet released by the closing flow; a hung close stays here.
  const kept = new Set<string>();
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
    /** Retires if a store did not close: a rebuild would open it twice. */
    releaseAfterBootFailure: () =>
      serial(async () => {
        await releaseAll();
        if (kept.size > 0) {
          retireWorker("a store did not close after a failed boot");
        }
      }),
    /** A retired worker must stop writing before a fresh one opens the same stores. */
    retire: (): Promise<void> =>
      serial(async () => {
        await stopReactor();
        await releaseAll();
      }),
    /** Stops the worker for good: it retires once `run` settles, either way. */
    runAdmin: ({
      close: closer,
      begin,
      run,
      failed,
    }: AdminFlow): Promise<void> =>
      serial(async () => {
        // A retired worker's stores may already be another worker's.
        if (isRetired()) {
          throw new Error(
            "This worker no longer owns its stores; reload into the current one",
          );
        }
        begin?.();
        await stopReactor();
        const release = await closeAll(closer);
        let reason = failed;
        try {
          reason = await run();
        } finally {
          release();
          retireWorker(reason);
        }
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
