import type { IReactorClient, RemoteFilter } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  sendAdoptSyncPeer,
  sendRemoveSyncPeer,
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

/**
 * Two transports wired to each other, so a real `MessageRouter` request made on
 * the client side is answered by a real `ReactorHost` on the other.
 */
function linkedTransports(): {
  hostTransport: IRpcTransport;
  clientTransport: IRpcTransport;
} {
  let toHost: ((message: RpcMessage) => void) | undefined;
  let toClient: ((message: RpcMessage) => void) | undefined;
  const hostTransport: IRpcTransport = {
    post(message) {
      queueMicrotask(() => toClient?.(message));
    },
    onMessage(l) {
      toHost = l;
      return () => {
        toHost = undefined;
      };
    },
    close() {},
  };
  const clientTransport: IRpcTransport = {
    post(message) {
      queueMicrotask(() => toHost?.(message));
    },
    onMessage(l) {
      toClient = l;
      return () => {
        toClient = undefined;
      };
    },
    close() {},
  };
  return { hostTransport, clientTransport };
}

/** A MessagePort stand-in whose `close` is observable. */
function fakePort(): { port: MessagePort; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  return { port: { close } as unknown as MessagePort, close };
}

function adoptMessage(id: string, port: MessagePort): RpcMessage {
  return {
    k: "adopt-sync-peer",
    id,
    peerId: PARAMS.peerId,
    channelName: PARAMS.channelName,
    collectionIdKey: PARAMS.collectionIdKey,
    remoteName: PARAMS.remoteName,
    filter: FILTER,
    port,
  };
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

  // The port has already been MOVED into this realm, so the sender cannot
  // close it. Every failing exit has to, or a live MessagePort leaks and the
  // far end waits forever on a reader that was never created.
  it("closes the transferred port when no adopt handler is wired", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
    });
    const { transport, sent, receive } = injectableTransport();
    const dispose = host.connect(transport);
    const port = fakePort();

    receive(adoptMessage("a2", port.port));

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].k).toBe("err");
    expect(port.close).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("closes the transferred port when the adopt handler throws", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onAdoptSyncPeer: () => Promise.reject(new Error("no local sync module")),
    });
    const { transport, sent, receive } = injectableTransport();
    const dispose = host.connect(transport);
    const port = fakePort();

    receive(adoptMessage("a3", port.port));

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].k).toBe("err");
    expect(port.close).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("leaves the port open when the adopt succeeds", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onAdoptSyncPeer: () => Promise.resolve(),
    });
    const { transport, sent, receive } = injectableTransport();
    const dispose = host.connect(transport);
    const port = fakePort();

    receive(adoptMessage("a4", port.port));

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ k: "res", id: "a4", value: { ok: true } });
    expect(port.close).not.toHaveBeenCalled();
    dispose();
  });
});

describe("remove-sync-peer round trip", () => {
  it("carries the remote name and the registry key to the worker handler", async () => {
    const onRemoveSyncPeer = vi.fn(() => Promise.resolve());
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onRemoveSyncPeer,
    });
    const { hostTransport, clientTransport } = linkedTransports();
    const dispose = host.connect(hostTransport);
    const router = new MessageRouter();
    router.attach(clientTransport);

    await sendRemoveSyncPeer(router, {
      peerId: PARAMS.peerId,
      channelName: PARAMS.channelName,
      remoteName: PARAMS.remoteName,
    });

    expect(onRemoveSyncPeer).toHaveBeenCalledWith({
      peerId: PARAMS.peerId,
      channelName: PARAMS.channelName,
      remoteName: PARAMS.remoteName,
    });
    router.detach();
    dispose();
  });

  it("rejects the caller when the worker has no remove handler", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
    });
    const { hostTransport, clientTransport } = linkedTransports();
    const dispose = host.connect(hostTransport);
    const router = new MessageRouter();
    router.attach(clientTransport);

    await expect(
      sendRemoveSyncPeer(router, {
        peerId: PARAMS.peerId,
        channelName: PARAMS.channelName,
        remoteName: PARAMS.remoteName,
      }),
    ).rejects.toThrow(/no remove-sync-peer handler/);

    router.detach();
    dispose();
  });

  it("surfaces the worker handler's failure to the caller", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve({} as IReactorClient),
      onRemoveSyncPeer: () =>
        Promise.reject(new Error("Remote with name 'x' does not exist")),
    });
    const { hostTransport, clientTransport } = linkedTransports();
    const dispose = host.connect(hostTransport);
    const router = new MessageRouter();
    router.attach(clientTransport);

    await expect(
      sendRemoveSyncPeer(router, {
        peerId: PARAMS.peerId,
        channelName: PARAMS.channelName,
        remoteName: PARAMS.remoteName,
      }),
    ).rejects.toThrow(/does not exist/);

    router.detach();
    dispose();
  });
});
