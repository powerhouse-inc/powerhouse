import type {
  DeadLetterPage,
  RemoteSyncInspection,
} from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import type { CorrelationId, RpcMessage } from "../../src/rpc/protocol.js";
import { createSyncManagerProxy } from "../../src/rpc/sync-manager-proxy.js";
import {
  dispatchSyncOp,
  SYNC_OPS,
  type InspectableSyncManager,
} from "../../src/rpc/sync-ops.js";
import type { IRpcTransport } from "../../src/rpc/transport.js";

const inspection: RemoteSyncInspection = {
  remoteName: "accounts",
  remoteId: "r1",
  inboxCursor: {
    cursorType: "inbox",
    cursorOrdinal: 9770,
    lastSyncedAtUtcMs: 1000,
    liveAckOrdinal: 9770,
    liveLatestOrdinal: 9800,
  },
  outboxCursor: {
    cursorType: "outbox",
    cursorOrdinal: 42,
    lastSyncedAtUtcMs: 1001,
    liveAckOrdinal: 42,
    liveLatestOrdinal: 42,
  },
  mailboxDepths: { inbox: 30, outbox: 0, deadLetter: 3 },
  connection: {
    snapshot: {
      state: "connected",
      failureCount: 0,
      lastSuccessUtcMs: 0,
      lastFailureUtcMs: 0,
      pushBlocked: false,
      pushFailureCount: 0,
      receivingPages: false,
      requiresAuth: false,
    },
    neverSucceeded: true,
    stalenessMs: undefined,
  },
};

const deadLetterPage: DeadLetterPage = {
  remoteName: "accounts",
  results: [],
  nextCursor: undefined,
};

type FakeSyncManager = InspectableSyncManager & {
  inspectRemote: ReturnType<typeof vi.fn>;
  inspectRemotes: ReturnType<typeof vi.fn>;
  listDeadLetters: ReturnType<typeof vi.fn>;
  rewindInboxCursor: ReturnType<typeof vi.fn>;
  resetChannel: ReturnType<typeof vi.fn>;
  requeueDeadLetter: ReturnType<typeof vi.fn>;
  clearDeadLetter: ReturnType<typeof vi.fn>;
};

function fakeSyncManager(): FakeSyncManager {
  const basis = {
    local: {
      format: 1,
      sequence: 1,
      revision: "r",
      protocols: {},
      features: {},
    },
    legacy: { protocols: {}, features: {} },
    wanted: {},
  };
  const partial = {
    list: vi.fn(() => []),
    agreement: vi.fn(() => ({ basis: () => basis })),
    triggerPull: vi.fn(),
    inspectRemote: vi.fn(() => Promise.resolve(inspection)),
    inspectRemotes: vi.fn(() => Promise.resolve([inspection])),
    listDeadLetters: vi.fn(() => Promise.resolve(deadLetterPage)),
    rewindInboxCursor: vi.fn(() => Promise.resolve()),
    resetChannel: vi.fn(() => Promise.resolve()),
    requeueDeadLetter: vi.fn(() => Promise.resolve()),
    clearDeadLetter: vi.fn(() => Promise.resolve()),
  };
  return partial as unknown as FakeSyncManager;
}

describe("dispatchSyncOp (W0.5 inspection + repair)", () => {
  it("routes every new op string to its sync-manager method", async () => {
    const manager = fakeSyncManager();
    const call = (method: string, args: unknown[] = []) =>
      dispatchSyncOp(manager, method, args);

    await expect(call(SYNC_OPS.inspectRemote, ["accounts"])).resolves.toBe(
      inspection,
    );
    await expect(call(SYNC_OPS.inspectRemotes)).resolves.toEqual([inspection]);
    await expect(
      call(SYNC_OPS.listDeadLetters, ["accounts", "0", 25]),
    ).resolves.toBe(deadLetterPage);
    await expect(
      call(SYNC_OPS.rewindInboxCursor, ["accounts", 0]),
    ).resolves.toBeUndefined();
    await expect(
      call(SYNC_OPS.resetChannel, ["accounts"]),
    ).resolves.toBeUndefined();
    await expect(
      call(SYNC_OPS.requeueDeadLetter, ["accounts", "dl-1"]),
    ).resolves.toBeUndefined();
    await expect(
      call(SYNC_OPS.clearDeadLetter, ["accounts", "dl-1"]),
    ).resolves.toBeUndefined();

    expect(manager.inspectRemote).toHaveBeenCalledWith("accounts");
    expect(manager.listDeadLetters).toHaveBeenCalledWith("accounts", "0", 25);
    expect(manager.rewindInboxCursor).toHaveBeenCalledWith("accounts", 0);
    expect(manager.resetChannel).toHaveBeenCalledWith("accounts");
    expect(manager.requeueDeadLetter).toHaveBeenCalledWith("accounts", "dl-1");
    expect(manager.clearDeadLetter).toHaveBeenCalledWith("accounts", "dl-1");
  });

  it("errors on an unknown op", async () => {
    await expect(
      dispatchSyncOp(fakeSyncManager(), "sync.explode", []),
    ).rejects.toThrow("Unknown sync op: sync.explode");
  });
});

/**
 * Wires a {@link SyncManagerProxy} to a host that resolves each sync-op through
 * {@link dispatchSyncOp} against a fake sync manager, so a call round-trips over
 * the router exactly as it would over a worker port. Proves the real inspection
 * state crosses the boundary where `NoopMailbox` used to return zeros.
 */
function wiredProxy(manager: InspectableSyncManager) {
  let deliver: (message: RpcMessage) => void = () => undefined;
  const transport: IRpcTransport = {
    post: (message) => {
      const msg = message as {
        k: string;
        id: CorrelationId;
        method: string;
        args: unknown[];
      };
      if (msg.k !== "sync-op") {
        return;
      }
      void dispatchSyncOp(manager, msg.method, msg.args).then(
        (value) => deliver({ k: "res", id: msg.id, value }),
        (error: unknown) =>
          deliver({
            k: "err",
            id: msg.id,
            error: { name: "Error", message: String(error) },
          }),
      );
    },
    onMessage: (listener) => {
      deliver = listener;
      return () => {
        deliver = () => undefined;
      };
    },
    close: () => undefined,
  };
  const router = new MessageRouter();
  router.attach(transport);
  return createSyncManagerProxy(router, createReactorEventBusProxy(router));
}

describe("SyncManagerProxy inspection round-trip", () => {
  it("carries real cursors, mailbox depths and the neverSucceeded flag", async () => {
    const manager = fakeSyncManager();
    const proxy = wiredProxy(manager);

    const result = await proxy.inspectRemote("accounts");
    expect(result.mailboxDepths).toEqual({
      inbox: 30,
      outbox: 0,
      deadLetter: 3,
    });
    expect(result.inboxCursor.cursorOrdinal).toBe(9770);
    expect(result.connection.neverSucceeded).toBe(true);
  });

  it("round-trips the repair levers to the worker's sync manager", async () => {
    const manager = fakeSyncManager();
    const proxy = wiredProxy(manager);

    await proxy.rewindInboxCursor("accounts", 0);
    await proxy.requeueDeadLetter("accounts", "dl-1");
    await proxy.clearDeadLetter("accounts", "dl-2");

    expect(manager.rewindInboxCursor).toHaveBeenCalledWith("accounts", 0);
    expect(manager.requeueDeadLetter).toHaveBeenCalledWith("accounts", "dl-1");
    expect(manager.clearDeadLetter).toHaveBeenCalledWith("accounts", "dl-2");
  });
});
