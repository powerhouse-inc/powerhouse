import {
  DEFAULT_DRIVE_CONTAINER_TYPES,
  DriveCollectionId,
  JobStatus,
  supportsDeliveryTracking,
  type DocumentPurgeService,
  type IEventBus,
  type IJobTracker,
  type ISyncManager,
  type PendingDelivery,
} from "@powerhousedao/reactor";
import type { ISigner } from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import type { ErasureItemStatus } from "../schema/tables.js";
import {
  assertDeploymentSecret,
  type DeploymentSecret,
} from "../subject-hash.js";
import {
  appendAudit,
  auditOf,
  readTombstone,
  type ErasureDb,
  type Tombstone,
} from "./ledger.js";
import { redactDetail, redactError, redactText } from "./redact.js";

export const DEFAULT_ERASURE_INTERVAL_MS = 60_000;
export const DEFAULT_MARKER_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** An unsigned marker is refused by every receiver. */
export class ErasureSignerMissingError extends Error {
  constructor() {
    super(
      "The erasure scheduler needs the reactor's signer: without one every receiver refuses its purge markers",
    );
    this.name = "ErasureSignerMissingError";
  }
}

/** Implemented over reactor-api's DocumentPermissionService by the host. */
export interface IDocumentPermissionEraser {
  /** Deletes every permission and protection row for the document; row counts. */
  erasePermissions(documentId: string): Promise<Record<string, number>>;
}

export type ErasureLogger = {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
};

export type ErasureSchedulerOptions = {
  /** The reactor schema handle: `module.database.withSchema(REACTOR_SCHEMA)`. */
  db: ErasureDb;
  deploymentSecret: DeploymentSecret;
  /** The signer the reactor's executor signs purge markers with. */
  signer: ISigner | undefined;
  purges: Pick<DocumentPurgeService, "enqueuePurge">;
  jobs: Pick<IJobTracker, "getJobStatus">;
  eventBus?: IEventBus;
  syncManager?: Pick<ISyncManager, "list" | "remove">;
  permissions?: IDocumentPermissionEraser;
  driveContainerTypes?: ReadonlySet<string>;
  intervalMs?: number;
  markerGraceMs?: number;
  now?: () => Date;
  logger?: ErasureLogger;
};

type Item = {
  requestId: string;
  documentId: string;
  status: ErasureItemStatus;
  allowLarge: boolean;
  markerOrdinal: number | null;
  deadline: Date;
};

type PendingRemote = {
  remote: string;
  state: PendingDelivery["state"] | "unknown";
};

type Convergence = {
  pending: PendingRemote[];
  /** Why an empty pending list still is not convergence. */
  unknown?: string;
};

type StoredRemote = { name: string; collectionId: string };

const SILENT: ErasureLogger = { info() {}, warn() {}, error() {} };

