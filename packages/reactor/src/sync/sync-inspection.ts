import type { DeadLetterRecord } from "../storage/interfaces.js";
import type { ConnectionStateSnapshot } from "./types.js";

/** A remote's persisted cursor beside its channel's live watermark. */
export type RemoteCursorInfo = {
  cursorType: "inbox" | "outbox";
  cursorOrdinal: number;
  lastSyncedAtUtcMs?: number;
  liveAckOrdinal: number;
  liveLatestOrdinal: number;
};

export type MailboxDepths = {
  inbox: number;
  outbox: number;
  deadLetter: number;
};

export type RemoteConnectionHealth = {
  snapshot: ConnectionStateSnapshot;
  /** "connected" without one completed poll since boot. */
  neverSucceeded: boolean;
  /** Since the last successful poll; absent when there was none. */
  stalenessMs?: number;
};

export type RemoteSyncInspection = {
  remoteName: string;
  remoteId: string;
  inboxCursor: RemoteCursorInfo;
  outboxCursor: RemoteCursorInfo;
  mailboxDepths: MailboxDepths;
  connection: RemoteConnectionHealth;
};

/** One page of dead letters, without the `next()` closure a clone cannot carry. */
export type DeadLetterPage = {
  remoteName: string;
  results: DeadLetterRecord[];
  nextCursor?: string;
};

/** Sync reads; the repair levers are `ISyncAdmin`. */
export interface ISyncInspector {
  inspectRemote(remoteName: string): Promise<RemoteSyncInspection>;
  inspectRemotes(): Promise<RemoteSyncInspection[]>;
  /** Newest first; limit clamps to [1, max per remote]; cursor is a row offset. */
  listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<DeadLetterPage>;
}

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
