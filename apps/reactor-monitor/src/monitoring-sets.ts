/**
 * localStorage-backed persistence for the monitor's provisioned reactors
 * (multi-reactor §6). `App.tsx` otherwise holds its descriptors in React
 * state, so a refresh wipes them and every reactor has to be re-added; this
 * store remembers them across a reload, grouped into named monitoring SETS
 * with one active set.
 *
 * A {@link ReactorDescriptor} is plain serializable config -- a remote's
 * `{name, kind, remote.url}`, a built reactor's storage/sync config -- so a set
 * JSON round-trips cleanly. Live handles never do: a worker descriptor's
 * `createWorker` function and a remote descriptor's test `fetch` seam are
 * dropped on save (JSON omits functions) and re-attached by the caller on
 * hydrate. This store deals only in the serializable half.
 *
 * Every localStorage touch is wrapped so a private-mode or storage-blocked
 * browser degrades to an in-memory default instead of throwing at boot -- the
 * same defensive shape as apps/connect/src/utils/runtime-flag.ts.
 */
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";

/** The slice of the Web Storage API this store uses; a test seam. */
export type WebStorageLike = Pick<Storage, "getItem" | "setItem">;

/** Namespaced key the whole monitoring-sets snapshot is persisted under. */
export const MONITORING_SETS_STORAGE_KEY = "ph:reactor-monitor:sets";

/** The set seeded when storage is empty or unreadable. */
export const DEFAULT_SET_NAME = "default";

/** A named group of provisioned-reactor descriptors. */
export interface MonitoringSet {
  name: string;
  descriptors: ReactorDescriptor[];
}

/** What is persisted: every set plus which one is active. */
interface MonitoringSetsSnapshot {
  sets: MonitoringSet[];
  activeSetName: string;
}

/**
 * Resolves the browser's localStorage, or `undefined` when there is no window
 * or merely touching `window.localStorage` throws (a private-mode or blocked
 * browser can throw on the property access itself, not only on a method call).
 */
function resolveStorage(): WebStorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** A fresh snapshot with one empty default set active -- the boot fallback. */
function defaultSnapshot(): MonitoringSetsSnapshot {
  return {
    sets: [{ name: DEFAULT_SET_NAME, descriptors: [] }],
    activeSetName: DEFAULT_SET_NAME,
  };
}

/**
 * Narrows arbitrary parsed JSON to a snapshot, or returns `undefined` when the
 * shape does not hold. A stored value written by an older or corrupted build
 * must degrade to the default rather than crash the app.
 */
function asSnapshot(value: unknown): MonitoringSetsSnapshot | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as { sets?: unknown; activeSetName?: unknown };
  if (!Array.isArray(record.sets) || typeof record.activeSetName !== "string") {
    return undefined;
  }
  const sets: MonitoringSet[] = [];
  for (const entry of record.sets) {
    if (typeof entry !== "object" || entry === null) {
      return undefined;
    }
    const set = entry as { name?: unknown; descriptors?: unknown };
    if (typeof set.name !== "string" || !Array.isArray(set.descriptors)) {
      return undefined;
    }
    sets.push({
      name: set.name,
      descriptors: set.descriptors as ReactorDescriptor[],
    });
  }
  if (sets.length === 0) {
    return undefined;
  }
  const activeExists = sets.some((set) => set.name === record.activeSetName);
  return {
    sets,
    activeSetName: activeExists ? record.activeSetName : sets[0].name,
  };
}

/**
 * Deep-copies descriptors through JSON so what the store holds matches what a
 * reload would yield: functions (a worker's `createWorker`, a remote's test
 * `fetch`) are dropped, leaving only the serializable config.
 */
function serializableCopy(
  descriptors: readonly ReactorDescriptor[],
): ReactorDescriptor[] {
  return JSON.parse(JSON.stringify(descriptors)) as ReactorDescriptor[];
}

/**
 * The monitor's monitoring sets, backed by one namespaced localStorage key.
 *
 * Reads happen once at construction (degrading to the default on any failure);
 * every mutation updates the in-memory snapshot and then best-effort persists
 * it, so a write that throws still leaves the session consistent.
 */
