import { describe, expect, it, vi } from "vitest";
import type { IChannel } from "../../../src/sync/interfaces.js";
import type { IMailbox, MailboxCallback } from "../../../src/sync/mailbox.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import {
  SyncStatus,
  SyncStatusTracker,
} from "../../../src/sync/sync-status-tracker.js";

function createMockMailbox(): IMailbox {
  return {
    get items() {
      return [];
    },
    get latestOrdinal() {
      return 0;
    },
    get ackOrdinal() {
      return 0;
    },
    init: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    onAdded: vi.fn(),
    onRemoved: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    flush: vi.fn(),
  };
}

function createMockChannel(): IChannel {
  return {
    inbox: createMockMailbox(),
    outbox: createMockMailbox(),
    deadLetter: createMockMailbox(),
    init: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function createSyncOp(
  documentId: string,
  remoteName: string = "remote-1",
): SyncOperation {
  return new SyncOperation(
    crypto.randomUUID(),
    crypto.randomUUID(),
    [],
    remoteName,
    documentId,
    ["global"],
    "main",
    [],
  );
}

function getCallback(
  mailbox: IMailbox,
  event: "onAdded" | "onRemoved",
): MailboxCallback {
  return vi.mocked(mailbox[event]).mock.calls[0][0];
}

describe("SyncStatusTracker", () => {
  it("returns undefined for unknown document", () => {
    const tracker = new SyncStatusTracker();
    expect(tracker.getStatus("unknown-doc")).toBeUndefined();
  });

  it("returns Outgoing when outbox has items", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    onOutboxAdded([createSyncOp("doc-1")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);
  });

  it("returns Synced after outbox add then remove", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const syncOp = createSyncOp("doc-1");
    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    const onOutboxRemoved = getCallback(channel.outbox, "onRemoved");

    onOutboxAdded([syncOp]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);

    onOutboxRemoved([syncOp]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Synced);
  });

  it("returns Incoming when inbox has remote-originated items", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onInboxAdded = getCallback(channel.inbox, "onAdded");
    onInboxAdded([createSyncOp("doc-1", "some-remote")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Incoming);
  });

  it("ignores inbox items with empty remoteName", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onInboxAdded = getCallback(channel.inbox, "onAdded");
    onInboxAdded([createSyncOp("doc-1", "")]);

    expect(tracker.getStatus("doc-1")).toBeUndefined();
  });

  it("returns Synced after inbox add then remove", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const syncOp = createSyncOp("doc-1", "some-remote");
    const onInboxAdded = getCallback(channel.inbox, "onAdded");
    const onInboxRemoved = getCallback(channel.inbox, "onRemoved");

    onInboxAdded([syncOp]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Incoming);

    onInboxRemoved([syncOp]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Synced);
  });

  it("returns OutgoingAndIncoming when both directions active", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onInboxAdded = getCallback(channel.inbox, "onAdded");
    const onOutboxAdded = getCallback(channel.outbox, "onAdded");

    onInboxAdded([createSyncOp("doc-1", "some-remote")]);
    onOutboxAdded([createSyncOp("doc-1")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.OutgoingAndIncoming);
  });

  it("transitions to single direction when one side drains", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const inboxOp = createSyncOp("doc-1", "some-remote");
    const outboxOp = createSyncOp("doc-1");

    const onInboxAdded = getCallback(channel.inbox, "onAdded");
    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    const onInboxRemoved = getCallback(channel.inbox, "onRemoved");

    onInboxAdded([inboxOp]);
    onOutboxAdded([outboxOp]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.OutgoingAndIncoming);

    onInboxRemoved([inboxOp]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);
  });

  it("returns Error when dead letter has items", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onDeadLetterAdded = getCallback(channel.deadLetter, "onAdded");
    onDeadLetterAdded([createSyncOp("doc-1")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Error);
  });

  it("Error takes priority over inbox/outbox activity", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onInboxAdded = getCallback(channel.inbox, "onAdded");
    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    const onDeadLetterAdded = getCallback(channel.deadLetter, "onAdded");

    onInboxAdded([createSyncOp("doc-1", "some-remote")]);
    onOutboxAdded([createSyncOp("doc-1")]);
    onDeadLetterAdded([createSyncOp("doc-1")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Error);
  });

  it("tracks across multiple remotes", () => {
    const tracker = new SyncStatusTracker();
    const channel1 = createMockChannel();
    const channel2 = createMockChannel();
    tracker.trackRemote("remote-1", channel1);
    tracker.trackRemote("remote-2", channel2);

    const onOutboxAdded1 = getCallback(channel1.outbox, "onAdded");
    const onOutboxAdded2 = getCallback(channel2.outbox, "onAdded");
    const onOutboxRemoved1 = getCallback(channel1.outbox, "onRemoved");

    const op1 = createSyncOp("doc-1");
    const op2 = createSyncOp("doc-1");

    onOutboxAdded1([op1]);
    onOutboxAdded2([op2]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);

    onOutboxRemoved1([op1]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);
  });

  it("tracks multiple documents independently", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    const onInboxAdded = getCallback(channel.inbox, "onAdded");

    onOutboxAdded([createSyncOp("doc-1")]);
    onInboxAdded([createSyncOp("doc-2", "some-remote")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);
    expect(tracker.getStatus("doc-2")).toBe(SyncStatus.Incoming);
  });

  it("onChange callback fires on status transitions", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const callback = vi.fn();
    tracker.onChange(callback);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    onOutboxAdded([createSyncOp("doc-1")]);

    expect(callback).toHaveBeenCalledWith("doc-1", SyncStatus.Outgoing);
  });

  it("onChange unsubscribe stops callback", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const callback = vi.fn();
    const unsubscribe = tracker.onChange(callback);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    onOutboxAdded([createSyncOp("doc-1")]);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();

    onOutboxAdded([createSyncOp("doc-2")]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("untrackRemote clears state and notifies affected documents", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    onOutboxAdded([createSyncOp("doc-1")]);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);

    const callback = vi.fn();
    tracker.onChange(callback);

    tracker.untrackRemote("remote-1");

    expect(callback).toHaveBeenCalledWith("doc-1", SyncStatus.Synced);
    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Synced);
  });

  it("clear resets everything", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    onOutboxAdded([createSyncOp("doc-1")]);

    const callback = vi.fn();
    tracker.onChange(callback);

    tracker.clear();

    expect(tracker.getStatus("doc-1")).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
  });

  it("handles batch add with multiple sync ops in single call", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const callback = vi.fn();
    tracker.onChange(callback);

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    onOutboxAdded([createSyncOp("doc-1"), createSyncOp("doc-2")]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Outgoing);
    expect(tracker.getStatus("doc-2")).toBe(SyncStatus.Outgoing);
    expect(callback).toHaveBeenCalledWith("doc-1", SyncStatus.Outgoing);
    expect(callback).toHaveBeenCalledWith("doc-2", SyncStatus.Outgoing);
  });

  it("handles batch remove with multiple sync ops in single call", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const op1 = createSyncOp("doc-1");
    const op2 = createSyncOp("doc-2");

    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    const onOutboxRemoved = getCallback(channel.outbox, "onRemoved");

    onOutboxAdded([op1, op2]);
    onOutboxRemoved([op1, op2]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Synced);
    expect(tracker.getStatus("doc-2")).toBe(SyncStatus.Synced);
  });

  it("does not decrement below zero", () => {
    const tracker = new SyncStatusTracker();
    const channel = createMockChannel();
    tracker.trackRemote("remote-1", channel);

    const syncOp = createSyncOp("doc-1");
    const onOutboxAdded = getCallback(channel.outbox, "onAdded");
    const onOutboxRemoved = getCallback(channel.outbox, "onRemoved");

    onOutboxAdded([syncOp]);
    onOutboxRemoved([syncOp]);
    onOutboxRemoved([syncOp]);

    expect(tracker.getStatus("doc-1")).toBe(SyncStatus.Synced);
  });

  it("untrackRemote with unknown remote is a no-op", () => {
    const tracker = new SyncStatusTracker();
    expect(() => tracker.untrackRemote("nonexistent")).not.toThrow();
  });
});