function keyOf(item: { requestId: string; documentId: string }): string {
  return `${item.requestId}\u0000${item.documentId}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function kindOf(detail: unknown): unknown {
  return (detail as { kind?: unknown } | null)?.kind;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function byName<T extends { remote: string }>(a: T, b: T): number {
  return a.remote < b.remote ? -1 : a.remote > b.remote ? 1 : 0;
}

/** One purge at a time across all requests; document_purges is the truth. */
export class ErasureScheduler {
  private readonly db: ErasureDb;
  private readonly secret: DeploymentSecret;
  private readonly options: ErasureSchedulerOptions;
  private readonly driveTypes: ReadonlySet<string>;
  private readonly intervalMs: number;
  private readonly markerGraceMs: number;
  private readonly now: () => Date;
  private readonly logger: ErasureLogger;
  /** Purge job per item; lost on restart like the job tracker's own entries. */
  private readonly jobIds = new Map<string, string>();
  /** Seen FAILED once: a timed-out purge may still commit by the next tick. */
  private readonly failedOnce = new Set<string>();
  private readonly documentTypes = new Map<string, string | null>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;

  constructor(options: ErasureSchedulerOptions) {
    if (!options.signer?.app?.key) throw new ErasureSignerMissingError();
    assertDeploymentSecret(options.deploymentSecret);
    this.options = options;
    this.db = options.db;
    this.secret = options.deploymentSecret;
    this.driveTypes = new Set(
      options.driveContainerTypes ?? DEFAULT_DRIVE_CONTAINER_TYPES,
    );
    this.intervalMs = options.intervalMs ?? DEFAULT_ERASURE_INTERVAL_MS;
    this.markerGraceMs = options.markerGraceMs ?? DEFAULT_MARKER_GRACE_MS;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? SILENT;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.logger.error("Erasure tick failed: @error", messageOf(error));
      });
    }, this.intervalMs);
    this.timer.unref();
    this.logger.info(`Erasure scheduler started (tick ${this.intervalMs}ms)`);
  }

  /** Stops the interval and waits for the tick in flight. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }

  /** One pass; a call while one runs joins it. */
  tick(): Promise<void> {
    this.running ??= this.runTick().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async runTick(): Promise<void> {
    const items = await this.activeItems();

    for (const item of items.filter((i) => i.status === "purging")) {
      await this.guarded(item, () => this.advancePurging(item));
    }
    for (const item of items.filter((i) => i.status === "purged")) {
      await this.guarded(item, () => this.advancePurged(item));
    }
    await this.advanceWaiting(items);
    await this.settleRequests();
  }

  private async guarded(item: Item, step: () => Promise<void>): Promise<void> {
    try {
      await step();
    } catch (error) {
      await this.stepFailed(item, error);
    }
  }

  private async stepFailed(item: Item, error: unknown): Promise<void> {
    const message = redactText(this.secret, messageOf(error));
    this.logger.warn(
      `Erasure of ${item.documentId} (request ${item.requestId}) failed a step; retried next tick: ${message}`,
    );
    await this.setLastError(item, message);
  }

  private async activeItems(): Promise<Item[]> {
    const rows = await this.db
      .selectFrom("erasure_items as i")
      .innerJoin("erasure_requests as r", "r.requestId", "i.requestId")
      .select([
        "i.requestId",
        "i.documentId",
        "i.status",
        "i.allowLarge",
        "i.markerOrdinal",
        "r.deadline",
      ])
      .where("i.status", "in", ["waiting", "purging", "purged"])
      .orderBy("r.requestedAt")
      .orderBy("i.requestId")
      .orderBy("i.documentId")
      .execute();
    return rows.map((row) => ({
      requestId: row.requestId,
      documentId: row.documentId,
      status: row.status,
      allowLarge: row.allowLarge,
      markerOrdinal:
        row.markerOrdinal === null ? null : Number(row.markerOrdinal),
      deadline: new Date(row.deadline),
    }));
  }

  private async storedRemotes(): Promise<StoredRemote[]> {
    const rows = await this.db
      .selectFrom("sync_remotes")
      .select(["name", "collection_id"])
      .orderBy("name")
      .execute();
    return rows.map((row) => ({
      name: row.name,
      collectionId: row.collection_id,
    }));
  }

  private async advanceWaiting(items: Item[]): Promise<void> {
    const waiting = items.filter((i) => i.status === "waiting");
    if (waiting.length === 0) return;
    await this.loadDocumentTypes(waiting.map((i) => i.documentId));

    const ready: {
      item: Item;
      converged: boolean;
      convergence: Convergence;
    }[] = [];
    for (const item of this.inPurgeOrder(waiting)) {
      try {
        const tombstone = await readTombstone(this.db, item.documentId);
        if (tombstone) {
          await this.markPurged(item, tombstone, "waiting");
          continue;
        }
        const convergence = await this.deleteConvergence(item.documentId);
        const converged =
          convergence.pending.length === 0 && !convergence.unknown;
        if (!converged) await this.recordWaiting(item, "delete", convergence);
        if (converged || this.now() >= item.deadline) {
          ready.push({ item, converged, convergence });
        }
      } catch (error) {
        await this.stepFailed(item, error);
      }
    }

    if (items.some((i) => i.status === "purging")) return;
    for (const next of ready) {
      if (!(await this.eligible(next.item, items))) continue;
      await this.enqueue(next.item, next.converged, next.convergence);
      return;
    }
  }

  /** Members before their drive: a drive purge needs its members gone. */
  private inPurgeOrder(items: Item[]): Item[] {
    const requestOrder = new Map<string, number>();
    for (const item of items) {
      if (!requestOrder.has(item.requestId)) {
        requestOrder.set(item.requestId, requestOrder.size);
      }
    }
    return [...items].sort(
      (a, b) =>
        requestOrder.get(a.requestId)! - requestOrder.get(b.requestId)! ||
        Number(this.isDrive(a.documentId)) - Number(this.isDrive(b.documentId)),
    );
  }

  /** A drive waits for every member of its request still to be purged. */
  private async eligible(item: Item, items: Item[]): Promise<boolean> {
    if (!this.isDrive(item.documentId)) return true;
    const others = items
      .filter(
        (other) =>
          other.requestId === item.requestId &&
          other.documentId !== item.documentId &&
          (other.status === "waiting" || other.status === "purging"),
      )
      .map((other) => other.documentId);
    if (others.length === 0) return true;
    const rows = await this.db
      .selectFrom("document_collections")
      .select("collectionId")
      .where(sql<boolean>`"documentId" = any(${others}::text[])`)
      .execute();
    return !rows.some((row) => driveOf(row.collectionId) === item.documentId);
  }

  private isDrive(documentId: string): boolean {
    return this.driveTypes.has(this.documentTypes.get(documentId) ?? "");
  }

  private async loadDocumentTypes(ids: string[]): Promise<void> {
    const missing = ids.filter((id) => !this.documentTypes.has(id));
    if (missing.length === 0) return;
    const rows = await this.db
      .selectFrom("Operation")
      .select(["documentId", "documentType"])
      .distinct()
      .where(sql<boolean>`"documentId" = any(${missing}::text[])`)
      .execute();
    for (const id of missing) {
      const row = rows.find((r) => r.documentId === id);
      if (row) this.documentTypes.set(id, row.documentType);
    }
  }

  private async enqueue(
    item: Item,
    converged: boolean,
    convergence: Convergence,
  ): Promise<void> {
    const moved = await this.transition(item, "waiting", "purging");
    if (!moved) return;
    item.status = "purging";
    if (!converged) {
      await this.audit(item, "deadline-passed", {
        deadline: item.deadline.toISOString(),
        pending: convergence.pending,
        ...(convergence.unknown ? { unknown: convergence.unknown } : {}),
      });
    }
    await this.dispatch(item);
  }

  private async dispatch(item: Item): Promise<void> {
    this.failedOnce.delete(keyOf(item));
    const [job] = await this.options.purges.enqueuePurge(
      [item.documentId],
      item.requestId,
      { allowLarge: item.allowLarge },
    );
    this.jobIds.set(keyOf(item), job.id);
  }

  private async advancePurging(item: Item): Promise<void> {
    const tombstone = await readTombstone(this.db, item.documentId);
    if (tombstone) {
      await this.markPurged(item, tombstone, "purging");
      return;
    }
    const key = keyOf(item);
    const jobId = this.jobIds.get(key);
    const info = jobId ? this.options.jobs.getJobStatus(jobId) : null;
    if (!info) {
      this.logger.warn(
        `No purge job known for ${item.documentId} (request ${item.requestId}); enqueued again`,
      );
      await this.dispatch(item);
      return;
    }
    if (info.status !== JobStatus.FAILED) return;
    if (!this.failedOnce.has(key)) {
      this.failedOnce.add(key);
      return;
    }
    await this.markFailed(item, info.error ?? { name: "Error", message: "" });
  }

  private async markPurged(
    item: Item,
    tombstone: Tombstone,
    from: ErasureItemStatus,
  ): Promise<void> {
    const moved = await this.transition(item, from, "purged", {
      markerOrdinal: tombstone.ordinal,
      lastError: null,
    });
    if (!moved) return;
    this.forget(item);
    item.status = "purged";
    item.markerOrdinal = tombstone.ordinal;
    await this.audit(item, "purged", {
      ordinal: tombstone.ordinal,
      removedRows: tombstone.removedRows,
    });
  }

  private async markFailed(
    item: Item,
    error: { name?: string; message?: string },
  ): Promise<void> {
    const redacted = redactError(this.secret, error);
    const moved = await this.transition(item, "purging", "failed", {
      lastError: `${redacted.name}: ${redacted.message}`,
    });
    if (!moved) return;
    this.forget(item);
    item.status = "failed";
    await this.audit(item, "failed", { error: redacted });
  }

  private forget(item: Item): void {
    this.jobIds.delete(keyOf(item));
    this.failedOnce.delete(keyOf(item));
  }

  private async advancePurged(item: Item): Promise<void> {
    const tombstone = await readTombstone(this.db, item.documentId);
    if (!tombstone) {
      throw new Error(`Purged document ${item.documentId} has no tombstone`);
    }
    const graceOver =
      this.now().getTime() - tombstone.purgedAtUtc.getTime() >=
      this.markerGraceMs;
    if (!(await this.markerSettled(item))) {
      const ordinal = item.markerOrdinal ?? tombstone.ordinal;
      const convergence = await this.convergence(item.documentId, [ordinal]);
      const refused = await this.refusedRemotes(item);
      const delivered =
        convergence.pending.length === 0 && !convergence.unknown;
      if (delivered && refused.length === 0) {
        await this.audit(item, "marker-converged", {
          kind: "outcome",
          ordinal,
        });
      } else if (delivered || graceOver) {
        await this.audit(item, "marker-undelivered", {
          kind: "outcome",
          ordinal,
          pending: convergence.pending,
          refused,
          ...(convergence.unknown ? { unknown: convergence.unknown } : {}),
          ...(delivered ? {} : { markerGraceExpired: true }),
        });
      } else {
        await this.recordWaiting(item, "marker", convergence);
        return;
      }
    }

    let failed: unknown;
    try {
      await this.removeRemotes(item, graceOver);
    } catch (error) {
      failed = error;
    }
    try {
      await this.erasePermissions(item);
    } catch (error) {
      failed ??= error;
    }
    if (failed !== undefined) {
      throw failed instanceof Error ? failed : new Error(messageOf(failed));
    }

    if (await this.transition(item, "purged", "erased", { lastError: null })) {
      item.status = "erased";
    }
  }

  private async markerSettled(item: Item): Promise<boolean> {
    const rows = await auditOf(this.db, item.requestId, item.documentId, [
      "marker-converged",
      "marker-undelivered",
    ]);
    return rows.some((row) => kindOf(row.detail) === "outcome");
  }

  /** Persisted refusals, each recorded once in the audit as it is first read. */
  private async refusedRemotes(item: Item): Promise<string[]> {
    const refusals = await this.db
      .selectFrom("sync_purge_refusals")
      .select(["remote_name", "branch"])
      .where("document_id", "=", item.documentId)
      .orderBy("refused_at_utc_ms")
      .orderBy("remote_name")
      .execute();
    if (refusals.length === 0) return [];
    const rows = await auditOf(this.db, item.requestId, item.documentId, [
      "marker-undelivered",
    ]);
    const recorded = new Set(
      rows
        .filter((row) => kindOf(row.detail) === "refusal")
        .map((row) => {
          const detail = row.detail as { remote: string; branch: string };
          return `${detail.remote}\u0000${detail.branch}`;
        }),
    );
    for (const refusal of refusals) {
      const key = `${refusal.remote_name}\u0000${refusal.branch}`;
      if (recorded.has(key)) continue;
      recorded.add(key);
      await this.audit(item, "marker-undelivered", {
        kind: "refusal",
        remote: refusal.remote_name,
        branch: refusal.branch,
      });
    }
    return [...new Set(refusals.map((r) => r.remote_name))].sort();
  }

  /** Stored rows bound to the drive; one not loaded is deleted at markerGrace. */
  private async removeRemotes(item: Item, graceOver: boolean): Promise<void> {
    const bound = (await this.storedRemotes()).filter(
      (row) => driveOf(row.collectionId) === item.documentId,
    );
    const sync = this.options.syncManager;
    const loaded = new Set(sync?.list().map((remote) => remote.meta.name));
    const removed: string[] = [];
    const unloaded: string[] = [];
    for (const row of bound) {
      if (sync && loaded.has(row.name)) {
        await sync.remove(row.name);
        removed.push(row.name);
      } else {
        unloaded.push(row.name);
      }
    }
    if (unloaded.length > 0 && !graceOver) {
      throw new Error(
        `Remotes bound to drive ${item.documentId} are stored but not loaded: ${unloaded.join(", ")}`,
      );
    }
    if (unloaded.length > 0) await this.deleteStoredRemotes(unloaded);

    const recorded = await auditOf(this.db, item.requestId, item.documentId, [
      "remotes-removed",
    ]);
    if (recorded.length === 0 || bound.length > 0) {
      await this.audit(item, "remotes-removed", {
        remotes: removed,
        ...(unloaded.length > 0 ? { deletedFromStorage: unloaded } : {}),
      });
    }
  }

  /** What SyncManager.remove deletes; cursors, holds, dead letters cascade. */
  private async deleteStoredRemotes(names: string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_received_markers")
        .where("remote_name", "in", names)
        .execute();
      await trx.deleteFrom("sync_remotes").where("name", "in", names).execute();
    });
  }

  private async erasePermissions(item: Item): Promise<void> {
    const recorded = await auditOf(this.db, item.requestId, item.documentId, [
      "permissions-erased",
    ]);
    const eraser = this.options.permissions;
    if (!eraser) {
      if (recorded.length === 0) {
        await this.audit(item, "permissions-erased", { configured: false });
      }
      return;
    }
    const rows = await eraser.erasePermissions(item.documentId);
    const any = Object.values(rows).some((count) => count > 0);
    if (recorded.length === 0 || any) {
      await this.audit(item, "permissions-erased", { rows });
    }
  }

  private async deleteConvergence(documentId: string): Promise<Convergence> {
    const rows = await this.db
      .selectFrom("operation_index_operations")
      .select(["branch", (eb) => eb.fn.max("ordinal").as("ordinal")])
      .where("documentId", "=", documentId)
      .where(sql<boolean>`action->>'type' = 'DELETE_DOCUMENT'`)
      .groupBy("branch")
      .execute();
    if (rows.length === 0) {
      return {
        pending: [],
        unknown: "no DELETE_DOCUMENT in the operation index",
      };
    }
    return this.convergence(
      documentId,
      rows.map((row) => Number(row.ordinal)),
    );
  }

  /** Fails closed: a stored remote owed the ordinal but not loaded is unknown. */
  private async convergence(
    documentId: string,
    ordinals: number[],
  ): Promise<Convergence> {
    const stored = await this.storedRemotes();
    const sync = this.options.syncManager;
    if (!sync || !supportsDeliveryTracking(sync)) {
      if (stored.length === 0) return { pending: [] };
      return {
        pending: stored.map((row) => ({
          remote: row.name,
          state: "unknown" as const,
        })),
        unknown: "no delivery tracking while sync_remotes has rows",
      };
    }
    const byRemote = new Map<string, PendingRemote>();
    for (const ordinal of ordinals) {
      for (const entry of await sync.pendingDelivery(documentId, ordinal)) {
        const known = byRemote.get(entry.remote);
        if (!known || entry.state === "held") byRemote.set(entry.remote, entry);
      }
    }
    const loaded = new Set(sync.list().map((remote) => remote.meta.name));
    const unloaded = stored.filter((row) => !loaded.has(row.name));
    if (unloaded.length > 0) {
      const memberships = await this.db
        .selectFrom("document_collections")
        .select(["collectionId", "leftOrdinal"])
        .where("documentId", "=", documentId)
        .execute();
      for (const row of unloaded) {
        const owed = ordinals.some((ordinal) =>
          memberships.some(
            (m) =>
              m.collectionId === row.collectionId &&
              (m.leftOrdinal === null || ordinal < Number(m.leftOrdinal)),
          ),
        );
        if (owed)
          byRemote.set(row.name, { remote: row.name, state: "unknown" });
      }
    }
    return { pending: [...byRemote.values()].sort(byName) };
  }

  /** A waiting row each tick the pending list changes. */
  private async recordWaiting(
    item: Item,
    stage: "delete" | "marker",
    convergence: Convergence,
  ): Promise<void> {
    const detail = redactDetail(this.secret, {
      stage,
      pending: convergence.pending,
      ...(convergence.unknown ? { unknown: convergence.unknown } : {}),
    });
    const rows = await auditOf(this.db, item.requestId, item.documentId, [
      "waiting",
    ]);
    const last = rows.at(-1);
    if (last && canonical(last.detail) === canonical(detail)) return;
    await this.audit(item, "waiting", detail);
  }

  private async settleRequests(): Promise<void> {
    const rows = await this.db
      .selectFrom("erasure_items as i")
      .innerJoin("erasure_requests as r", "r.requestId", "i.requestId")
      .select(["i.requestId", "i.documentId", "i.status"])
      .where("r.status", "=", "open")
      .execute();
    const byRequest = new Map<
      string,
      { documentId: string; status: string }[]
    >();
    for (const row of rows) {
      byRequest.set(row.requestId, [
        ...(byRequest.get(row.requestId) ?? []),
        row,
      ]);
    }
    for (const [requestId, items] of byRequest) {
      const failed = items.filter((i) => i.status === "failed");
      const status =
        failed.length > 0
          ? "failed"
          : items.every((i) => i.status === "erased")
            ? "complete"
            : undefined;
      if (!status) continue;
      const result = await this.db
        .updateTable("erasure_requests")
        .set({ status })
        .where("requestId", "=", requestId)
        .where("status", "=", "open")
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) continue;
      await appendAudit(this.db, this.secret, {
        requestId,
        documentId: null,
        event: status,
        detail:
          status === "failed"
            ? { failed: failed.map((i) => i.documentId) }
            : { erased: items.length },
        at: this.now(),
      });
    }
  }

  private async transition(
    item: Item,
    from: ErasureItemStatus,
    to: ErasureItemStatus,
    set: { markerOrdinal?: number; lastError?: string | null } = {},
  ): Promise<boolean> {
    const result = await this.db
      .updateTable("erasure_items")
      .set({ ...set, status: to, updatedAt: this.now() })
      .where("requestId", "=", item.requestId)
      .where("documentId", "=", item.documentId)
      .where("status", "=", from)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  private async setLastError(item: Item, message: string): Promise<void> {
    try {
      await this.db
        .updateTable("erasure_items")
        .set({ lastError: message, updatedAt: this.now() })
        .where("requestId", "=", item.requestId)
        .where("documentId", "=", item.documentId)
        .execute();
    } catch (error) {
      this.logger.error(
        "Recording an erasure error failed: @error",
        messageOf(error),
      );
    }
  }

  private audit(
    item: Item,
    event: Parameters<typeof appendAudit>[2]["event"],
    detail: unknown,
  ): Promise<void> {
    return appendAudit(this.db, this.secret, {
      requestId: item.requestId,
      documentId: item.documentId,
      event,
      detail,
      at: this.now(),
    });
  }
}

function driveOf(collectionId: string): string | undefined {
  try {
    return DriveCollectionId.fromKey(collectionId).driveId;
  } catch {
    return undefined;
  }
}
