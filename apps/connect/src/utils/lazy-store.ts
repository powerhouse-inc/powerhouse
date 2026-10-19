type Closable = { close: () => Promise<void> };

type Options<T extends Closable> = {
  /** Locks and opens the store; a failed open releases what it took. */
  open: (namespace: string) => Promise<T>;
  /** Closes a store opened after `forget`, releasing its lock. */
  discard: (namespace: string, store: T) => Promise<void>;
};

/** A store opened on its first use, not at boot. `forget` drops it and
 * disarms it until the next `arm`; an open in flight then closes itself. */
export function createLazyStore<T extends Closable>({
  open,
  discard,
}: Options<T>) {
  let namespace: string | undefined;
  let store: T | undefined;
  let opening: Promise<T | undefined> | undefined;
  let failed = false;
  let epoch = 0;
  let lastOpen: Promise<unknown> = Promise.resolve();

  const start = (armed: string): Promise<T | undefined> => {
    const started = epoch;
    const current = () => started === epoch;
    const run = open(armed).then(
      async (opened) => {
        if (current()) return (store = opened);
        await discard(armed, opened).catch((error: unknown) =>
          console.error("[connect] closing a dropped store failed:", error),
        );
        return undefined;
      },
      (error: unknown) => {
        console.error("[connect] opening a store failed:", error);
        // Not retried: each attempt downloads and instantiates PGlite again.
        if (current()) failed = true;
        return undefined;
      },
    );
    lastOpen = run;
    return run.finally(() => {
      if (current()) opening = undefined;
    });
  };

  return {
    arm(next: string) {
      namespace = next;
      failed = false;
    },
    /** What the store's closer sees: an armed store may be unopened. */
    snapshot: () => ({ namespace, store }),
    get(): Promise<T | undefined> {
      if (store) return Promise.resolve(store);
      if (!namespace || failed) return Promise.resolve(undefined);
      opening ??= start(namespace);
      return opening;
    },
    forget() {
      epoch += 1;
      namespace = undefined;
      store = undefined;
      opening = undefined;
      failed = false;
    },
    /** Settles once the last open has opened, failed or closed itself. */
    settled: (): Promise<void> =>
      lastOpen.then(
        () => undefined,
        () => undefined,
      ),
  };
}
