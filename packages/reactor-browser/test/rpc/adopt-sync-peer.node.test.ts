import type { IReactorClient, RemoteFilter } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  sendAdoptSyncPeer,
  type AdoptSyncPeerParams,
} from "../../src/rpc/adopt-sync-peer.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import type { IRpcTransport } from "../../src/rpc/transport.js";
import type { OwnerMessage, RpcMessage } from "../../src/rpc/protocol.js";

const FILTER: RemoteFilter = { documentId: [], scope: [], branch: "main" };

const PARAMS: AdoptSyncPeerParams = {
  peerId: "reactor-b",
  channelName: "drive-1:main",
  collectionIdKey: "drive-1:main",
  remoteName: "local:reactor-b:drive-1:main",
  filter: FILTER,
};

/** Records posts (message + transfer list) and auto-acks the adopt request. */
function recordingTransport(): {
  transport: IRpcTransport;
  posts: Array<{ message: RpcMessage; transfer?: Transferable[] }>;
} {
  let listener: ((message: RpcMessage) => void) | undefined;
  const posts: Array<{ message: RpcMessage; transfer?: Transferable[] }> = [];
  const transport: IRpcTransport = {
    post(message, transfer) {
      posts.push({ message, transfer });
      if ((message as { k: string }).k === "adopt-sync-peer") {
        const id = (message as { id: string }).id;
        queueMicrotask(() => listener?.({ k: "res", id, value: { ok: true } }));
      }
    },
    onMessage(l) {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    close() {},
  };
  return { transport, posts };
}

/** A transport whose `receive` injects an inbound message into the host. */
function injectableTransport(): {
  transport: IRpcTransport;
  sent: OwnerMessage[];
  receive: (message: RpcMessage) => void;
} {
  let listener: ((message: RpcMessage) => void) | undefined;
  const sent: OwnerMessage[] = [];
  const transport: IRpcTransport = {
    post(message) {
      sent.push(message as OwnerMessage);
    },
    onMessage(l) {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    close() {},
  };
  return { transport, sent, receive: (message) => listener?.(message) };
}

describe("sendAdoptSyncPeer", () => {
  it("posts the op with the port in the transfer list, not cloned into the body", async () => {
    const { transport, posts } = recordingTransport();
    const router = new MessageRouter();
    router.attach(transport);
    const port = { tag: "port" } as unknown as MessagePort;

    await sendAdoptSyncPeer(router, PARAMS, port);

    expect(posts).toHaveLength(1);
    const { message, transfer } = posts[0];
    expect(message).toMatchObject({
      k: "adopt-sync-peer",
      peerId: "reactor-b",
      channelName: "drive-1:main",
      collectionIdKey: "drive-1:main",
      remoteName: "local:reactor-b:drive-1:main",
      filter: FILTER,
      port,
    });
    // The live port is transferred (moved), never left to be structured-cloned.
    expect(transfer).toEqual([port]);
  });
});

describe("ReactorHost adopt-sync-peer routing", () => {
  it("hands the handler the params and the transferred port, then replies ok", async () => {
    const onAdoptSyncPeer = vi.fn(() => Promise.resolve());
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onAdoptSyncPeer,
    });
    const { transport, sent, receive } = injectableTransport();
    const dispose = host.connect(transport);
    const port = { tag: "transferred" } as unknown as MessagePort;

    receive({
      k: "adopt-sync-peer",
      id: "a1",
      peerId: PARAMS.peerId,
      channelName: PARAMS.channelName,
      collectionIdKey: PARAMS.collectionIdKey,
      remoteName: PARAMS.remoteName,
      filter: FILTER,
      port,
    });

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(onAdoptSyncPeer).toHaveBeenCalledWith(PARAMS, port);
    expect(sent[0]).toEqual({ k: "res", id: "a1", value: { ok: true } });
    dispose();
  });

  it("replies err when no adopt handler is wired", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
    });
    const { transport, sent, receive } = injectableTransport();
    const dispose = host.connect(transport);

    receive({
      k: "adopt-sync-peer",
      id: "a2",
      peerId: PARAMS.peerId,
      channelName: PARAMS.channelName,
      collectionIdKey: PARAMS.collectionIdKey,
      remoteName: PARAMS.remoteName,
      filter: FILTER,
      port: {} as unknown as MessagePort,
    });

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].k).toBe("err");
    dispose();
  });
});
