import type { RoutingReactorClient } from "@powerhousedao/reactor-router";
import { driveDocumentType } from "@powerhousedao/shared/document-drive";
import { logger } from "document-model";
import {
  applyPlacementEntries,
  servesSlug,
  LOCAL_BACKEND_NAME,
  placementKeys,
  removeLocalCopies,
  servedUrl,
  type PlacementEntry,
  type ResolvedSwitchboardDrive,
  type SwitchboardDrive,
  type SyncRemotes,
} from "./drive-placement.js";

/** A collection by its declared slug among its switchboard's drives, e.g. one served hashed. */
export async function findServedDrive(
  router: Pick<RoutingReactorClient, "backends">,
  drive: SwitchboardDrive,
): Promise<{ id: string; slug: string } | undefined> {
  const backend = router.backends.find((b) => b.name === drive.remote);
  if (!backend) return undefined;
  const { results } = await backend.api.find({ type: driveDocumentType });
  const served = results.find(
    (doc) => doc.header.slug && servesSlug(drive.slug, doc.header.slug),
  );
  return served && { id: served.header.id, slug: served.header.slug };
}

/** Where this browser keeps its moves; per origin, so every tab shares it. */
export interface PlacementStore {
  list(): Promise<PlacementEntry[]>;
  put(entry: PlacementEntry): Promise<void>;
  delete(slug: string): Promise<void>;
}

/** The router's two placement layers. */
export type PlacementRouter = {
  setPlacement(key: string, backend: string | undefined): void;
  setConfiguredPlacement(key: string, backend: string | undefined): void;
};

export type PlacementSync = SyncRemotes & {
  /** Adds a sync remote for the drive. */
  add(url: string, driveId: string): Promise<void>;
  /** Bounded wait for the drive's local copy and its first pull; rejects when the copy never arrives. */
  untilCopied(driveId: string): Promise<void>;
};

export type DrivePlacement = {
  drive: ResolvedSwitchboardDrive;
  /** Where the drive opens in this browser now. */
  backend: string;
  /** This browser moved it away from the host config. */
  moved: boolean;
  /** A move is running. */
  busy: boolean;
  /** Where a running move takes the drive. */
  movingTo?: string;
};

/** Config placement plus this browser's moves: store, then sync remote, then router. */
export class DrivePlacements {
  private applied = new Map<string, PlacementEntry>();
  private resolved: ResolvedSwitchboardDrive[] = [];
  private router: PlacementRouter | undefined;
  private readonly busy = new Map<string, string>();
  private attached = false;
  private readonly listeners = new Set<() => void>();
  private snapshot = new Map<string, DrivePlacement>();

  constructor(
    readonly drives: readonly SwitchboardDrive[],
    applied: readonly PlacementEntry[],
    private readonly store: PlacementStore,
    private readonly sync: PlacementSync,
  ) {
    for (const entry of applied) this.applied.set(entry.slug, entry);
  }

  /** Reads the store and drops the entries the config has overtaken (O2). */
  static async load(
    drives: readonly SwitchboardDrive[],
    store: PlacementStore,
    sync: PlacementSync,
  ): Promise<DrivePlacements> {
    let entries: PlacementEntry[] = [];
    try {
      entries = await store.list();
    } catch (error) {
      logger.warn("Could not read this browser's drive moves: @error", error);
    }
    const { applied, stale } = applyPlacementEntries(drives, entries);
    for (const entry of stale) {
      store.delete(entry.slug).catch((error: unknown) => {
        logger.warn(
          "Could not drop drive move @slug: @error",
          entry.slug,
          error,
        );
      });
    }
    return new DrivePlacements(drives, applied, store, sync);
  }

  /** Where `drive` opens in this browser: a move, else the config. */
  backendOf(drive: SwitchboardDrive): string {
    return this.applied.get(drive.slug)?.backend ?? drive.configured;
  }

  /** Whether a remote default drive at `url` keeps a copy here. */
  keepsCopy(url: string): boolean {
    const drive = this.drives.find((d) => d.url === url);
    return !drive || this.backendOf(drive) === LOCAL_BACKEND_NAME;
  }

  /** Drives that open on their switchboard with no copy here. */
  placed(): SwitchboardDrive[] {
    return this.drives.filter(
      (drive) => this.backendOf(drive) !== LOCAL_BACKEND_NAME,
    );
  }

  /** Collections this browser keeps a copy of; default drives are added with the others. */
  keptCollections(): ResolvedSwitchboardDrive[] {
    return this.resolved.filter(
      (drive) =>
        drive.collection &&
        drive.id !== undefined &&
        this.backendOf(drive) === LOCAL_BACKEND_NAME,
    );
  }

  /** Installs both layers for every drive the router can be told about. */
  attach(
    router: PlacementRouter | undefined,
    resolved: readonly ResolvedSwitchboardDrive[],
  ): void {
    this.router = router;
    this.resolved = [...resolved];
    this.attached = true;
    for (const drive of this.resolved) this.install(drive);
    this.notify();
  }

  /**
   * Attaches, follows the moves other tabs made since `load`, then brings
   * the sync remotes in line; returns the collections to keep a copy of.
   */
  async start(
    router: PlacementRouter | undefined,
    resolved: readonly ResolvedSwitchboardDrive[],
    syncsDrives: boolean,
  ): Promise<ResolvedSwitchboardDrive[]> {
    this.attach(router, resolved);
    await this.reload();
    if (!syncsDrives) return [];
    const placed = new Set(this.placed().map((drive) => drive.slug));
    await removeLocalCopies(
      this.sync,
      this.resolved.filter(
        (drive) => placed.has(drive.slug) && !this.busy.has(drive.slug),
      ),
    );
    return this.keptCollections();
  }

