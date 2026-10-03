import type { DeadLetterRecord } from "../storage/interfaces.js";
import type { ISyncManager } from "./interfaces.js";
import type { ConnectionStateSnapshot } from "./types.js";

/**
 * A remote's persisted sync cursor plus the live in-memory watermark its
 * channel is actually polling from. The two diverging is the exact failure the
 * field hunt caught: the persisted cursor stood ahead of durable data while the
 * channel polled "caught up". `cursorOrdinal`/`lastSyncedAtUtcMs` are read from
 * `ISyncCursorStorage`; `liveAckOrdinal`/`liveLatestOrdinal` from the channel's
 * mailbox, which is what the next poll request is built from.
 */
export type RemoteCursorInfo = {
  cursorType: "inbox" | "outbox";
  cursorOrdinal: number;
  lastSyncedAtUtcMs?: number;
  liveAckOrdinal: number;
  liveLatestOrdinal: number;
};

/** How many sync operations sit in each of a remote channel's mailboxes. */
export type MailboxDepths = {
  inbox: number;
  outbox: number;
  deadLetter: number;
};

/**
 * A remote channel's connection snapshot with the two derived signals the live
 * bug hunt had to re-derive by hand, promoted to first-class fields so no UI
 * has to compute them again:
 *
 * - `neverSucceeded`: the channel reports `state: "connected"` yet has never
 *   completed a poll since boot (`lastSuccessUtcMs === 0`). This is the precise
 *   lie that read green while storage was dead.
 * - `stalenessMs`: how long since the last successful poll, or `undefined` when
 *   it has never succeeded. A large value on a `connected` channel is a poll
 *   loop that died silently after an earlier success.
 */
export type RemoteConnectionHealth = {
  snapshot: ConnectionStateSnapshot;
  neverSucceeded: boolean;
  stalenessMs?: number;
};

/**
 * Everything the inspector surfaces about one remote's sync state: cursors,
 * mailbox depths and connection health, in one cloneable record so it survives
 * the RPC hop to a tab-side inspector.
 */
export type RemoteSyncInspection = {
  remoteName: string;
  remoteId: string;
  inboxCursor: RemoteCursorInfo;
  outboxCursor: RemoteCursorInfo;
  mailboxDepths: MailboxDepths;
  connection: RemoteConnectionHealth;
};

/**
 * One page of a remote's dead letters, cloneable for RPC. `PagedResults`'s
 * `next()` closure and `options` cannot cross a `postMessage` boundary, so the
 * wire shape carries only the records and the cursor to fetch the next page.
 */
export type DeadLetterPage = {
  remoteName: string;
  results: DeadLetterRecord[];
  nextCursor?: string;
};

/**
 * Read-only sync observation plus the operator repair levers that recover a
 * poisoned channel (see
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md).
 *
 * A sibling of `IInspector` rather than part of it: these read the sync
 * manager's channels, cursor storage and dead-letter storage, which the
 * reactor inspection surface does not hold. Implemented in-process by
 * `SyncManager` and over RPC by `SyncManagerProxy`, so the same surface serves
 * a worker reactor and a local one.
 *
 * Every repair lever is idempotent and scoped to a single remote, so running
 * one never disturbs another remote's channel.
 */
export interface ISyncInspector {
  /** Cursors, mailbox depths and connection health for one remote. */
  inspectRemote(remoteName: string): Promise<RemoteSyncInspection>;

  /** The same inspection for every configured remote. */
  inspectRemotes(): Promise<RemoteSyncInspection[]>;

  /** A remote's dead letters, newest first, paged. */
  listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<DeadLetterPage>;

  /**
   * Rewinds a remote's inbox cursor to `toOrdinal` and re-pulls from there.
   *
   * The field repair that previously needed hand-run SQL plus a worker restart:
   * cursor state is held in memory by the channel and only re-read at init, so
   * lowering the stored cursor alone did nothing until a restart. This resets
   * the channel's in-memory inbox watermark AND persists the lower cursor, then
   * triggers a pull, so the rewind takes effect in place.
   */
  rewindInboxCursor(remoteName: string, toOrdinal: number): Promise<void>;

  /**
   * Tears down and re-initializes a single remote's channel without touching
   * any other remote. The fresh channel re-reads cursor storage, so this is the
   * heavier repair when a channel's in-memory state is wedged (e.g. a dead poll
   * loop) rather than merely ahead of durable data.
   */
  resetChannel(remoteName: string): Promise<void>;

  /**
   * Moves a dead-lettered operation back to the inbox for another apply
   * attempt, clearing the document's quarantine so it is not dropped again.
   * Idempotent: an id that is no longer dead-lettered is a no-op.
   */
  requeueDeadLetter(remoteName: string, id: string): Promise<void>;

  /**
   * Drops a dead-lettered operation permanently, from both the live mailbox and
   * dead-letter storage. Idempotent.
   */
  clearDeadLetter(remoteName: string, id: string): Promise<void>;
}

/**
 * A sync manager that also serves the sync-inspection surface (W0.5). The
 * concrete `SyncManager` and the tab-side `SyncManagerProxy` both satisfy it, so
 * it is the type the inspection and repair ops are dispatched against.
 */
export type InspectableSyncManager = ISyncManager & ISyncInspector;

/** Derives the first-class health signals from a raw connection snapshot. */
export function deriveConnectionHealth(
  snapshot: ConnectionStateSnapshot,
  nowMs: number = Date.now(),
): RemoteConnectionHealth {
  const neverSucceeded =
    snapshot.state === "connected" && snapshot.lastSuccessUtcMs === 0;
  const stalenessMs =
    snapshot.lastSuccessUtcMs > 0
      ? Math.max(0, nowMs - snapshot.lastSuccessUtcMs)
      : undefined;
  return { snapshot, neverSucceeded, stalenessMs };
}
