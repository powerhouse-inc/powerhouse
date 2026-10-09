import {
  DriveCollectionId,
  type IReactorClient,
  type LocalPeerSyncManager,
  type Remote,
} from "@powerhousedao/reactor";
import {
  ReactorHost,
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
    add: (name: string) => {
      const remote = { meta: { name } } as unknown as Remote;
      remotes.push(remote);
      return Promise.resolve(remote);
    },
    remove: () => Promise.resolve(),
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

function workerHost(multiReactor: boolean) {
  const peers = createWorkerLocalPeers(new ConsoleLogger(["test"]));
  const retired = vi.fn(() => Promise.resolve());
  const host = new ReactorHost({
    build: () => {
      if (multiReactor) {
        peers.createChannelFactory();
        peers.attach(syncManager());
      }
      return Promise.resolve({} as IReactorClient);
    },
    onAdoptSyncPeer: peers.onAdoptSyncPeer,
    onRemoveSyncPeer: peers.onRemoveSyncPeer,
    onRetire: peers.retiring(retired),
  });
  const tab = injectableTransport();
  host.connect(tab.transport);
  return { host, tab, retired };
}

describe("worker local sync peers", () => {
  it("closes every adopted port when the host retires", async () => {
    const { host, tab, retired } = workerHost(true);
    tab.receive({ k: "hello", id: "h", version: VERSION } as RpcMessage);
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
    const { tab } = workerHost(false);
    tab.receive({ k: "hello", id: "h", version: VERSION } as RpcMessage);
    await tab.reply("h");
    const port = fakePort();
    tab.receive(adopt("a", "reactor-a", port));

    expect(await tab.reply("a")).toMatchObject({
      k: "err",
      error: { message: "ReactorHost has no adopt-sync-peer handler" },
    });
    expect(port.close).toHaveBeenCalledTimes(1);
  });
});
