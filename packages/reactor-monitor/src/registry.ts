import { provision, type ProvisionOptions } from "./provision.js";
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
  | { status: "provisioning"; reactor?: undefined; error?: undefined }
  | { status: "ready"; reactor: ManagedReactor; error?: undefined }
  | { status: "failed"; reactor?: undefined; error: Error }
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
    this.set({ name: descriptor.name, descriptor, status: "provisioning" });
    try {
      const reactor = await provision(descriptor, options);
      // Killed while it was booting: do not resurrect the entry.
      if (this.entries.get(descriptor.name)?.status !== "provisioning") {
        await reactor.kill();
        throw new Error(
          `Reactor ${JSON.stringify(descriptor.name)} was removed while it was provisioning`,
        );
      }
      this.set({
        name: descriptor.name,
        descriptor,
        status: "ready",
        reactor,
      });
      return reactor;
    } catch (error) {
      if (this.entries.get(descriptor.name)?.status === "provisioning") {
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
  async kill(name: string): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry) {
      return;
    }
    this.entries.delete(name);
    this.publish();
    await entry.reactor?.kill();
  }

  /** Kills every reactor; the monitor's teardown. */
  async killAll(): Promise<void> {
    const reactors = [...this.entries.values()].flatMap((entry) =>
      entry.reactor ? [entry.reactor] : [],
    );
    this.entries.clear();
    this.publish();
    // Serially: each in-process kill closes a PGlite, and the stores share a
    // wasm instance per realm.
    for (const reactor of reactors) {
      await reactor.kill();
    }
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
