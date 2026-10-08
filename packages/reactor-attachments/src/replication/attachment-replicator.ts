import {
  ReactorEventTypes,
  type AttachmentHash,
  type AttachmentRef,
  type IEventBus,
  type JobReadReadyEvent,
  type Unsubscribe,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { IAttachmentStore, IAttachmentTransport } from "../interfaces.js";
import type {
  AttachmentReferenceRow,
  IAttachmentReferenceScanner,
} from "../read-models/attachment-reference/types.js";
import { parseRef } from "../ref.js";
import { collectStream, streamFromBytes } from "../storage/local/bytes.js";
import { sha256Hex } from "./hash.js";
import {
  DEFAULT_ATTACHMENT_BACKLOG_PAGE_SIZE,
  DEFAULT_ATTACHMENT_HELD_HASH_LIMIT,
  DEFAULT_ATTACHMENT_REPLICATION_CONCURRENCY,
  DEFAULT_ATTACHMENT_RETRY_POLICY,
  type AttachmentReplicationEntry,
  type AttachmentReplicationState,
  type AttachmentReplicatorStatus,
  type AttachmentRetryPolicy,
  type IOperationAttachmentRefs,
} from "./types.js";

/**
 * Clock and timer seam. Injected rather than taken from globals so a test can
 * drive every retry deadline deterministically, without fake timers racing the
 * replicator's own promises.
 */
export type ReplicationTimers = {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export const SYSTEM_REPLICATION_TIMERS: ReplicationTimers = {
  now: () => Date.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type AttachmentReplicatorOptions = {
  /** Where bytes land, and the authority on what is already held. */
  store: IAttachmentStore;
  /** Where bytes come from. */
  transport: IAttachmentTransport;
  /** Pulls refs out of a committed operation. */
  refs: IOperationAttachmentRefs;
  /** The reactor's bus; the replicator subscribes to `JOB_READ_READY`. */
  eventBus: IEventBus;
  /**
   * The durable reference list re-scanned on {@link AttachmentReplicator.start}.
   * Omitted, the replicator only ever learns about refs from live operations --
   * correct for a reactor with no reference index, and NOT resumable across a
   * restart, which {@link AttachmentReplicatorStatus.backlogScanned} reports.
   */
  backlog?: IAttachmentReferenceScanner;
  concurrency?: number;
  retry?: Partial<AttachmentRetryPolicy>;
  backlogPageSize?: number;
  /**
   * Held hashes remembered after their entry is dropped, oldest evicted first.
   * An evicted hash referenced again costs one `store.has()`, never a fetch.
   */
  heldHashLimit?: number;
  /**
   * Whether fetched bytes are hashed and checked against the hash they were
   * requested under. Defaults to true: a local peer transport means the bytes
   * come from another reactor rather than from a trusted server, and a
   * content-addressed store that accepts bytes it never verified is no longer
   * content-addressed.
   */
  verifyHash?: boolean;
  timers?: ReplicationTimers;
  onDiagnostic?: (message: string, error?: unknown) => void;
};

type Entry = {
  hash: AttachmentHash;
  state: AttachmentReplicationState;
  /** Insertion-ordered; a retry rotates through them. */
  documentIds: string[];
  attempts: number;
  notFoundAnswers: number;
  errorAnswers: number;
  nextAttemptAtMs: number | undefined;
  lastError: string | undefined;
  /** Asked on the next attempt instead of the rotation. */
  nextDocumentId: string | undefined;
};

/** setTimeout's largest delay; a longer one fires at once. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Lazy fetch-on-reference: pulls attachment bytes a reactor's own operations
 * reference but whose hash its local store lacks.
 *
 * The seam is `ReactorEventTypes.JOB_READ_READY` on the reactor's event bus,
 * and that choice matters in two ways. It is AFTER the pre-ready read models,
 * so by the time the replicator asks a peer for a hash, this reactor's own
 * attachment reference index has recorded the reference -- the same reactor is
 * therefore able to serve the hash onward, and a reactor cannot be in the
 * position of chasing bytes it would refuse to authorize itself. And it is off
 * the write path: a slow or unreachable peer cannot delay a commit, because
 * the subscriber only notes hashes and returns.
 *
 * Resume is a re-scan of the reference index ({@link IAttachmentReferenceScanner}),
 * not a cursor: the index plus `store.has()` re-derives the exact outstanding
 * work set on every boot, idempotently, and a persisted cursor could only add a
 * second truth that is wrong in the one direction that loses data.
 *
 * Loop-safety is structural: one entry per hash, created once, and a terminal
 * entry (`not-found`, `failed`) is never re-queued by a further reference from
 * a document it already knows. A document it has not seen gives a `not-found`
 * entry one more attempt, through that document. Otherwise only
 * {@link AttachmentReplicator.retry} moves a terminal entry back. A held hash drops its entry and is
 * remembered in a bounded set, so the map holds only unfinished work.
 */
export class AttachmentReplicator {
  private readonly store: IAttachmentStore;
  private readonly transport: IAttachmentTransport;
  private readonly refs: IOperationAttachmentRefs;
  private readonly eventBus: IEventBus;
  private readonly backlog: IAttachmentReferenceScanner | undefined;
  private readonly concurrency: number;
  private readonly policy: AttachmentRetryPolicy;
  private readonly backlogPageSize: number;
  private readonly heldHashLimit: number;
  private readonly verifyHash: boolean;
  private readonly timers: ReplicationTimers;
  private readonly onDiagnostic: (message: string, error?: unknown) => void;

  private readonly entries = new Map<AttachmentHash, Entry>();
  private readonly heldHashes = new Set<AttachmentHash>();
  private readonly queue: AttachmentHash[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  private readonly aborts = new Set<AbortController>();

  private unsubscribe: Unsubscribe | undefined;
  private running = false;
  private inFlight = 0;
  private timerHandle: unknown;
  private timerAtMs: number | undefined;
  private backlogScan: Promise<void> | undefined;
  private backlogDone = false;
  private lastError: string | undefined;

  constructor(options: AttachmentReplicatorOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.refs = options.refs;
    this.eventBus = options.eventBus;
    this.backlog = options.backlog;
    this.concurrency =
      options.concurrency ?? DEFAULT_ATTACHMENT_REPLICATION_CONCURRENCY;
    this.policy = { ...DEFAULT_ATTACHMENT_RETRY_POLICY, ...options.retry };
    this.backlogPageSize =
      options.backlogPageSize ?? DEFAULT_ATTACHMENT_BACKLOG_PAGE_SIZE;
    this.heldHashLimit =
      options.heldHashLimit ?? DEFAULT_ATTACHMENT_HELD_HASH_LIMIT;
    this.verifyHash = options.verifyHash ?? true;
    this.timers = options.timers ?? SYSTEM_REPLICATION_TIMERS;
    this.onDiagnostic = options.onDiagnostic ?? ((): void => undefined);
  }

  /**
   * Subscribes to committed operations and starts the boot re-scan.
   *
   * The subscription is taken BEFORE the scan so no operation committed during
   * the scan can slip between the two. A hash both paths find is one entry.
   *
   * A restart resumes its own unfinished work: a `stop()` empties the queue but
   * keeps the entries, so entries left `queued` or `waiting` are re-armed here.
   * Without that, a hash that was outstanding at `stop()` would sit in the map
   * forever unless an unrelated live operation happened to pump the queue --
   * the backlog re-scan does not rescue it, because `observeReference` treats
   * an already-known hash as nothing to do.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.unsubscribe = this.eventBus.subscribe<JobReadReadyEvent>(
      ReactorEventTypes.JOB_READ_READY,
      (_type, event) => {
        this.observeOperations(event.operations);
      },
    );
    this.resumeOutstanding();
    this.backlogScan = this.scanBacklog();
  }

  /**
   * Stops scheduling, drops the subscription and aborts in-flight fetches.
   *
   * Entries are kept: the in-memory retry counters are not durable state and a
   * restart legitimately starts the budgets over (a hash that was `not-found`
   * because a peer's index lagged deserves another look after a reboot), but a
   * `stop()` that is not a restart should not forget what is held either --
   * `store.has()` is re-checked before every fetch regardless.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.cancelTimer();
    for (const controller of this.aborts) {
      controller.abort();
    }
    this.aborts.clear();
    this.queue.length = 0;
    const scan = this.backlogScan;
    this.backlogScan = undefined;
    if (scan) {
      await scan.catch(() => undefined);
    }
  }

  /** Notes every ref carried by `items`. Synchronous: it only enqueues. */
  observeOperations(items: readonly OperationWithContext[]): void {
    for (const item of items) {
      for (const ref of this.refs.refsOf(item)) {
        this.observeReference(item.context.documentId, ref);
      }
    }
  }

  /** Notes one (document, ref) pair, queueing the hash if it is new. */
  observeReference(documentId: string, ref: AttachmentRef): void {
    let hash: AttachmentHash;
    try {
      hash = parseRef(ref).hash;
    } catch (error) {
      this.onDiagnostic(`ignoring malformed attachment ref ${ref}`, error);
      return;
    }

    if (this.heldHashes.has(hash)) {
      return;
    }
    const existing = this.entries.get(hash);
    if (existing) {
      if (existing.documentIds.includes(documentId)) {
        return;
      }
      existing.documentIds.push(documentId);
      if (existing.state === "not-found") {
        existing.state = "queued";
        existing.nextDocumentId = documentId;
        if (!this.queue.includes(hash)) {
          this.queue.push(hash);
        }
        this.pump();
      }
      return;
    }

    this.entries.set(hash, {
      hash,
      state: "queued",
      documentIds: [documentId],
      attempts: 0,
      notFoundAnswers: 0,
      errorAnswers: 0,
      nextAttemptAtMs: undefined,
      lastError: undefined,
      nextDocumentId: undefined,
    });
    this.queue.push(hash);
    this.pump();
  }

  async status(): Promise<AttachmentReplicatorStatus> {
    const counts: Record<AttachmentReplicationState, number> = {
      queued: 0,
      fetching: 0,
      held: 0,
      waiting: 0,
      "not-found": 0,
      failed: 0,
    };
    for (const entry of this.entries.values()) {
      counts[entry.state] += 1;
    }
    const bytesHeld = await this.store.storageUsed();
    return {
      running: this.running,
      refsSeen: this.entries.size + this.heldHashes.size,
      held: this.heldHashes.size,
      bytesHeld,
      queued: counts.queued,
      fetching: counts.fetching,
      waiting: counts.waiting,
      notFound: counts["not-found"],
      failed: counts.failed,
      backlogScanned: this.backlogDone,
      lastError: this.lastError,
    };
  }

  /** Every hash not yet held and what is happening to it. */
  report(): AttachmentReplicationEntry[] {
    return [...this.entries.values()].map((entry) => ({
      hash: entry.hash,
      state: entry.state,
      documentIds: [...entry.documentIds],
      attempts: entry.attempts,
      notFoundAnswers: entry.notFoundAnswers,
      nextAttemptAtMs: entry.nextAttemptAtMs,
      lastError: entry.lastError,
    }));
  }

  /**
   * Re-queues terminal entries so a `not-found` or `failed` hash is chased
   * again, resetting their budgets. `hash` narrows it to one; absent, every
   * terminal entry is retried.
   *
   * The deliberate manual lever over the reference-index race: when an
   * operator can see that a peer has caught up, nothing should make them wait
   * for a reboot to find out.
   */
  retry(hash?: AttachmentHash): void {
    const targets = hash
      ? [this.entries.get(hash)].filter((entry) => entry !== undefined)
      : [...this.entries.values()];
    for (const entry of targets) {
      if (entry.state === "held" || entry.state === "fetching") {
        continue;
      }
      entry.state = "queued";
      entry.notFoundAnswers = 0;
      entry.errorAnswers = 0;
      entry.nextAttemptAtMs = undefined;
      if (!this.queue.includes(entry.hash)) {
        this.queue.push(entry.hash);
      }
    }
    this.pump();
  }

  /**
   * Resolves when nothing is queued or in flight.
   *
   * Entries `waiting` on a retry deadline do NOT hold this open -- their next
   * attempt is the timer's business, and a caller that wants to reach it
   * advances the injected clock. A test seam, and what a load harness waits on.
   */
  idle(): Promise<void> {
    if (this.queue.length === 0 && this.inFlight === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  /** Awaits the boot re-scan; resolves immediately when there is no backlog. */
  async backlogScanned(): Promise<void> {
    await this.backlogScan;
  }

  /** Re-queues every non-terminal entry a previous `stop()` stranded. */
  private resumeOutstanding(): void {
    for (const entry of this.entries.values()) {
      if (entry.state !== "queued" && entry.state !== "waiting") {
        continue;
      }
      entry.state = "queued";
      entry.nextAttemptAtMs = undefined;
      if (!this.queue.includes(entry.hash)) {
        this.queue.push(entry.hash);
      }
    }
    this.pump();
  }

  private async scanBacklog(): Promise<void> {
    const backlog = this.backlog;
    if (!backlog) {
      // No reference index to re-scan: this reactor learns refs only from live
      // operations and is NOT resumable across a restart, so `backlogScanned`
      // stays false.
      return;
    }

    let cursor: string | undefined;
    for (;;) {
      if (!this.running) {
        return;
      }
      let page;
      try {
        page = await backlog.listReferences(cursor, this.backlogPageSize);
      } catch (error) {
        // A reference index that cannot be read is not a reason to stop
        // replicating live operations; it only costs resumability, which the
        // status then reports as an unfinished scan.
        this.onDiagnostic(
          "scanning the attachment reference backlog failed",
          error,
        );
        return;
      }
      for (const reference of page.references) {
        this.observeReference(reference.documentId, reference.ref);
      }
      if (page.nextCursor === undefined) {
        break;
      }
      cursor = page.nextCursor;
    }
    this.backlogDone = true;
  }

  /** Starts as many queued fetches as the concurrency bound allows. */
  private pump(): void {
    while (
      this.running &&
      this.inFlight < this.concurrency &&
      this.queue.length > 0
    ) {
      const hash = this.queue.shift();
      if (hash === undefined) {
        break;
      }
      const entry = this.entries.get(hash);
      if (!entry || entry.state !== "queued") {
        continue;
      }
      void this.fetchOne(entry);
    }
    this.settleIdle();
  }

  private async fetchOne(entry: Entry): Promise<void> {
    entry.state = "fetching";
    entry.attempts += 1;
    this.inFlight += 1;
    const controller = new AbortController();
    this.aborts.add(controller);
    try {
      await this.attempt(entry, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        // Only stop() aborts; a restart's resumeOutstanding picks it up.
        entry.state = "queued";
        entry.nextAttemptAtMs = undefined;
      } else {
        this.recordError(entry, error);
      }
    } finally {
      this.aborts.delete(controller);
      this.inFlight -= 1;
      this.pump();
    }
  }

  private async attempt(entry: Entry, signal: AbortSignal): Promise<void> {
    // Re-checked every attempt, not once at enqueue: another path (a local
    // upload, a store-level re-fetch, a previous attempt that lost the race)
    // may have landed the bytes meanwhile, and asking a peer for bytes already
    // held is the one wasted round trip worth a cheap local read to avoid.
    if (await this.store.has(entry.hash)) {
      this.markHeld(entry);
      return;
    }

    // Rotate the authorizing document across attempts: a `not-found` can be
    // one document's authorization lagging rather than the bytes being absent,
    // and a hash referenced by several documents has several chances.
    const documentId =
      entry.nextDocumentId ??
      entry.documentIds[(entry.attempts - 1) % entry.documentIds.length];
    entry.nextDocumentId = undefined;
    const result = await this.transport.fetch(entry.hash, documentId, signal);

    if (result.kind === "pending") {
      // A valid 0 means retry now; only a delay that is not a usable number
      // falls back to the policy.
      const delay = result.retryAfterMs;
      this.schedule(
        entry,
        Number.isFinite(delay) && delay >= 0
          ? Math.min(delay, MAX_TIMER_DELAY_MS)
          : this.policy.pendingRetryMs,
      );
      return;
    }

    if (result.kind === "not-found") {
      entry.notFoundAnswers += 1;
      if (entry.notFoundAnswers < this.policy.notFoundAttempts) {
        // Treated as pending: the likeliest cause for a freshly synced ref is
        // the serving peer's reference index lagging its own sync, which is a
        // wait, not an absence. See AttachmentRetryPolicy.
        this.schedule(
          entry,
          this.policy.notFoundRetryMs * 2 ** (entry.notFoundAnswers - 1),
        );
        return;
      }
      entry.state = "not-found";
      entry.nextAttemptAtMs = undefined;
      return;
    }

    const bytes = await collectStream(result.response.body);
    if (this.verifyHash) {
      const actual = await sha256Hex(bytes);
      if (actual !== entry.hash) {
        throw new Error(
          `Attachment bytes for ${entry.hash} hashed to ${actual}; the peer served content that is not what was asked for`,
        );
      }
    }
    await this.store.put(
      entry.hash,
      result.response.metadata,
      streamFromBytes(bytes),
    );
    this.markHeld(entry);
  }

  private markHeld(entry: Entry): void {
    entry.state = "held";
    entry.nextAttemptAtMs = undefined;
    this.entries.delete(entry.hash);
    this.heldHashes.delete(entry.hash);
    this.heldHashes.add(entry.hash);
    for (const oldest of this.heldHashes) {
      if (this.heldHashes.size <= this.heldHashLimit) {
        break;
      }
      this.heldHashes.delete(oldest);
    }
  }

  private recordError(entry: Entry, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    entry.lastError = message;
    this.lastError = message;
    entry.errorAnswers += 1;
    this.onDiagnostic(`fetching attachment ${entry.hash} failed`, error);
    if (entry.errorAnswers < this.policy.errorAttempts) {
      this.schedule(
        entry,
        this.policy.errorRetryMs * 2 ** (entry.errorAnswers - 1),
      );
      return;
    }
    entry.state = "failed";
    entry.nextAttemptAtMs = undefined;
  }

  private schedule(entry: Entry, delayMs: number): void {
    entry.state = "waiting";
    entry.nextAttemptAtMs = this.timers.now() + Math.max(delayMs, 0);
    this.armTimer();
  }

  /** Keeps exactly one timer, set to the earliest outstanding deadline. */
  private armTimer(): void {
    if (!this.running) {
      return;
    }
    let earliest: number | undefined;
    for (const entry of this.entries.values()) {
      if (entry.state !== "waiting" || entry.nextAttemptAtMs === undefined) {
        continue;
      }
      if (earliest === undefined || entry.nextAttemptAtMs < earliest) {
        earliest = entry.nextAttemptAtMs;
      }
    }
    if (earliest === undefined) {
      this.cancelTimer();
      return;
    }
    if (this.timerAtMs !== undefined && this.timerAtMs <= earliest) {
      return;
    }
    this.cancelTimer();
    this.timerAtMs = earliest;
    this.timerHandle = this.timers.setTimer(
      () => this.onTimer(),
      Math.max(earliest - this.timers.now(), 0),
    );
  }

  private onTimer(): void {
    this.timerHandle = undefined;
    this.timerAtMs = undefined;
    if (!this.running) {
      return;
    }
    const nowMs = this.timers.now();
    for (const entry of this.entries.values()) {
      if (
        entry.state === "waiting" &&
        entry.nextAttemptAtMs !== undefined &&
        entry.nextAttemptAtMs <= nowMs
      ) {
        entry.state = "queued";
        entry.nextAttemptAtMs = undefined;
        if (!this.queue.includes(entry.hash)) {
          this.queue.push(entry.hash);
        }
      }
    }
    this.pump();
    this.armTimer();
  }

  private cancelTimer(): void {
    if (this.timerHandle !== undefined) {
      this.timers.clearTimer(this.timerHandle);
    }
    this.timerHandle = undefined;
    this.timerAtMs = undefined;
  }

  private settleIdle(): void {
    if (this.queue.length > 0 || this.inFlight > 0) {
      return;
    }
    for (const resolve of this.idleWaiters.splice(0)) {
      resolve();
    }
  }
}

/** A scanner over a plain list, for a host without a reference index. */
export function staticAttachmentReferenceScanner(
  references: readonly AttachmentReferenceRow[],
): IAttachmentReferenceScanner {
  return {
    listReferences: (cursor, limit) => {
      const start = cursor === undefined ? 0 : Number(cursor);
      const page = references.slice(start, start + limit);
      const next = start + page.length;
      return Promise.resolve({
        references: page,
        nextCursor: next < references.length ? String(next) : undefined,
      });
    },
  };
}
