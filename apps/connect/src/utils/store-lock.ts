type Locks = Pick<LockManager, "request" | "query">;

function webLocks(): Locks | undefined {
  try {
    return (globalThis.navigator as Navigator | undefined)?.locks;
  } catch {
    return undefined;
  }
}

export function storeLockName(namespace: string): string {
  return `ph-connect:pglite:${namespace}`;
}

export type StoreLocks = {
  /** Waits while another worker holds `namespace`; a no-op if this one already does. */
  acquire: (namespace: string) => Promise<void>;
  release: (namespace: string) => void;
};

/** One owner per idb store: held until released or until the worker dies. */
export function createStoreLocks(locks: Locks | undefined = webLocks()) {
  const held = new Map<string, () => void>();
  const acquiring = new Map<string, Promise<void>>();
  const acquire = (namespace: string): Promise<void> => {
    if (held.has(namespace)) return Promise.resolve();
    if (!locks) {
      console.warn(
        `[connect] Web Locks unavailable; ${namespace} is opened unguarded`,
      );
      return Promise.resolve();
    }
    const pending = acquiring.get(namespace);
    if (pending) return pending;
    const granted = new Promise<void>((resolve, reject) => {
      locks
        .request(
          storeLockName(namespace),
          { mode: "exclusive" },
          () =>
            new Promise<void>((release) => {
              held.set(namespace, release);
              acquiring.delete(namespace);
              resolve();
            }),
        )
        .catch((error: unknown) => {
          acquiring.delete(namespace);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
    acquiring.set(namespace, granted);
    return granted;
  };
  const release = (namespace: string): void => {
    const unlock = held.get(namespace);
    held.delete(namespace);
    unlock?.();
  };
  return { acquire, release } satisfies StoreLocks;
}

/**
 * Calls `onChange(true)` while someone waits on a lock for one of `namespaces`,
 * after `graceMs` so a retiring worker's normal handoff is not reported, and
 * `onChange(false)` once a reported wait ends.
 */
export function watchStoreLockWait(
  namespaces: string[],
  onChange: (waiting: boolean) => void,
  { locks = webLocks(), intervalMs = 1_000, graceMs = 5_000 } = {},
): () => void {
  if (!locks) return () => undefined;
  const names = new Set(namespaces.map(storeLockName));
  const reportFrom = Date.now() + graceMs;
  let stopped = false;
  let reported = false;
  const check = async (): Promise<void> => {
    if (Date.now() < reportFrom) return;
    try {
      const { pending = [] } = await locks.query();
      if (stopped) return;
      if (pending.some((lock) => names.has(lock.name ?? ""))) {
        reported = true;
        onChange(true);
      } else if (reported) {
        reported = false;
        onChange(false);
      }
    } catch (error) {
      console.warn("[connect] could not query store locks:", error);
    }
  };
  const timer = setInterval(() => void check(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
