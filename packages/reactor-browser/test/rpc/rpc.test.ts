import type {
  DocumentChangeEvent,
  IReactorClient,
  SearchFilter,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it } from "vitest";
import { createReactorClientProxy } from "../../src/rpc/client-proxy.js";
import { ReactorHostServer } from "../../src/rpc/host-server.js";
import { createPortTransport } from "../../src/rpc/transport.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeFakeClient() {
  let subscriber: ((change: DocumentChangeEvent) => void) | undefined;
  const calls: string[] = [];
  const client = {
    calls,
    emit(change: DocumentChangeEvent) {
      subscriber?.(change);
    },
    get(identifier: string, _view?: unknown, signal?: AbortSignal) {
      calls.push(`get:${identifier}`);
      if (identifier === "boom") {
        return Promise.reject(new Error("boom"));
      }
      if (identifier === "hang") {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted by signal")),
            { once: true },
          );
        });
      }
      return Promise.resolve({ id: identifier, name: "doc" });
    },
    resolveIdOrSlug(identifier: string) {
      calls.push(`resolve:${identifier}`);
      return Promise.resolve(`resolved:${identifier}`);
    },
    drives: {
      addFolder(driveId: string, name: string) {
        calls.push(`addFolder:${driveId}/${name}`);
        return Promise.resolve({ id: "node-1", name });
      },
    },
    subscribe(
      search: unknown,
      callback: (change: DocumentChangeEvent) => void,
    ) {
      calls.push(`sub:${JSON.stringify(search)}`);
      subscriber = callback;
      return () => {
        subscriber = undefined;
        calls.push("unsub");
      };
    },
  };
  return client;
}

function setup() {
  const fake = makeFakeClient();
  const channel = new MessageChannel();
  const host = new ReactorHostServer(
    fake as unknown as IReactorClient,
    createPortTransport(channel.port1),
  );
  host.start();
  const proxy = createReactorClientProxy(createPortTransport(channel.port2));
  const close = () => {
    host.stop();
    channel.port1.close();
    channel.port2.close();
  };
  return { fake, proxy, close };
}

describe("reactor RPC proxy <-> host", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("round-trips a method call and its return value", async () => {
    const { proxy, fake, close } = setup();
    cleanup = close;
    const doc = await proxy.get("id-1");
    expect(doc).toEqual({ id: "id-1", name: "doc" });
    expect(fake.calls).toContain("get:id-1");
  });

  it("passes arguments through and returns scalar results", async () => {
    const { proxy, close } = setup();
    cleanup = close;
    const resolved = await proxy.resolveIdOrSlug("slug-a");
    expect(resolved).toBe("resolved:slug-a");
  });

  it("dispatches nested drives.* methods", async () => {
    const { proxy, fake, close } = setup();
    cleanup = close;
    const node = await proxy.drives.addFolder("drive-1", "Folder");
    expect(node).toEqual({ id: "node-1", name: "Folder" });
    expect(fake.calls).toContain("addFolder:drive-1/Folder");
  });

  it("propagates a thrown error with its message", async () => {
    const { proxy, close } = setup();
    cleanup = close;
    await expect(proxy.get("boom")).rejects.toThrow("boom");
  });

  it("delivers subscription events and stops after unsubscribe", async () => {
    const { proxy, fake, close } = setup();
    cleanup = close;
    const received: DocumentChangeEvent[] = [];
    const unsubscribe = proxy.subscribe(
      { type: "todo" } as SearchFilter,
      (change) => received.push(change),
    );
    await tick();

    const change = {
      type: "updated",
      documents: [],
    } as unknown as DocumentChangeEvent;
    fake.emit(change);
    await tick();
    expect(received).toHaveLength(1);

    unsubscribe();
    await tick();
    fake.emit(change);
    await tick();
    expect(received).toHaveLength(1);
    expect(fake.calls).toContain("unsub");
  });

  it("forwards an AbortSignal so the owner can cancel an in-flight call", async () => {
    const { proxy, close } = setup();
    cleanup = close;
    const controller = new AbortController();
    const pending = proxy.get("hang", undefined, controller.signal);
    await tick();
    controller.abort();
    await expect(pending).rejects.toThrow("aborted by signal");
  });

  it("detects a duck-typed AbortSignal from another realm", async () => {
    const { proxy, close } = setup();
    cleanup = close;
    const listeners = new Set<() => void>();
    const foreignSignal = {
      aborted: false,
      addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) =>
        listeners.delete(cb),
      abort() {
        this.aborted = true;
        for (const cb of listeners) cb();
      },
    };
    const pending = proxy.get(
      "hang",
      undefined,
      foreignSignal as unknown as AbortSignal,
    );
    await tick();
    foreignSignal.abort();
    await expect(pending).rejects.toThrow("aborted by signal");
  });

  it("exposes stable method references", () => {
    const { proxy, close } = setup();
    cleanup = close;
    const surface = proxy as unknown as {
      get: unknown;
      drives: { addFolder: unknown };
    };
    expect(surface.get).toBe(surface.get);
    expect(surface.drives.addFolder).toBe(surface.drives.addFolder);
  });

  it("does not leak an unhandled rejection when subscribe throws", async () => {
    const fake = makeFakeClient();
    fake.subscribe = () => {
      throw new Error("bad filter");
    };
    const channel = new MessageChannel();
    const host = new ReactorHostServer(
      fake as unknown as IReactorClient,
      createPortTransport(channel.port1),
    );
    host.start();
    const proxy = createReactorClientProxy(createPortTransport(channel.port2));
    cleanup = () => {
      host.stop();
      channel.port1.close();
      channel.port2.close();
    };
    const unsubscribe = proxy.subscribe(
      { type: "todo" } as SearchFilter,
      () => undefined,
    );
    await tick();
    expect(typeof unsubscribe).toBe("function");
  });
});
