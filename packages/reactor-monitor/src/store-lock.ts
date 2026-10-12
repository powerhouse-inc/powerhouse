// Copied from apps/connect/src/utils/store-lock.ts, which no package exports;
// `keep` stands in for Connect's `kept` set in worker-stores.ts.

type Locks = Pick<LockManager, "request">;

function webLocks(): Locks | undefined {
  try {
    return (globalThis.navigator as Navigator | undefined)?.locks;
  } catch {
    return undefined;
  }
}

export function storeLockName(namespace: string): string {
  return `ph-reactor-monitor:pglite:${namespace}`;
}

export type StoreLocks = {
  /** Waits while another realm holds `namespace`; no-op if this one does. */
  acquire: (namespace: string) => Promise<void>;
  release: (namespace: string) => void;
  /** Its store did not close: held until the realm dies, refused to this one. */
  keep: (namespace: string) => void;
};

/** One owner per store: held until released or the realm dies. */
export function createStoreLocks(
  locks: Locks | undefined = webLocks(),
): StoreLocks {
  const held = new Map<string, () => void>();
  const acquiring = new Map<string, Promise<void>>();
  const kept = new Set<string>();
  const acquire = (namespace: string): Promise<void> => {
    if (kept.has(namespace)) {
      return Promise.reject(
        new Error(
          `${namespace} stays held: its store did not close in this realm`,
        ),
      );
    }
    if (held.has(namespace)) return Promise.resolve();
    if (!locks) {
      console.warn(
        `[reactor-monitor] Web Locks unavailable; ${namespace} is opened unguarded`,
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
  const keep = (namespace: string): void => {
    kept.add(namespace);
  };
  return { acquire, release, keep };
}