export class MonitoringSetsStore {
  private snapshot: MonitoringSetsSnapshot;

  public constructor(private readonly storage = resolveStorage()) {
    this.snapshot = this.load();
  }

  /** Every set's name, in stored order. */
  public listSetNames(): readonly string[] {
    return this.snapshot.sets.map((set) => set.name);
  }

  /** The active set's name. */
  public getActiveSetName(): string {
    return this.snapshot.activeSetName;
  }

  /** The active set's descriptors (a fresh array; mutate freely). */
  public getActiveDescriptors(): readonly ReactorDescriptor[] {
    return serializableCopy(this.activeSet().descriptors);
  }

  /**
   * Replaces the active set's descriptors and persists. The write-through the
   * App calls after a provision or kill; returns the stored (serializable)
   * copy.
   */
  public setActiveDescriptors(
    descriptors: readonly ReactorDescriptor[],
  ): readonly ReactorDescriptor[] {
    const stored = serializableCopy(descriptors);
    this.activeSet().descriptors = stored;
    this.save();
    return serializableCopy(stored);
  }

  /**
   * Makes `name` the active set and returns its descriptors. A name that does
   * not exist is ignored, leaving the current active set in place.
   */
  public switchActiveSet(name: string): readonly ReactorDescriptor[] {
    if (this.snapshot.sets.some((set) => set.name === name)) {
      this.snapshot.activeSetName = name;
      this.save();
    }
    return this.getActiveDescriptors();
  }

  /**
   * Creates an empty set and makes it active, returning its (empty)
   * descriptors. A name that already exists is switched to rather than
   * duplicated, so its descriptors come back instead.
   */
  public createSet(name: string): readonly ReactorDescriptor[] {
    if (this.snapshot.sets.some((set) => set.name === name)) {
      return this.switchActiveSet(name);
    }
    this.snapshot.sets.push({ name, descriptors: [] });
    this.snapshot.activeSetName = name;
    this.save();
    return [];
  }

  /**
   * Renames a set, keeping it active if it already was. A missing source, or a
   * target name already in use, is a no-op so a collision never clobbers.
   */
  public renameSet(oldName: string, newName: string): void {
    const set = this.snapshot.sets.find((entry) => entry.name === oldName);
    const collides = this.snapshot.sets.some((entry) => entry.name === newName);
    if (!set || collides || oldName === newName) {
      return;
    }
    set.name = newName;
    if (this.snapshot.activeSetName === oldName) {
      this.snapshot.activeSetName = newName;
    }
    this.save();
  }

  /**
   * Deletes a set and returns the now-active set's descriptors. Deleting the
   * last set re-seeds an empty default rather than leaving none; deleting the
   * active set moves active to the first remaining one.
   */
  public deleteSet(name: string): readonly ReactorDescriptor[] {
    const remaining = this.snapshot.sets.filter((set) => set.name !== name);
    this.snapshot.sets =
      remaining.length > 0
        ? remaining
        : [{ name: DEFAULT_SET_NAME, descriptors: [] }];
    if (
      !this.snapshot.sets.some(
        (set) => set.name === this.snapshot.activeSetName,
      )
    ) {
      this.snapshot.activeSetName = this.snapshot.sets[0].name;
    }
    this.save();
    return this.getActiveDescriptors();
  }

  private activeSet(): MonitoringSet {
    const set = this.snapshot.sets.find(
      (entry) => entry.name === this.snapshot.activeSetName,
    );
    return set ?? this.snapshot.sets[0];
  }

  private load(): MonitoringSetsSnapshot {
    if (!this.storage) {
      return defaultSnapshot();
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(MONITORING_SETS_STORAGE_KEY);
    } catch {
      return defaultSnapshot();
    }
    if (raw === null) {
      return defaultSnapshot();
    }
    try {
      return asSnapshot(JSON.parse(raw)) ?? defaultSnapshot();
    } catch {
      return defaultSnapshot();
    }
  }

  private save(): void {
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(
        MONITORING_SETS_STORAGE_KEY,
        JSON.stringify(this.snapshot),
      );
    } catch {
      // Storage blocked or full: the change still applies for this session.
    }
  }
}
