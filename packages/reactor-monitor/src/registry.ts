import { provision, type ProvisionOptions } from "./provision.js";
import {
  linkLocalSync,
  type LinkLocalSyncOptions,
  type LocalSyncHandle,
} from "./sync/link.js";
import type { ManagedReactor, ReactorDescriptor } from "./types.js";

/**
 * One reactor's place in the monitor, including the states a `ManagedReactor`
 * cannot represent: still booting, and failed to boot. A monitor has to render
 * both — a reactor that cannot open its store is exactly what the lab bench
 * exists to show.
 */
export type ManagedReactorEntry = {
  name: string;
  descriptor: ReactorDescriptor;
} & (
  | {
      status: "provisioning";
      reactor?: undefined;
      error?: undefined;
      closing?: undefined;
    }
  | {
      status: "ready";
      reactor: ManagedReactor;
      error?: undefined;
      closing?: undefined;
    }
  | {
      status: "failed";
      reactor?: undefined;
      error: Error;
      /** A poisoned reactor's shutdown; its store is open until this settles. */
      closing?: Promise<void>;
    }
);

export type ReactorMonitorRegistryListener = () => void;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * The set of reactors one monitor session owns, keyed by descriptor name.
 *
 * Deliberately plain: no React, no `window.ph`, no module-level singleton. A
 * monitor creates one (the React provider does), and tests drive it directly.
 * The snapshot is immutable and replaced on every change, which is what
 * `useSyncExternalStore` needs to see a change at all.
 */
export class ReactorMonitorRegistry {
  private readonly entries = new Map<string, ManagedReactorEntry>();
  private readonly listeners = new Set<ReactorMonitorRegistryListener>();
  /** Per name, the last queued op; outlives the entry. */
  private readonly tails = new Map<string, Promise<void>>();
  private snapshot: readonly ManagedReactorEntry[] = [];

  /**
   * Provisions `descriptor` and keeps it under its name.
   *
   * Names are unique: they are the storage namespace and the worker name, so
   * two reactors under one name would quietly share a store.
   */
  async provision(
    descriptor: ReactorDescriptor,
    options?: ProvisionOptions,
  ): Promise<ManagedReactor> {
    const existing = this.entries.get(descriptor.name);
    if (existing && existing.status !== "failed") {
      throw new Error(
        `A reactor named ${JSON.stringify(descriptor.name)} is already ${existing.status} in this monitor; kill it before provisioning again`,
      );
    }
    // Claimed first, so a concurrent provision of this name is refused.
    const placeholder: ManagedReactorEntry = {
      name: descriptor.name,
      descriptor,
      status: "provisioning",
    };
    this.set(placeholder);
    return this.enqueue(descriptor.name, () =>
      this.build(placeholder, descriptor, options),
    );
  }

  private async build(
    placeholder: ManagedReactorEntry,
    descriptor: ReactorDescriptor,
    options: ProvisionOptions | undefined,
  ): Promise<ManagedReactor> {
    const removed = () =>
      new Error(
        `Reactor ${JSON.stringify(descriptor.name)} was removed while it was provisioning`,
      );
    if (this.entries.get(descriptor.name) !== placeholder) {
      throw removed();
    }
    let poisoned: Error | undefined;
    let ready: ManagedReactor | undefined;
    const onUnrecoverable = (cause: Error): void => {
      options?.onUnrecoverable?.(cause);
      if (poisoned) {
        return;
      }
      poisoned = cause;
      if (ready) {
        void this.fail(descriptor, ready, cause);
      }
    };
    try {
      const reactor = await provision(descriptor, {
        ...options,
        onUnrecoverable,
      });
      // Killed while it was booting: do not resurrect the entry.
      if (this.entries.get(descriptor.name) !== placeholder) {
        await reactor.kill();
        throw removed();
      }
      if (poisoned) {
        await reactor.kill();
        throw poisoned;
      }
      ready = reactor;
      this.set({
        name: descriptor.name,
        descriptor,
        status: "ready",
        reactor,
      });
      return reactor;
    } catch (error) {
      if (this.entries.get(descriptor.name) === placeholder) {
        this.set({
          name: descriptor.name,
          descriptor,
          status: "failed",
          error: toError(error),
        });
      }
      throw error;
    }
  }

