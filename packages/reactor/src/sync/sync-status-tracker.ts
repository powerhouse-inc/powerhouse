import type { IChannel } from "./interfaces.js";
import type { SyncOperation } from "./sync-operation.js";

export enum SyncStatus {
  Synced = "SYNCED",
  Outgoing = "OUTGOING",
  Incoming = "INCOMING",
  OutgoingAndIncoming = "OUTGOING_AND_INCOMING",
  Error = "ERROR",
}

export type SyncStatusChangeCallback = (
  documentId: string,
  status: SyncStatus,
) => void;

export interface ISyncStatusTracker {
  getStatus(documentId: string): SyncStatus | undefined;
  onChange(callback: SyncStatusChangeCallback): () => void;
  trackRemote(remoteName: string, channel: IChannel): void;
  untrackRemote(remoteName: string): void;
  clear(): void;
}

type DocumentCounts = {
  inboxCount: number;
  outboxCount: number;
  errorCount: number;
};

type MailboxType = "inbox" | "outbox" | "deadLetter";

export class SyncStatusTracker implements ISyncStatusTracker {
  private readonly remotes: Map<string, Map<string, DocumentCounts>> =
    new Map();
  private readonly seen: Set<string> = new Set();
  private readonly callbacks: Set<SyncStatusChangeCallback> = new Set();

  getStatus(documentId: string): SyncStatus | undefined {
    if (!this.seen.has(documentId)) {
      return undefined;
    }

    let totalInbox = 0;
    let totalOutbox = 0;
    let totalErrors = 0;

    for (const documents of this.remotes.values()) {
      const counts = documents.get(documentId);
      if (counts) {
        totalInbox += counts.inboxCount;
        totalOutbox += counts.outboxCount;
        totalErrors += counts.errorCount;
      }
    }

    return deriveStatus(totalInbox, totalOutbox, totalErrors);
  }

  onChange(callback: SyncStatusChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  trackRemote(remoteName: string, channel: IChannel): void {
    this.remotes.set(remoteName, new Map());

    channel.inbox.onAdded((syncOps) =>
      this.handleAdded(remoteName, "inbox", syncOps),
    );
    channel.inbox.onRemoved((syncOps) =>
      this.handleRemoved(remoteName, "inbox", syncOps),
    );
    channel.outbox.onAdded((syncOps) =>
      this.handleAdded(remoteName, "outbox", syncOps),
    );
    channel.outbox.onRemoved((syncOps) =>
      this.handleRemoved(remoteName, "outbox", syncOps),
    );
    channel.deadLetter.onAdded((syncOps) =>
      this.handleAdded(remoteName, "deadLetter", syncOps),
    );
  }

  untrackRemote(remoteName: string): void {
    const documents = this.remotes.get(remoteName);
    if (!documents) {
      return;
    }

    const affectedDocumentIds = [...documents.keys()];
    this.remotes.delete(remoteName);

    for (const documentId of affectedDocumentIds) {
      this.notifyChange(documentId);
    }
  }

  clear(): void {
    this.remotes.clear();
    this.seen.clear();
    this.callbacks.clear();
  }

  private handleAdded(
    remoteName: string,
    mailboxType: MailboxType,
    syncOps: SyncOperation[],
  ): void {
    const changedDocuments = new Set<string>();

    for (const syncOp of syncOps) {
      if (mailboxType === "inbox" && !syncOp.remoteName) {
        continue;
      }

      const counts = this.getOrCreateCounts(remoteName, syncOp.documentId);
      this.seen.add(syncOp.documentId);

      if (mailboxType === "inbox") {
        counts.inboxCount++;
      } else if (mailboxType === "outbox") {
        counts.outboxCount++;
      } else {
        counts.errorCount++;
      }

      changedDocuments.add(syncOp.documentId);
    }

    for (const documentId of changedDocuments) {
      this.notifyChange(documentId);
    }
  }

  private handleRemoved(
    remoteName: string,
    mailboxType: MailboxType,
    syncOps: SyncOperation[],
  ): void {
    const changedDocuments = new Set<string>();

    for (const syncOp of syncOps) {
      const counts = this.getOrCreateCounts(remoteName, syncOp.documentId);

      if (mailboxType === "inbox") {
        counts.inboxCount = Math.max(0, counts.inboxCount - 1);
      } else if (mailboxType === "outbox") {
        counts.outboxCount = Math.max(0, counts.outboxCount - 1);
      }

      changedDocuments.add(syncOp.documentId);
    }

    for (const documentId of changedDocuments) {
      this.notifyChange(documentId);
    }
  }

  private getOrCreateCounts(
    remoteName: string,
    documentId: string,
  ): DocumentCounts {
    let documents = this.remotes.get(remoteName);
    if (!documents) {
      documents = new Map();
      this.remotes.set(remoteName, documents);
    }

    let counts = documents.get(documentId);
    if (!counts) {
      counts = { inboxCount: 0, outboxCount: 0, errorCount: 0 };
      documents.set(documentId, counts);
    }

    return counts;
  }

  private notifyChange(documentId: string): void {
    const status = this.getStatus(documentId);
    if (status === undefined) {
      return;
    }

    for (const callback of [...this.callbacks]) {
      callback(documentId, status);
    }
  }
}

function deriveStatus(
  inboxCount: number,
  outboxCount: number,
  errorCount: number,
): SyncStatus {
  if (errorCount > 0) {
    return SyncStatus.Error;
  }
  if (inboxCount > 0 && outboxCount > 0) {
    return SyncStatus.OutgoingAndIncoming;
  }
  if (inboxCount > 0) {
    return SyncStatus.Incoming;
  }
  if (outboxCount > 0) {
    return SyncStatus.Outgoing;
  }
  return SyncStatus.Synced;
}