  /** The drive's placement in this browser; undefined for a drive the host does not place on a switchboard. */
  placementOf(driveId: string): DrivePlacement | undefined {
    return this.snapshot.get(driveId);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Opens the drive on `backend` in this browser: its switchboard, or a copy here. */
  async move(driveId: string, backend: string): Promise<void> {
    const drive = this.resolved.find((d) => d.id === driveId);
    if (!drive?.id) {
      throw new Error(
        `Drive ${driveId} is not on a switchboard this app links`,
      );
    }
    if (backend !== drive.remote && backend !== LOCAL_BACKEND_NAME) {
      throw new Error(`Drive ${drive.slug} can't open on ${backend}`);
    }
    if (this.busy.has(drive.slug) || this.backendOf(drive) === backend) return;
    const previous = this.applied.get(drive.slug);
    const entry: PlacementEntry | undefined =
      backend === drive.configured
        ? undefined
        : { slug: drive.slug, backend, configWas: drive.configured };
    const id = drive.id;
    this.busy.set(drive.slug, backend);
    this.notify();
    try {
      await this.record(drive.slug, entry);
      if (backend === LOCAL_BACKEND_NAME) {
        try {
          await this.sync.add(servedUrl(drive), id);
          await this.sync.untilCopied(id);
        } catch (error) {
          // Store first: the removal's broadcast makes other tabs re-read it.
          await this.record(drive.slug, previous);
          await removeLocalCopies(this.sync, [drive]);
          throw error;
        }
      } else {
        try {
          await removeLocalCopies(this.sync, [drive]);
        } catch (error) {
          await this.record(drive.slug, previous);
          throw error;
        }
      }
      this.install(drive);
    } finally {
      this.busy.delete(drive.slug);
      this.notify();
    }
  }

  /** Back to where the host config opens the drive. */
  reset(driveId: string): Promise<void> {
    const drive = this.resolved.find((d) => d.id === driveId);
    return drive ? this.move(driveId, drive.configured) : Promise.resolve();
  }

  /** Re-reads the store after another tab moved a drive; true when something changed. */
  async reload(): Promise<boolean> {
    if (!this.attached) return false;
    const next = await this.readMoves();
    if (!next) return false;
    const changed = this.drives.filter(
      (drive) =>
        !this.busy.has(drive.slug) &&
        next.get(drive.slug)?.backend !== this.applied.get(drive.slug)?.backend,
    );
    if (changed.length === 0) return false;
    await Promise.all(
      changed.map((drive) => this.follow(drive, next.get(drive.slug))),
    );
    this.notify();
    return true;
  }

  /** A copy kept by another tab is routed here only once it has arrived. */
  private async follow(
    drive: SwitchboardDrive,
    entry: PlacementEntry | undefined,
  ): Promise<void> {
    const resolved = this.resolved.find((d) => d.slug === drive.slug);
    if (entry?.backend === LOCAL_BACKEND_NAME && resolved?.id) {
      this.busy.set(drive.slug, LOCAL_BACKEND_NAME);
      this.notify();
      try {
        await this.sync.untilCopied(resolved.id);
      } catch (error) {
        logger.warn(
          "Drive @slug was not copied into this browser; leaving it where it opens: @error",
          drive.slug,
          error,
        );
        return;
      } finally {
        this.busy.delete(drive.slug);
      }
      // The mover may have rolled back while this tab waited.
      const latest = await this.readMoves();
      if (!latest) return;
      entry = latest.get(drive.slug);
    }
    if (entry) this.applied.set(drive.slug, entry);
    else this.applied.delete(drive.slug);
    if (resolved) this.install(resolved);
  }

  private async readMoves(): Promise<Map<string, PlacementEntry> | undefined> {
    let entries: PlacementEntry[];
    try {
      entries = await this.store.list();
    } catch (error) {
      logger.warn("Could not read this browser's drive moves: @error", error);
      return undefined;
    }
    const { applied } = applyPlacementEntries(this.drives, entries);
    return new Map(applied.map((entry) => [entry.slug, entry]));
  }

  private async record(
    slug: string,
    entry: PlacementEntry | undefined,
  ): Promise<void> {
    if (entry) {
      await this.store.put(entry);
      this.applied.set(slug, entry);
    } else {
      await this.store.delete(slug);
      this.applied.delete(slug);
    }
  }

  private install(drive: ResolvedSwitchboardDrive): void {
    const router = this.router;
    if (!router) return;
    const configured =
      drive.configured === drive.remote ? drive.remote : undefined;
    const runtime = this.applied.get(drive.slug)?.backend;
    for (const key of placementKeys(drive)) {
      router.setConfiguredPlacement(key, configured);
      router.setPlacement(key, runtime);
    }
  }

  private notify(): void {
    const snapshot = new Map<string, DrivePlacement>();
    for (const drive of this.resolved) {
      if (!drive.id) continue;
      const backend = this.backendOf(drive);
      snapshot.set(drive.id, {
        drive,
        backend,
        moved: backend !== drive.configured,
        busy: this.busy.has(drive.slug),
        ...(this.busy.has(drive.slug)
          ? { movingTo: this.busy.get(drive.slug) }
          : {}),
      });
    }
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
}
