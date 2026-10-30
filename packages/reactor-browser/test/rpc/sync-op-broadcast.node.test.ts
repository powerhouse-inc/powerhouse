import { DriveCollectionId, type IReactorClient } from "@powerhousedao/reactor";
import {
  MessageRouter,
  type IRpcTransport,
  type RpcMessage,
} from "@powerhousedao/reactor/rpc";
import { describe, expect, it, vi } from "vitest";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import {
  createSyncManagerProxy,
  SYNC_REMOTES_CHANGED_EVENT,
} from "../../src/rpc/sync-manager-proxy.js";

type WireRemote = {
  meta: Record<string, unknown>;
  connectionState: Record<string, unknown>;
};

function wireRemote(name: string, driveId: string): WireRemote {
  return {
    meta: {
      id: name,
      name,
      collectionId: { driveId, branch: "main" },
      channelConfig: { type: "gql", parameters: { url: "http://sb/graphql" } },
      filter: { documentId: [], scope: [], branch: "main" },
      options: {},
    },
    connectionState: {
      state: "connected",
      failureCount: 0,
      lastSuccessUtcMs: 0,
      lastFailureUtcMs: 0,
      pushBlocked: false,
      pushFailureCount: 0,
      receivingPages: false,
      requiresAuth: false,
    },
  };
}

/** A worker-side sync manager reduced to its remote list. */
function workerSync() {
  const remotes: WireRemote[] = [];
  return vi.fn((method: string, args: unknown[]) => {
    if (method === "list") return Promise.resolve([...remotes]);
    if (method === "add") {
      const [name, key] = args as [string, string];
      remotes.push(wireRemote(name, key.split(":")[0]));
      return Promise.resolve(undefined);
    }
    if (method === "remove") {
      const index = remotes.findIndex((r) => r.meta.name === args[0]);
      if (index < 0) return Promise.reject(new Error("unknown remote"));
      remotes.splice(index, 1);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(undefined);
  });
}

/** A tab connected to `host` through a pair of in-memory transports. */
function connectTab(host: ReactorHost) {
  const toTab = new Set<(m: RpcMessage) => void>();
  const toHost = new Set<(m: RpcMessage) => void>();
  const pair = (
    inbound: Set<(m: RpcMessage) => void>,
    outbound: Set<(m: RpcMessage) => void>,
  ): IRpcTransport => ({
    post: (message) => {
      queueMicrotask(() => {
        for (const listener of [...outbound]) listener(message);
      });
    },
    onMessage: (listener) => {
      inbound.add(listener);
      return () => inbound.delete(listener);
    },
    close: () => {},
  });
  const tabSide = pair(toTab, toHost);
  const busEvents: unknown[] = [];
  tabSide.onMessage((message) => {
    if (message.k === "bus-event") busEvents.push(message.eventType);
  });
  const dispose = host.connect(pair(toHost, toTab));
  const router = new MessageRouter();
  router.attach(tabSide);
  const sync = createSyncManagerProxy(
    router,
    createReactorEventBusProxy(router),
  );
  return { sync, busEvents, dispose };
}

describe("sync remotes added or removed in one tab", () => {
  it("reach every other tab's list", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onSyncOp: workerSync(),
    });
    const a = connectTab(host);
    const b = connectTab(host);
    await a.sync.startup();
    await b.sync.startup();

    await a.sync.add("sb-drive-1", DriveCollectionId.forDrive("drive-1"), {
      type: "gql",
      parameters: { url: "http://sb/graphql" },
    });
    await vi.waitFor(() =>
      expect(b.sync.list().map((r) => r.meta.name)).toEqual(["sb-drive-1"]),
    );

    await b.sync.remove("sb-drive-1");
    await vi.waitFor(() => expect(a.sync.list()).toEqual([]));
    a.dispose();
    b.dispose();
  });

  it("are not announced for other sync ops, or for a failed remove", async () => {
    const onSyncOp = workerSync();
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onSyncOp,
    });
    const a = connectTab(host);
    const b = connectTab(host);
    await a.sync.startup();
    await b.sync.startup();

    a.sync.triggerPull("anything");
    await expect(a.sync.remove("missing")).rejects.toThrow("unknown remote");
    await vi.waitFor(() =>
      expect(onSyncOp).toHaveBeenCalledWith("triggerPull", ["anything"]),
    );
    expect(b.busEvents).not.toContain(SYNC_REMOTES_CHANGED_EVENT);
    a.dispose();
    b.dispose();
  });
});
