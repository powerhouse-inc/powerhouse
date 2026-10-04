import {
  isOlderManifest,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { DriveCollectionId } from "../../cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { ChannelError } from "../errors.js";
import type {
  ConnectionStateChangeCallback,
  IChannel,
  PeerManifestListener,
} from "../interfaces.js";
import { type IMailbox, Mailbox } from "../mailbox.js";
import type { SyncOperation } from "../sync-operation.js";
import type {
  ConnectionState,
  ConnectionStateSnapshot,
  RemoteFilter,
  SyncEnvelope,
} from "../types.js";
import { ChannelErrorSource, SyncOperationStatus } from "../types.js";
import { trimMailboxFromAckOrdinal } from "../utils.js";
import { calculateBackoffDelay } from "./interval-poll-timer.js";
import type { LocalChannelPort } from "./local-channel-transport.js";
import {
  isLocalWireMessage,
  type LocalHelloMessage,
  type LocalPushMessage,
  type LocalResendMessage,
  type LocalWireMessage,
} from "./local-wire.js";
import {
  envelopesToSyncOperations,
  getLatestAppliedOrdinal,
  serializeEnvelope,
} from "./utils.js";

/** Which of a remote's two cursor rows a write targets. */
type CursorType = "inbox" | "outbox";

/** Base delay for the backoff that re-pushes after a transient transport fault. */
const PUSH_RETRY_BASE_DELAY_MS = 500;
/** Ceiling for that backoff. */
const PUSH_RETRY_MAX_DELAY_MS = 30_000;

/**
 * Serialised cursor persistence for one cursor row; see
 * {@link LocalChannel.persistCursor}. Mirrors the gql request channel so no
 * cursor row is ever written out of order or by two concurrent writers.
 */
type CursorWriter = {
  persisted: number;
  requested: number;
  tail: Promise<void>;
};

/**
 * A symmetric, push-capable synchronization channel between two reactors over a
 * message port.
 *
 * Unlike the gql channels -- one polls and pushes over HTTP, the other never
 * initiates and is filled by resolvers -- a LocalChannel is peer-to-peer: either
 * side may push envelopes to the other at any time, with no GraphQL, no HTTP and
 * no Switchboard. It is the productionized sibling of the test channel: a real
 * wire protocol over an injected {@link LocalChannelPort}, the peer-manifest
 * handshake wired into the sync manager, cursor persistence, and ACK-driven
 * outbox trimming.
 *
 * The inbox holds its ack below unapplied purge markers, as the gql channels'
 * inboxes do.
 */
export class LocalChannel implements IChannel {
  readonly inbox: IMailbox;
  readonly outbox: IMailbox;
  readonly deadLetter: IMailbox;

  private readonly logger: ILogger;
  private readonly channelId: string;
  private readonly remoteName: string;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly port: LocalChannelPort;
  private readonly collectionId: DriveCollectionId;
  private readonly filter: RemoteFilter;

  private isShutdown = false;
  private unsubscribeTransport?: () => void;
  private localManifestProvider?: () => PeerManifest;
  /** Undefined until the first handshake; null for a peer that announces nothing. */
  private peerManifest: PeerManifest | null | undefined = undefined;
  private readonly peerManifestCallbacks = new Set<PeerManifestListener>();

  private connectionState: ConnectionState = "connecting";
  private failureCount = 0;
  private lastSuccessUtcMs?: number;
  private lastFailureUtcMs?: number;
  /** The highest inbox ack already reported to the peer; only an advance re-posts. */
  private lastPostedAckOrdinal = 0;
  private pushFailureCount = 0;
  private pushRetryTimer?: ReturnType<typeof setTimeout>;
  private readonly connectionStateCallbacks =
    new Set<ConnectionStateChangeCallback>();

  private readonly cursorWriters: Record<CursorType, CursorWriter> = {
    inbox: { persisted: 0, requested: 0, tail: Promise.resolve() },
    outbox: { persisted: 0, requested: 0, tail: Promise.resolve() },
  };

  constructor(
    logger: ILogger,
    channelId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
    port: LocalChannelPort,
    collectionId: DriveCollectionId,
    filter: RemoteFilter,
  ) {
    this.logger = logger;
    this.channelId = channelId;
    this.remoteName = remoteName;
    this.cursorStorage = cursorStorage;
    this.port = port;
    this.collectionId = collectionId;
    this.filter = filter;

    this.inbox = new Mailbox({ holdAckBelowMarkers: true });
    this.outbox = new Mailbox();
    this.deadLetter = new Mailbox();

    this.outbox.onAdded((added) => this.onOutboxAdded(added));
    this.outbox.onRemoved((syncOps) => this.onOutboxRemoved(syncOps));
    this.inbox.onRemoved(() => this.onInboxRemoved());
  }

  /**
   * Loads the persisted cursors and initialises both mailboxes BEFORE
   * subscribing to the transport, so no inbound message is ever processed
   * against a zeroed mailbox. A frame processed before `inbox.init` runs would
   * be added below an ack of 0, and the init that followed would overwrite the
   * ack while leaving that frame pinning the floor -- dragging the live ack
   * below the durable cursor and re-loading already-applied ops as fresh jobs.
   *
   * Loading first is safe because both the browser MessagePort and the
   * node:worker_threads port buffer messages posted before a listener attaches:
   * a peer frame sent during the cursor load is delivered, in order, the moment
   * the listener is attached here -- never lost, and never applied before the
   * ack floor is known. Nothing needs the subscription during the load, since
   * this side announces itself only once init completes.
   */
  async init(): Promise<void> {
    const cursors = await this.cursorStorage.list(this.remoteName);
    const inboxOrdinal =
      cursors.find((c) => c.cursorType === "inbox")?.cursorOrdinal ?? 0;
    const outboxOrdinal =
      cursors.find((c) => c.cursorType === "outbox")?.cursorOrdinal ?? 0;
    this.inbox.init(inboxOrdinal);
    this.outbox.init(outboxOrdinal);
    this.cursorWriters.inbox.persisted = inboxOrdinal;
    this.cursorWriters.outbox.persisted = outboxOrdinal;
    this.lastPostedAckOrdinal = inboxOrdinal;

    this.unsubscribeTransport = this.port.onMessage((data) =>
      this.receive(data),
    );

    this.sendHello();
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;
    this.clearPushRetry();
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = undefined;
    try {
      this.port.close();
    } catch (error) {
      this.logger.warn(
        "LocalChannel @ChannelId failed to close its port: @Error",
        this.channelId,
        error,
      );
    }
    this.transitionConnectionState("disconnected");
    return Promise.resolve();
  }

  getConnectionState(): ConnectionStateSnapshot {
    return {
      state: this.connectionState,
      failureCount: this.failureCount,
      lastSuccessUtcMs: this.lastSuccessUtcMs ?? 0,
      lastFailureUtcMs: this.lastFailureUtcMs ?? 0,
      pushBlocked: this.pushRetryTimer !== undefined,
      pushFailureCount: this.pushFailureCount,
      receivingPages: false,
      requiresAuth: false,
    };
  }

  onConnectionStateChange(callback: ConnectionStateChangeCallback): () => void {
    this.connectionStateCallbacks.add(callback);
    return () => {
      this.connectionStateCallbacks.delete(callback);
    };
  }

  /**
   * A push transport has nothing to poll, so this asks the peer to re-push
   * whatever it still holds unacked for this side, from this side's inbox ack.
   */
  triggerPull(): void {
    if (this.isShutdown) return;
    this.post({
      kind: "resend",
      channelId: this.channelId,
      sinceOrdinal: this.inbox.ackOrdinal,
    });
  }

  /** This channel pushes to its peer; it has no holder to hear from. */
  notePoll(): void {}

  /** No holder, so nothing this channel reports may strand one. */
  lastHolderPollUtcMs(): number | undefined {
    return undefined;
  }

  setLocalManifest(provider: () => PeerManifest): void {
    this.localManifestProvider = provider;
  }

  onPeerManifest(callback: PeerManifestListener): () => void {
    this.peerManifestCallbacks.add(callback);
    return () => {
      this.peerManifestCallbacks.delete(callback);
    };
  }

  /** Pushes freshly added outbox items that have not since been removed. */
  private onOutboxAdded(added: SyncOperation[]): void {
    if (this.isShutdown) return;
    const syncOps = added.filter((op) => this.outbox.get(op.id) === op);
    if (syncOps.length > 0) this.pushOutbox(syncOps);
  }

  /**
   * Persists the outbox cursor from the applied ordinal of what was removed,
   * clamped below the lowest ordinal still in flight. Items for different
   * documents apply out of order, so the highest applied ordinal can pass one
   * still unacked; a restart from it would skip that one.
   */
  private onOutboxRemoved(syncOps: SyncOperation[]): void {
    const ordinal = Math.min(
      getLatestAppliedOrdinal(syncOps),
      this.unappliedOutboxFloor() - 1,
    );
    this.persistCursor("outbox", ordinal);
  }

  /**
   * Persists the inbox ack and reports it to the peer so it trims its outbox.
   * The ack is posted only when it strictly advances, so a burst of removals
   * that does not move the floor does not flood the peer with duplicate acks.
   */
  private onInboxRemoved(): void {
    const ackOrdinal = this.inbox.ackOrdinal;
    this.persistCursor("inbox", ackOrdinal);
    if (ackOrdinal > this.lastPostedAckOrdinal) {
      this.lastPostedAckOrdinal = ackOrdinal;
      this.post({ kind: "ack", channelId: this.channelId, ackOrdinal });
    }
  }

  private receive(data: unknown): void {
    if (this.isShutdown) return;
    if (!isLocalWireMessage(data)) {
      this.recordFailure(
        new Error("LocalChannel received a malformed wire message"),
      );
      return;
    }
    switch (data.kind) {
      case "hello":
        this.receiveHello(data);
        return;
      case "push":
        this.receivePush(data);
        return;
      case "ack":
        if (data.ackOrdinal > 0) {
          trimMailboxFromAckOrdinal(this.outbox, data.ackOrdinal);
        }
        return;
      case "resend":
        this.receiveResend(data);
        return;
    }
  }

  /**
   * A HELLO's sinceOrdinal is the peer's inbox ack, so the outbox is trimmed to
   * it exactly as an ACK would, letting a reconnect resume without re-serving
   * applied ops; the remaining unacked items are then re-pushed in case the
   * peer reconnected and lost them.
   */
  private receiveHello(message: LocalHelloMessage): void {
    if (message.sinceOrdinal > 0) {
      trimMailboxFromAckOrdinal(this.outbox, message.sinceOrdinal);
    }
    this.markSuccess();
    this.transitionConnectionState("connected");
    void this.hearPeer(message.manifest);
    this.rePushUnacked();
  }

  /**
   * Ingests a push into the inbox, dropping operations the inbox has already
   * acked. A reconnecting peer may re-push durable ops before it hears this
   * side's ack; adding one back as a fresh sync job would transiently drag the
   * ack floor below the persisted cursor, so a batch entirely at or below the
   * ack is skipped. A frame whose envelopes are malformed never reaches here --
   * {@link isLocalWireMessage} rejects it and {@link receive} records a failure.
   */
  private receivePush(message: LocalPushMessage): void {
    const ackFloor = this.inbox.ackOrdinal;
    const syncOps: SyncOperation[] = [];
    for (const envelope of message.envelopes) {
      const converted = envelopesToSyncOperations(
        envelope as SyncEnvelope,
        this.remoteName,
      );
      for (const syncOp of converted) {
        if (this.highestOrdinal(syncOp) <= ackFloor) continue;
        syncOp.transported();
        syncOps.push(syncOp);
      }
    }
    if (syncOps.length === 0) return;
    this.markSuccess();
    try {
      this.inbox.add(...syncOps);
    } catch (error) {
      this.recordFailure(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private receiveResend(message: LocalResendMessage): void {
    if (message.sinceOrdinal > 0) {
      trimMailboxFromAckOrdinal(this.outbox, message.sinceOrdinal);
    }
    this.rePushUnacked();
  }

  private sendHello(): void {
    this.post({
      kind: "hello",
      channelId: this.channelId,
      collectionId: this.collectionId.key,
      filter: this.filter,
      sinceOrdinal: this.inbox.ackOrdinal,
      manifest: this.localManifestProvider?.() ?? null,
    });
  }

  /**
   * Pushes the given outbox items to the peer, marking them in flight.
   *
   * A transport throw is classified rather than treated as terminal: only a
   * structured-clone failure, which recurs identically on every retry, dead-
   * letters its ops. Any other fault is transient -- the port is momentarily
   * unusable -- so the ops stay in the outbox and {@link handlePushFailure}
   * schedules a backoff re-push, keeping behaviour in step with the gql
   * sibling's recoverable/unrecoverable split.
   */
  private pushOutbox(syncOps: readonly SyncOperation[]): void {
    if (this.isShutdown || syncOps.length === 0) return;
    for (const syncOp of syncOps) syncOp.started();
    try {
      this.port.postMessage({
        kind: "push",
        channelId: this.channelId,
        envelopes: this.envelopesFor(syncOps),
      });
    } catch (error) {
      this.handlePushFailure(
        syncOps,
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }
    this.clearPushRetry();
  }

  /** Re-pushes every outbox item the peer has not acknowledged. */
  private rePushUnacked(): void {
    if (this.isShutdown) return;
    const unacked = this.outbox.items.filter(
      (syncOp) => syncOp.status !== SyncOperationStatus.Applied,
    );
    this.pushOutbox(unacked);
  }

  /**
   * Routes a push transport failure: a structured-clone (`DataCloneError`)
   * failure is unrecoverable and dead-letters its ops; any other error is a
   * transient transport fault, so the ops are left in the outbox to be
   * re-pushed by the backoff retry and by the next hello/resend recovery.
   */
  private handlePushFailure(
    syncOps: readonly SyncOperation[],
    error: Error,
  ): void {
    if (this.classifyPostError(error) === "unrecoverable") {
      const channelError = new ChannelError(ChannelErrorSource.Outbox, error);
      for (const syncOp of syncOps) syncOp.failed(channelError);
      this.deadLetter.add(...syncOps);
      this.outbox.remove(...syncOps);
      this.recordFailure(error);
      return;
    }
    this.recordFailure(error);
    this.schedulePushRetry();
  }

  /** A structured-clone failure cannot self-heal; every other fault can. */
  private classifyPostError(error: Error): "recoverable" | "unrecoverable" {
    return error.name === "DataCloneError" ? "unrecoverable" : "recoverable";
  }

  /** Schedules a single backoff re-push of the unacked outbox. */
  private schedulePushRetry(): void {
    if (this.isShutdown || this.pushRetryTimer !== undefined) return;
    const delay = calculateBackoffDelay(
      this.pushFailureCount,
      PUSH_RETRY_BASE_DELAY_MS,
      PUSH_RETRY_MAX_DELAY_MS,
      Math.random(),
    );
    this.pushFailureCount++;
    this.pushRetryTimer = setTimeout(() => {
      this.pushRetryTimer = undefined;
      this.rePushUnacked();
    }, delay);
  }

  /** Clears the backoff state once a push lands or the channel stops. */
  private clearPushRetry(): void {
    this.pushFailureCount = 0;
    if (this.pushRetryTimer !== undefined) {
      clearTimeout(this.pushRetryTimer);
      this.pushRetryTimer = undefined;
    }
  }

  /** One envelope per SyncOperation, with key/dependsOn for batch ordering. */
  private envelopesFor(syncOps: readonly SyncOperation[]): unknown[] {
    const jobIdToKeys = new Map<string, string[]>();
    const envelopes: SyncEnvelope[] = [];

    for (let i = 0; i < syncOps.length; i++) {
      const syncOp = syncOps[i];
      const key = String(i);

      if (syncOp.jobId) {
        const keys = jobIdToKeys.get(syncOp.jobId) ?? [];
        keys.push(key);
        jobIdToKeys.set(syncOp.jobId, keys);
      }

      const dependsOn: string[] = [];
      for (const dep of syncOp.jobDependencies) {
        const depKeys = jobIdToKeys.get(dep);
        if (depKeys) dependsOn.push(...depKeys);
      }

      envelopes.push({
        type: "operations",
        channelMeta: { id: this.channelId },
        operations: syncOp.operations,
        key,
        dependsOn,
      });
    }

    return envelopes.map((envelope) => serializeEnvelope(envelope));
  }

  /**
   * Hears the peer's manifest, deduped like the gql channel: an older or
   * identical revision is ignored, so a reconnect that re-announces the same
   * manifest does not re-run the sync manager's hold reconciliation.
   */
  private async hearPeer(manifest: PeerManifest | null): Promise<void> {
    if (
      (this.peerManifest !== undefined &&
        (this.peerManifest?.revision ?? null) ===
          (manifest?.revision ?? null)) ||
      isOlderManifest(manifest, this.peerManifest)
    ) {
      return;
    }
    this.peerManifest = manifest;
    await Promise.all(
      [...this.peerManifestCallbacks].map(async (callback) => {
        try {
          await callback(manifest);
        } catch (error) {
          this.logger.error(
            "LocalChannel @ChannelId peer manifest callback error: @Error",
            this.channelId,
            error,
          );
        }
      }),
    );
  }

  /** Sends a message, returning whether the transport accepted it. */
  private post(message: LocalWireMessage): boolean {
    if (this.isShutdown) return false;
    try {
      this.port.postMessage(message);
      return true;
    } catch (error) {
      this.recordFailure(
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  }

  private markSuccess(): void {
    this.lastSuccessUtcMs = Date.now();
    this.failureCount = 0;
    this.clearPushRetry();
  }

  private recordFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureUtcMs = Date.now();
    this.logger.error(
      "LocalChannel @ChannelId transport error (@FailureCount): @Error",
      this.channelId,
      this.failureCount,
      error,
    );
    this.transitionConnectionState("error");
  }

  private transitionConnectionState(next: ConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    const snapshot = this.getConnectionState();
    for (const callback of this.connectionStateCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        this.logger.error(
          "LocalChannel @ChannelId connection state callback error: @Error",
          this.channelId,
          error,
        );
      }
    }
  }

  /** The greatest operation ordinal a sync op carries, or 0 when it carries none. */
  private highestOrdinal(syncOp: SyncOperation): number {
    let highest = 0;
    for (const op of syncOp.operations) {
      if (op.context.ordinal > highest) highest = op.context.ordinal;
    }
    return highest;
  }

  /** The lowest ordinal of an outbox item the peer has not applied. */
  private unappliedOutboxFloor(): number {
    let floor = Number.POSITIVE_INFINITY;
    for (const syncOp of this.outbox.items) {
      if (syncOp.status === SyncOperationStatus.Applied) continue;
      for (const op of syncOp.operations) {
        const ordinal = op.context.ordinal;
        if (ordinal > 0 && ordinal < floor) floor = ordinal;
      }
    }
    return floor;
  }

  /**
   * Advances a persisted cursor only once the write has landed, and never with
   * two writes for the same row outstanding. See the gql request channel for
   * the full argument: concurrent writers for one row are last-writer-wins, and
   * the storage promises no FIFO, so a burst of removals is coalesced into one
   * ordered write rather than a race.
   */
  private persistCursor(cursorType: CursorType, ordinal: number): void {
    const writer = this.cursorWriters[cursorType];
    if (ordinal <= Math.max(writer.persisted, writer.requested)) {
      return;
    }
    writer.requested = ordinal;
    writer.tail = writer.tail.then(() => this.writeCursor(cursorType));
  }

  /** One link of a cursor write chain; never rejects, so the chain survives. */
  private async writeCursor(cursorType: CursorType): Promise<void> {
    const writer = this.cursorWriters[cursorType];
    const ordinal = writer.requested;
    if (ordinal <= writer.persisted) {
      return;
    }
    writer.requested = 0;

    try {
      await this.cursorStorage.upsert({
        remoteName: this.remoteName,
        cursorType,
        cursorOrdinal: ordinal,
        lastSyncedAtUtcMs: Date.now(),
      });
    } catch (error) {
      this.logger.error(
        "LocalChannel @ChannelId failed to persist @CursorType cursor at @Ordinal; the watermark stays put so the next advance retries it: @Error",
        this.channelId,
        cursorType,
        ordinal,
        error,
      );
      return;
    }
    writer.persisted = Math.max(writer.persisted, ordinal);
  }
}