  /**
   * Brokers a direct `LocalChannel` sync link between two ready reactors for
   * one collection -- no Switchboard, no GraphQL (multi-reactor W1.2). Both
   * reactors must have been provisioned with `sync.local`. Returns a handle
   * whose `unlink()` removes both remotes and closes both ports.
   */
  linkLocalSync(
    nameA: string,
    nameB: string,
    options: LinkLocalSyncOptions,
  ): Promise<LocalSyncHandle> {
    const a = this.reactor(nameA);
    const b = this.reactor(nameB);
    if (!a) {
      return Promise.reject(
        new Error(`No ready reactor named ${JSON.stringify(nameA)}`),
      );
    }
    if (!b) {
      return Promise.reject(
        new Error(`No ready reactor named ${JSON.stringify(nameB)}`),
      );
    }
    return linkLocalSync(a, b, options);
  }

  get(name: string): ManagedReactorEntry | undefined {
    return this.entries.get(name);
  }

  /** The ready reactor under `name`, or undefined while it is not ready. */
  reactor(name: string): ManagedReactor | undefined {
    const entry = this.entries.get(name);
    return entry?.status === "ready" ? entry.reactor : undefined;
  }

  list(): readonly ManagedReactorEntry[] {
    return this.snapshot;
  }

  /** Stable between changes, so `useSyncExternalStore` does not loop. */
  getSnapshot = (): readonly ManagedReactorEntry[] => this.snapshot;

  subscribe = (listener: ReactorMonitorRegistryListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Kills the reactor under `name` (if any) and forgets it. */
  kill(name: string): Promise<void> {
    const entry = this.entries.get(name);
    if (entry) {
      this.entries.delete(name);
      this.publish();
    }
    return this.enqueue(name, async () => {
      await entry?.reactor?.kill();
    });
  }

  /** Kills every reactor; the monitor's teardown. */
  async killAll(): Promise<void> {
    const entries = new Map(this.entries);
    this.entries.clear();
    this.publish();
    const names = new Set([...entries.keys(), ...this.tails.keys()]);
    // Serially: each in-process kill closes a PGlite, and the stores share a
    // wasm instance per realm. Queued now, so a later op on a name waits.
    let previous: Promise<unknown> = Promise.resolve();
    const kills = [...names].map((name) => {
      const after = previous;
      const killed = this.enqueue(name, async () => {
        await after;
        await entries.get(name)?.reactor?.kill();
      });
      previous = killed.catch(() => undefined);
      return killed;
    });
    await Promise.all(kills);
  }

  /** A ready reactor whose store was poisoned: failed, and its handle killed. */
  private async fail(
    descriptor: ReactorDescriptor,
    reactor: ManagedReactor,
    cause: Error,
  ): Promise<void> {
    if (this.entries.get(descriptor.name)?.reactor !== reactor) {
      return;
    }
    const closing = reactor.kill().catch((error: unknown) => {
      console.error(
        `[reactor-monitor] killing poisoned reactor ${JSON.stringify(descriptor.name)} failed:`,
        error,
      );
    });
    this.set({
      name: descriptor.name,
      descriptor,
      status: "failed",
      error: cause,
      closing,
    });
    await this.enqueue(descriptor.name, () => closing);
  }

  /**
   * Runs `work` after every earlier op on `name`, entry or not: a store a
   * forgotten entry is still closing must close before the name opens again.
   */
  private enqueue<T>(name: string, work: () => Promise<T>): Promise<T> {
    const run = (this.tails.get(name) ?? Promise.resolve()).then(work);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(name, tail);
    void tail.then(() => {
      if (this.tails.get(name) === tail) {
        this.tails.delete(name);
      }
    });
    return run;
  }

  private set(entry: ManagedReactorEntry): void {
    this.entries.set(entry.name, entry);
    this.publish();
  }

  private publish(): void {
    this.snapshot = [...this.entries.values()];
    for (const listener of this.listeners) {
      listener();
    }
  }
}
