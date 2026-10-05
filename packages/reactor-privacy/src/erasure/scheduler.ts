import {
  DEFAULT_DRIVE_CONTAINER_TYPES,
  DriveCollectionId,
  JobStatus,
  PURGE_LOCK_BUCKETS,
  PURGE_NS,
  ReactorEventTypes,
  supportsDeliveryTracking,
  type DocumentPurgeService,
  type IEventBus,
  type IJobTracker,
  type ISyncManager,
  type JobWriteReadyEvent,
  type PendingDelivery,
  type ReactorJobFailedEvent,
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
  type ErasureDb,
  type Tombstone,
} from "./ledger.js";
import { redactDetail, redactError, redactText } from "./redact.js";

export const DEFAULT_ERASURE_INTERVAL_MS = 60_000;
export const DEFAULT_MARKER_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_PURGE_TIMEOUT_MS = 15 * 60 * 1000;

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
  /** A purge's completion starts the next tick, so purges run back to back. */
  eventBus?: IEventBus;
  syncManager?: Pick<ISyncManager, "list" | "remove">;
  permissions?: IDocumentPermissionEraser;
  driveContainerTypes?: ReadonlySet<string>;
  intervalMs?: number;
  markerGraceMs?: number;
  /** A purge with no tombstone after this long is enqueued again. */
  purgeTimeoutMs?: number;
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
  updatedAt: Date;
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

type ItemKey = { requestId: string; documentId: string };

/** A full pass scans every active item; a dispatch pass follows a purge. */
type Pass = "full" | "dispatch";

/** Reads shared by every item of one tick. */
type TickReads = {
  tombstones: Map<string, Tombstone>;
  remotes: () => Promise<StoredRemote[]>;
  /** A removal changed sync_remotes; the next read goes to the table. */
  forgetRemotes: () => void;
};

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

function tombstoneOf(row: {
  ordinal: string | number;
  removedRows: Tombstone["removedRows"];
  purgedAtUtc: Date | string;
}): Tombstone {
  return {
    ordinal: Number(row.ordinal),
    removedRows: row.removedRows,
    purgedAtUtc: new Date(row.purgedAtUtc),
  };
}

