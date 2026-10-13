import {
  DriveCollectionId,
  type IReactorClient,
  type LocalPeerSyncManager,
  type Remote,
} from "@powerhousedao/reactor";
import {
  createPortTransport,
  createReactorEventBusProxy,
  MessageRouter,
  ReactorHost,
  SyncManagerProxy,
  type IRpcTransport,
  type OwnerMessage,
  type RpcMessage,
} from "@powerhousedao/reactor-browser/rpc";
import { ConsoleLogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { createWorkerLocalPeers } from "../../src/utils/worker-local-peers.js";

const VERSION = { appBuildId: "b", rpcProtocolVersion: 1, models: [] };

function injectableTransport() {
  let listener: ((message: RpcMessage) => void) | undefined;
  const sent: OwnerMessage[] = [];
  const transport: IRpcTransport = {
    post: (message) => {
      sent.push(message as OwnerMessage);
    },
    onMessage: (l) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    close: () => {},
  };
  const reply = async (id: string) => {
    await vi.waitFor(() => {
      const found = sent.find(
        (m) => (m as { id?: string }).id === id && m.k !== "reload",
      );
      if (!found) throw new Error(`no reply to ${id}`);
    });
    return sent.find((m) => (m as { id?: string }).id === id)!;
  };
  return {
    transport,
    reply,
    receive: (message: RpcMessage) => listener?.(message),
  };
}

function fakePort() {
  return {
    postMessage: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    start: vi.fn(),
  };
}

function syncManager(): LocalPeerSyncManager {
  const remotes: Remote[] = [];
  return {
    list: () => remotes,
    add: (
      name: string,
      collectionId: DriveCollectionId,
      channelConfig: unknown,
      filter: unknown,
    ) => {
      const remote = {
        meta: { id: name, name, collectionId, channelConfig, filter },
        channel: { getConnectionState: () => ({ state: "connected" }) },
      } as unknown as Remote;
      remotes.push(remote);
      return Promise.resolve(remote);
    },
    remove: (name: string) => {
      const index = remotes.findIndex((r) => r.meta.name === name);
      if (index >= 0) remotes.splice(index, 1);
      return Promise.resolve();
    },
  } as unknown as LocalPeerSyncManager;
}

function adopt(id: string, peerId: string, port: unknown): RpcMessage {
  return {
    k: "adopt-sync-peer",
    id,
    peerId,
    channelName: "drive-1:main",
    collectionIdKey: DriveCollectionId.forDrive("drive1").key,
    remoteName: `local:${peerId}`,
    filter: { documentId: [], scope: [], branch: "main" },
    port: port as MessagePort,
  };
}

function hello(multiReactor: boolean): RpcMessage {
  return {
    k: "hello",
    id: "h",
    version: VERSION,
    construct: { multiReactor },
  } as RpcMessage;
}

function workerHost(
  options: { built?: () => Promise<void>; attaches?: boolean } = {},
) {
  const peers = createWorkerLocalPeers(new ConsoleLogger(["test"]));
  const manager = syncManager();
  const retired = vi.fn(() => Promise.resolve());
  const host = new ReactorHost({
    build: async (construct) => {
      const multiReactor =
        (construct as { multiReactor?: boolean } | undefined)?.multiReactor ??
        false;
      peers.serve(multiReactor);
      await options.built?.();
      if (multiReactor) {
        peers.createChannelFactory();
        if (options.attaches ?? true) {
          peers.attach(manager);
        }
      }
      return {} as IReactorClient;
    },
    get onAdoptSyncPeer() {
      return peers.adoptHandler();
    },
    get onRemoveSyncPeer() {
      return peers.removeHandler();
    },
    onRetire: peers.retiring(retired),
    onSyncOp: (method) => {
      if (method !== "list") return Promise.resolve(undefined);
      return Promise.resolve(
        manager.list().map((remote) => ({
          meta: remote.meta,
          connectionState: remote.channel.getConnectionState(),
        })),
      );
    },
  });
  const tab = injectableTransport();
  host.connect(tab.transport);
  return { host, tab, retired };
}

function connectTab(host: ReactorHost) {
  const channel = new MessageChannel();
  const dispose = host.connectPort(channel.port1);
  const router = new MessageRouter();
  router.attach(createPortTransport(channel.port2));
  const proxy = new SyncManagerProxy(
    router,
    createReactorEventBusProxy(router),
  );
  return {
    proxy,
    close: () => {
      dispose();
      channel.port1.close();
      channel.port2.close();
    },
  };
}

describe("worker local sync peers", () => {
  it("lists a peer another client adopts, and drops it on remove", async () => {
    const { host, tab: broker } = workerHost();
    broker.receive(hello(true));
    await broker.reply("h");
    const connect = connectTab(host);
    try {
      await connect.proxy.startup();
      const names = () => connect.proxy.list().map((r) => r.meta.name);
      expect(names()).toEqual([]);

      broker.receive(adopt("a", "reactor-a", fakePort()));
      expect(await broker.reply("a")).toMatchObject({ k: "res" });
      await vi.waitFor(() => expect(names()).toEqual(["local:reactor-a"]));

      broker.receive({
        k: "remove-sync-peer",
        id: "r",
        peerId: "reactor-a",
        channelName: "drive-1:main",
        remoteName: "local:reactor-a",
      } as RpcMessage);
      expect(await broker.reply("r")).toMatchObject({ k: "res" });
      await vi.waitFor(() => expect(names()).toEqual([]));
    } finally {
      connect.close();
    }
  });

  it("closes every adopted port when the host retires", async () => {
    const { host, tab, retired } = workerHost();
    tab.receive(hello(true));
    await tab.reply("h");
    const a = fakePort();
    const b = fakePort();
    tab.receive(adopt("a", "reactor-a", a));
    tab.receive(adopt("b", "reactor-b", b));
    expect(await tab.reply("a")).toMatchObject({ k: "res" });
    expect(await tab.reply("b")).toMatchObject({ k: "res" });
    expect(a.close).not.toHaveBeenCalled();

    host.retireAndReload("deploy", "gen-2");

    await vi.waitFor(() => expect(retired).toHaveBeenCalled());
    await vi.waitFor(() => {
      expect(a.close).toHaveBeenCalledTimes(1);
      expect(b.close).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses an adopt and closes its port with the flag off", async () => {
    const { tab } = workerHost();
    tab.receive(hello(false));
    await tab.reply("h");
    const port = fakePort();
    tab.receive(adopt("a", "reactor-a", port));

    expect(await tab.reply("a")).toMatchObject({
      k: "err",
      error: { message: "ReactorHost has no adopt-sync-peer handler" },
    });
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("refuses adopt and remove at once with the flag off while the build runs", async () => {
    const { tab } = workerHost({ built: () => new Promise(() => {}) });
    tab.receive(hello(false));
    const port = fakePort();
    tab.receive(adopt("a", "reactor-a", port));
    tab.receive({
      k: "remove-sync-peer",
      id: "r",
      peerId: "reactor-a",
      channelName: "drive-1:main",
      remoteName: "local:reactor-a",
    } as RpcMessage);

    expect(port.close).toHaveBeenCalledTimes(1);
    expect(await tab.reply("a")).toMatchObject({
      k: "err",
      error: { message: "ReactorHost has no adopt-sync-peer handler" },
    });
    expect(await tab.reply("r")).toMatchObject({
      k: "err",
      error: { message: "ReactorHost has no remove-sync-peer handler" },
    });
  });

  it("holds an adopt until a flag-on build is ready", async () => {
    let finish = () => {};
    const { tab } = workerHost({
      built: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    tab.receive(hello(true));
    const port = fakePort();
    tab.receive(adopt("a", "reactor-a", port));
    await Promise.resolve();
    expect(port.close).not.toHaveBeenCalled();

    finish();

    expect(await tab.reply("a")).toMatchObject({ k: "res" });
    expect(port.close).not.toHaveBeenCalled();
  });

  it("says the reactor is not ready when a flag-on build attached no peers", async () => {
    const { tab } = workerHost({ attaches: false });
    tab.receive(hello(true));
    await tab.reply("h");
    const port = fakePort();
    tab.receive(adopt("a", "reactor-a", port));

    expect(await tab.reply("a")).toMatchObject({
      k: "err",
      error: { message: "The reactor is not ready for local sync peers" },
    });
    expect(port.close).toHaveBeenCalledTimes(1);
  });
});
