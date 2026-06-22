import {
  DriveCollectionId,
  SyncEventTypes,
  SyncStatus,
  type ConnectionState,
  type ConnectionStateSnapshot,
} from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import type { OwnerMessage, RpcMessage } from "../../src/rpc/protocol.js";
import {
  createSyncManagerProxy,
  SYNC_STATUS_CHANGED_EVENT,
} from "../../src/rpc/sync-manager-proxy.js";
import type { IRpcTransport } from "../../src/rpc/transport.js";

function createFakeTransport() {
  const listeners = new Set<(m: RpcMessage) => void>();
  const posted: RpcMessage[] = [];
  const transport: IRpcTransport = {
    post: (m) => {
      posted.push(m);
    },
    onMessage: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    close: () => {},
  };
  const deliver = (m: OwnerMessage) => {
    for (const l of [...listeners]) {
      l(m);
    }
  };
  return { transport, posted, deliver };
}

function snapshot(state: ConnectionState): ConnectionStateSnapshot {
  return {
    state,
    failureCount: 0,
    lastSuccessUtcMs: 0,
    lastFailureUtcMs: 0,
    pushBlocked: false,
    pushFailureCount: 0,
    receivingPages: false,
  };
}

function wireRemote(
  id: string,
  name: string,
  driveId: string,
  state: ConnectionState,
  url?: string,
) {
  return {
    meta: {
      id,
      name,
      collectionId: { driveId, branch: "main" },
      channelConfig: { type: "gql", parameters: url ? { url } : {} },
      filter: { documentId: [], scope: [], branch: "main" },
      options: {},
    },
    connectionState: snapshot(state),
  };
}

function lastSyncOp(posted: RpcMessage[], method: string) {
  const op = [...posted]
    .reverse()
    .find((m) => m.k === "sync-op" && m.method === method);
  if (!op || op.k !== "sync-op") {
    throw new Error(`no ${method} sync-op was posted`);
  }
  return op;
}

describe("createSyncManagerProxy", () => {
  it("seeds list() from the list sync-op and rehydrates DriveCollectionId", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );

    const listOp = lastSyncOp(posted, "list");
    deliver({
      k: "res",
      id: listOp.id,
      value: [wireRemote("r1", "remote-a", "drive-1", "connected")],
    });

    await vi.waitFor(() => expect(manager.list()).toHaveLength(1));
    const [remote] = manager.list();
    expect(remote.meta.name).toBe("remote-a");
    expect(
      remote.meta.collectionId.equals(DriveCollectionId.forDrive("drive-1")),
    ).toBe(true);
    // initial connection snapshot seeded from the list reply (late-attach case)
    expect(remote.channel.getConnectionState().state).toBe("connected");
  });

  it("updates connection state from CONNECTION_STATE_CHANGED bus events", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );
    deliver({
      k: "res",
      id: lastSyncOp(posted, "list").id,
      value: [wireRemote("r1", "remote-a", "drive-1", "connecting")],
    });
    await vi.waitFor(() => expect(manager.list()).toHaveLength(1));

    deliver({
      k: "bus-event",
      eventType: SyncEventTypes.CONNECTION_STATE_CHANGED,
      event: {
        remoteName: "remote-a",
        remoteId: "r1",
        previous: "connecting",
        current: "connected",
        snapshot: snapshot("connected"),
      },
    });

    expect(manager.list()[0].channel.getConnectionState().state).toBe(
      "connected",
    );
  });

  it("feeds getSyncStatus from the sync-status bus channel", () => {
    const { transport, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );

    expect(manager.getSyncStatus("doc-1")).toBeUndefined();
    deliver({
      k: "bus-event",
      eventType: SYNC_STATUS_CHANGED_EVENT,
      event: { documentId: "doc-1", status: SyncStatus.Synced },
    });
    expect(manager.getSyncStatus("doc-1")).toBe(SyncStatus.Synced);
  });

  it("add() sends a sync-op with collectionId.key and carries config.url", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );
    deliver({ k: "res", id: lastSyncOp(posted, "list").id, value: [] });
    await vi.waitFor(() => expect(manager.list()).toHaveLength(0));

    const collectionId = DriveCollectionId.forDrive("drive-2");
    const added = manager.add("remote-b", collectionId, {
      type: "gql",
      parameters: { url: "https://sb.example/graphql" },
    });

    const addOp = lastSyncOp(posted, "add");
    expect(addOp.args[1]).toBe(collectionId.key);
    deliver({
      k: "res",
      id: addOp.id,
      value: wireRemote("r2", "remote-b", "drive-2", "connected"),
    });
    await vi.waitFor(() =>
      expect(
        posted.filter((m) => m.k === "sync-op" && m.method === "list"),
      ).toHaveLength(2),
    );
    deliver({
      k: "res",
      id: lastSyncOp(posted, "list").id,
      value: [
        wireRemote(
          "r2",
          "remote-b",
          "drive-2",
          "connected",
          "https://sb.example/graphql",
        ),
      ],
    });

    const remote = await added;
    expect(remote.meta.name).toBe("remote-b");
    const channel = remote.channel as unknown as { config: { url?: string } };
    expect(channel.config.url).toBe("https://sb.example/graphql");
  });

  it("ignores responses addressed to another proxy on the shared transport", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );
    // a reply with a client-proxy id ("c…") must not satisfy the list op
    deliver({
      k: "res",
      id: "c1",
      value: [wireRemote("x", "x", "x", "connected")],
    });
    await Promise.resolve();
    expect(manager.list()).toHaveLength(0);

    deliver({
      k: "res",
      id: lastSyncOp(posted, "list").id,
      value: [wireRemote("r1", "remote-a", "drive-1", "connected")],
    });
    await vi.waitFor(() => expect(manager.list()).toHaveLength(1));
  });

  it("seeds channel.config.url from the list reply for remotes it did not add", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );
    deliver({
      k: "res",
      id: lastSyncOp(posted, "list").id,
      value: [
        wireRemote(
          "r1",
          "remote-a",
          "drive-1",
          "connected",
          "https://sb.example/graphql",
        ),
      ],
    });
    await vi.waitFor(() => expect(manager.list()).toHaveLength(1));
    const channel = manager.list()[0].channel as unknown as {
      config: { url?: string };
    };
    expect(channel.config.url).toBe("https://sb.example/graphql");
  });

  it("onSyncStatusChange fires on bus events and stops after unsubscribe", () => {
    const { transport, deliver } = createFakeTransport();
    const manager = createSyncManagerProxy(
      transport,
      createReactorEventBusProxy(transport),
    );
    const calls: Array<[string, SyncStatus]> = [];
    const unsub = manager.onSyncStatusChange((documentId, status) => {
      calls.push([documentId, status]);
    });

    deliver({
      k: "bus-event",
      eventType: SYNC_STATUS_CHANGED_EVENT,
      event: { documentId: "doc-1", status: SyncStatus.Outgoing },
    });
    expect(calls).toEqual([["doc-1", SyncStatus.Outgoing]]);

    unsub();
    deliver({
      k: "bus-event",
      eventType: SYNC_STATUS_CHANGED_EVENT,
      event: { documentId: "doc-2", status: SyncStatus.Synced },
    });
    expect(calls).toEqual([["doc-1", SyncStatus.Outgoing]]);
  });
});