/** One purge at a time across all requests; document_purges is the truth. */
export class ErasureScheduler {
  private readonly db: ErasureDb;
  private readonly secret: DeploymentSecret;
  private readonly options: ErasureSchedulerOptions;
  private readonly driveTypes: ReadonlySet<string>;
  private readonly intervalMs: number;
  private readonly markerGraceMs: number;
  private readonly purgeTimeoutMs: number;
  private readonly now: () => Date;
  private readonly logger: ErasureLogger;
  /** Purge job per item; lost on restart like the job tracker's own entries. */
  private readonly jobIds = new Map<string, string>();
  /** Failed or abandoned purges whose transaction may still be open. */
  private readonly unsettled = new Set<string>();
  private readonly documentTypes = new Map<string, string | null>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribes: (() => void)[] = [];
  private running: Promise<void> | undefined;
  private runningPass: Pass | undefined;
  private queued: Pass | undefined;
  /** Items the last full pass found ready, in purge order, not yet enqueued. */
  private ready: ItemKey[] = [];

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
    this.purgeTimeoutMs = options.purgeTimeoutMs ?? DEFAULT_PURGE_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? SILENT;
  }

  start(): void {
    if (this.timer) return;
    const bus = this.options.eventBus;
    if (bus) {
      const onJob = (_type: number, event: { jobId: string }) => {
        if ([...this.jobIds.values()].includes(event.jobId)) {
          this.trigger("dispatch");
        }
      };
      this.unsubscribes = [
        bus.subscribe<JobWriteReadyEvent>(
          ReactorEventTypes.JOB_WRITE_READY,
          onJob,
        ),
        bus.subscribe<ReactorJobFailedEvent>(
          ReactorEventTypes.JOB_FAILED,
          onJob,
        ),
      ];
    }
    this.timer = setInterval(() => this.trigger("full"), this.intervalMs);
    this.timer.unref();
    this.logger.info(`Erasure scheduler started (tick ${this.intervalMs}ms)`);
  }

  /** Stops the interval and the triggers, and waits for the tick in flight. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
    this.queued = undefined;
    await this.running;
  }

  /** One full pass; joins a full pass in flight, follows a dispatch pass. */
  tick(): Promise<void> {
    if (this.running && this.runningPass === "dispatch") {
      const next = () => this.tick();
      return this.running.then(next, next);
    }
    return this.pass("full");
  }

  private pass(kind: Pass): Promise<void> {
    if (this.running) return this.running;
    this.runningPass = kind;
    const run = kind === "full" ? this.runTick() : this.runDispatch();
    this.running = run.finally(() => {
      this.running = undefined;
      this.runningPass = undefined;
      const next = this.queued;
      this.queued = undefined;
      if (next) this.trigger(next);
    });
    return this.running;
  }

  /** A pass now, or right after the one running; inert unless started. */
  private trigger(kind: Pass): void {
    if (!this.timer) return;
    if (this.running) {
      if (this.queued !== "full") this.queued = kind;
      return;
    }
    this.pass(kind).catch((error: unknown) => {
      this.logger.error(
        "Erasure tick failed: @error",
        redactText(this.secret, messageOf(error)),
      );
    });
  }

  private async runTick(): Promise<void> {
    await this.recoverFailed();
    await this.reopenRequests();
    const items = await this.activeItems();
    const reads = await this.tickReads(items);

    for (const item of items.filter((i) => i.status === "purging")) {
      await this.guarded(item, () => this.advancePurging(item, reads));
    }
    for (const item of items.filter((i) => i.status === "purged")) {
      await this.guarded(item, () => this.advancePurged(item, reads));
    }
    await this.advanceWaiting(items, reads);
    await this.settleRequests();
  }

  /** After a purge settles: that item, then the next ready one; no backlog scan. */
  private async runDispatch(): Promise<void> {
    const purging = await this.activeItems({ statuses: ["purging"] });
    const reads = await this.tickReads(purging);
    for (const item of purging) {
      await this.guarded(item, () => this.advancePurging(item, reads));
    }
    for (const item of purging.filter((i) => i.status === "purged")) {
      await this.guarded(item, () => this.advancePurged(item, reads));
    }
    if (!purging.some((i) => i.status === "purging")) {
      await this.dispatchReady();
    }
    const requests = [...new Set(purging.map((i) => i.requestId))];
    if (requests.length > 0) await this.settleRequests(requests);
  }

  /** The head of the last full pass's ready list, checked again on its own. */
  private async dispatchReady(): Promise<void> {
    while (this.ready.length > 0) {
      const found = await this.activeItems({
        statuses: ["waiting"],
        ...this.ready[0]!,
      });
      const item = found.at(0);
      if (!item) {
        this.ready.shift();
        continue;
      }
      const reads = await this.tickReads([item]);
      const tombstone = reads.tombstones.get(item.documentId);
      if (tombstone) {
        this.ready.shift();
        await this.guarded(item, () =>
          this.markPurged(item, tombstone, "waiting"),
        );
        continue;
      }
      let convergence: Convergence;
      try {
        convergence = await this.deleteConvergence(item.documentId, reads);
      } catch (error) {
        this.ready.shift();
        await this.stepFailed(item, error);
        continue;
      }
      const converged =
        convergence.pending.length === 0 && !convergence.unknown;
      if (!converged && this.now() < item.deadline) {
        this.ready.shift();
        continue;
      }
      if (!(await this.previousPurgesEnded(item))) return;
      this.ready.shift();
      await this.loadDocumentTypes([item.documentId]);
      const others = await this.activeItems({
        statuses: ["waiting", "purging"],
        requestId: item.requestId,
      });
      if (!(await this.eligible(item, others))) continue;
      await this.enqueue(item, converged, convergence);
      return;
    }
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

  private async activeItems(
    filter: {
      statuses?: ErasureItemStatus[];
      requestId?: string;
      documentId?: string;
    } = {},
  ): Promise<Item[]> {
    const { requestId, documentId } = filter;
    const rows = await this.db
      .selectFrom("erasure_items as i")
      .innerJoin("erasure_requests as r", "r.requestId", "i.requestId")
      .select([
        "i.requestId",
        "i.documentId",
        "i.status",
        "i.allowLarge",
        "i.markerOrdinal",
        "i.updatedAt",
        "r.deadline",
      ])
      .where(
        "i.status",
        "in",
        filter.statuses ?? ["waiting", "purging", "purged"],
      )
      .$if(requestId !== undefined, (qb) =>
        qb.where("i.requestId", "=", requestId!),
      )
      .$if(documentId !== undefined, (qb) =>
        qb.where("i.documentId", "=", documentId!),
      )
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
      updatedAt: new Date(row.updatedAt),
    }));
  }

  private async tickReads(items: Item[]): Promise<TickReads> {
    const ids = [...new Set(items.map((item) => item.documentId))];
    const tombstones = new Map<string, Tombstone>();
    if (ids.length > 0) {
      const rows = await this.db
        .selectFrom("document_purges")
        .select(["documentId", "ordinal", "removedRows", "purgedAtUtc"])
        .where(sql<boolean>`"documentId" = any(${ids}::text[])`)
        .execute();
      for (const row of rows) tombstones.set(row.documentId, tombstoneOf(row));
    }
    let remotes: Promise<StoredRemote[]> | undefined;
    return {
      tombstones,
      remotes: () => (remotes ??= this.storedRemotes()),
      forgetRemotes: () => {
        remotes = undefined;
      },
    };
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

  /** A failed item whose purge committed after all, e.g. after a timeout. */
  private async recoverFailed(): Promise<void> {
    const rows = await this.db
      .selectFrom("erasure_items as i")
      .innerJoin("document_purges as p", "p.documentId", "i.documentId")
      .innerJoin("erasure_requests as r", "r.requestId", "i.requestId")
      .select([
        "i.requestId",
        "i.documentId",
        "i.allowLarge",
        "i.updatedAt",
        "r.deadline",
        "p.ordinal",
        "p.removedRows",
        "p.purgedAtUtc",
      ])
      .where("i.status", "=", "failed")
      .execute();
    for (const row of rows) {
      const item: Item = {
        requestId: row.requestId,
        documentId: row.documentId,
        status: "failed",
        allowLarge: row.allowLarge,
        markerOrdinal: null,
        deadline: new Date(row.deadline),
        updatedAt: new Date(row.updatedAt),
      };
      await this.guarded(item, () =>
        this.markPurged(item, tombstoneOf(row), "failed"),
      );
    }
  }

  /** Every failed request with no failed item left is open again. */
  private async reopenRequests(): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const reopened = await trx
          .updateTable("erasure_requests as r")
          .set({ status: "open" })
          .where("r.status", "=", "failed")
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("erasure_items as i")
                  .select("i.documentId")
                  .whereRef("i.requestId", "=", "r.requestId")
                  .where("i.status", "=", "failed"),
              ),
            ),
          )
          .returning("r.requestId")
          .execute();
        for (const { requestId } of reopened) {
          await appendAudit(trx, this.secret, {
            requestId,
            documentId: null,
            event: "reopened",
            at: this.now(),
          });
        }
      });
    } catch (error) {
      this.logger.warn(
        `Reopening failed erasure requests failed; retried next tick: ${redactText(this.secret, messageOf(error))}`,
      );
    }
  }

  private async advanceWaiting(items: Item[], reads: TickReads): Promise<void> {
    const waiting = items.filter((i) => i.status === "waiting");
    this.ready = [];
    if (waiting.length === 0) return;
    await this.loadDocumentTypes(waiting.map((i) => i.documentId));

    const ready: {
      item: Item;
      converged: boolean;
      convergence: Convergence;
    }[] = [];
    for (const item of this.inPurgeOrder(waiting)) {
      try {
        const tombstone = reads.tombstones.get(item.documentId);
        if (tombstone) {
          await this.markPurged(item, tombstone, "waiting");
          continue;
        }
        const convergence = await this.deleteConvergence(
          item.documentId,
          reads,
        );
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
    this.ready = ready.map(({ item }) => ({
      requestId: item.requestId,
      documentId: item.documentId,
    }));

    if (items.some((i) => i.status === "purging")) return;
    if (ready.length === 0) return;
    if (!(await this.previousPurgesEnded(ready[0]!.item))) return;
    for (const next of ready) {
      if (!(await this.eligible(next.item, items))) continue;
      const key = keyOf(next.item);
      this.ready = this.ready.filter((queued) => keyOf(queued) !== key);
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

  /** A timed-out purge's transaction can outlive its job: wait for its lock. */
  private async previousPurgesEnded(blocked: Item): Promise<boolean> {
    if (this.unsettled.size === 0) return true;
    const ids = [...this.unsettled];
    if (await this.purgeLockTaken(ids)) {
      const message =
        "Waiting for an earlier purge transaction to end before the next purge";
      this.logger.warn(
        `${message}; it holds the purge lock of ${ids.join(", ")}`,
      );
      await this.setLastError(blocked, message);
      return false;
    }
    for (const id of ids) this.unsettled.delete(id);
    return true;
  }

  /** An exclusive purge lock on one of the ids' buckets, held or awaited. */
  private async purgeLockTaken(ids: string[]): Promise<boolean> {
    const result = await sql<{ taken: boolean }>`
      select exists (
        select 1 from pg_catalog.pg_locks
        where locktype = 'advisory'
          and objsubid = 2
          and mode = 'ExclusiveLock'
          and database = (
            select oid from pg_catalog.pg_database
            where datname = current_database()
          )
          and classid::bigint = ${sql.lit(PURGE_NS)}
          and objid::bigint in (
            select hashtext(id) & ${sql.lit(PURGE_LOCK_BUCKETS - 1)}
            from unnest(${ids}::text[]) as t(id)
          )
      ) as taken
    `.execute(this.db);
    return result.rows[0]?.taken === true;
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
    const [job] = await this.options.purges.enqueuePurge(
      [item.documentId],
      item.requestId,
      { allowLarge: item.allowLarge },
    );
    this.jobIds.set(keyOf(item), job.id);
  }

  /** Enqueued again with the dispatch time reset; the purge lock gates it. */
  private async redispatch(item: Item, reason: string): Promise<void> {
    if (await this.purgeLockTaken([item.documentId])) return;
    this.logger.warn(
      `${reason} for ${item.documentId} (request ${item.requestId}); enqueued again`,
    );
    const moved = await this.transition(item, "purging", "purging");
    if (!moved) return;
    item.updatedAt = this.now();
    await this.dispatch(item);
  }

  private async advancePurging(item: Item, reads: TickReads): Promise<void> {
    const tombstone = reads.tombstones.get(item.documentId);
    if (tombstone) {
      await this.markPurged(item, tombstone, "purging");
      return;
    }
    const jobId = this.jobIds.get(keyOf(item));
    const info = jobId ? this.options.jobs.getJobStatus(jobId) : null;
    if (!info) {
      await this.redispatch(item, "No purge job known");
      return;
    }
    if (info.status === JobStatus.FAILED) {
      // recoverFailed moves it to purged if the transaction commits after all.
      this.unsettled.add(item.documentId);
      await this.markFailed(item, info.error ?? { name: "Error", message: "" });
      return;
    }
    const age = this.now().getTime() - item.updatedAt.getTime();
    if (age >= this.purgeTimeoutMs) {
      this.unsettled.add(item.documentId);
      await this.redispatch(item, `No tombstone after ${age}ms`);
    }
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
    this.jobIds.delete(keyOf(item));
    this.unsettled.delete(item.documentId);
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
    this.jobIds.delete(keyOf(item));
    item.status = "failed";
    await this.audit(item, "failed", { error: redacted });
  }

  private async advancePurged(item: Item, reads: TickReads): Promise<void> {
    const tombstone = reads.tombstones.get(item.documentId);
    if (!tombstone) {
      throw new Error(`Purged document ${item.documentId} has no tombstone`);
    }
    const graceOver =
      this.now().getTime() - tombstone.purgedAtUtc.getTime() >=
      this.markerGraceMs;
    if (!(await this.markerSettled(item))) {
      const ordinal = item.markerOrdinal ?? tombstone.ordinal;
      const convergence = await this.convergence(
        item.documentId,
        [ordinal],
        reads,
      );
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
      await this.removeRemotes(item, graceOver, reads);
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

  /** Refusals by remotes bound to the document, each audited once when read. */
  private async refusedRemotes(item: Item): Promise<string[]> {
    const refusals = await this.db
      .selectFrom("sync_purge_refusals as f")
      .innerJoin("sync_remotes as s", "s.name", "f.remote_name")
      .innerJoin("document_collections as c", (join) =>
        join
          .onRef("c.collectionId", "=", "s.collection_id")
          .onRef("c.documentId", "=", "f.document_id"),
      )
      .select(["f.remote_name", "f.branch"])
      .where("f.document_id", "=", item.documentId)
      .where("c.leftOrdinal", "is", null)
      .orderBy("f.refused_at_utc_ms")
      .orderBy("f.remote_name")
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
  private async removeRemotes(
    item: Item,
    graceOver: boolean,
    reads: TickReads,
  ): Promise<void> {
    const bound = (await this.storedRemotes()).filter(
      (row) => driveOf(row.collectionId) === item.documentId,
    );
    const sync = this.options.syncManager;
    const loaded = new Set(sync?.list().map((remote) => remote.meta.name));
    const removed: string[] = [];
    const unloaded: string[] = [];
    if (bound.length > 0) reads.forgetRemotes();
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

  private async deleteConvergence(
    documentId: string,
    reads: TickReads,
  ): Promise<Convergence> {
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
      reads,
    );
  }

  /** Fails closed: a stored remote owed the ordinal but not loaded is unknown. */
  private async convergence(
    documentId: string,
    ordinals: number[],
    reads: TickReads,
  ): Promise<Convergence> {
    const stored = await reads.remotes();
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

  private async settleRequests(requestIds?: string[]): Promise<void> {
    const rows = await this.db
      .selectFrom("erasure_items as i")
      .innerJoin("erasure_requests as r", "r.requestId", "i.requestId")
      .select(["i.requestId", "i.documentId", "i.status"])
      .where("r.status", "=", "open")
      .$if(requestIds !== undefined, (qb) =>
        qb.where("i.requestId", "in", requestIds!),
      )
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
        redactText(this.secret, messageOf(error)),
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
