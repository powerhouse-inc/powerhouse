import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { createLiveQueryProxy } from "../../src/rpc/live-query-proxy.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import { createPortTransport } from "../../src/rpc/transport.js";

function tabRouter(port: MessagePort): MessageRouter {
  const router = new MessageRouter();
  router.attach(createPortTransport(port));
  return router;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !predicate(); i++) {
    await tick();
  }
}

function fakeClient(): IReactorClient {
  return {} as unknown as IReactorClient;
}

type FakeSub = { onResults: (results: unknown) => void; unsubscribed: boolean };

function fakeLiveSource() {
  const subs: FakeSub[] = [];
  const onLiveQuery = (
    _sql: string,
    _params: unknown[],
    onResults: (results: unknown) => void,
  ) => {
    const sub: FakeSub = { onResults, unsubscribed: false };
    subs.push(sub);
    return Promise.resolve(() => {
      sub.unsubscribed = true;
    });
  };
  const emit = (results: unknown) => {
    for (const sub of subs) {
      if (!sub.unsubscribed) sub.onResults(results);
    }
  };
  return { onLiveQuery, subs, emit };
}

describe("live-query bridge over postMessage", () => {
  it("streams the initial result and every update to the tab", async () => {
    const source = fakeLiveSource();
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onLiveQuery: source.onLiveQuery,
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const proxy = createLiveQueryProxy(tabRouter(ch.port2));

    const received: unknown[] = [];
    proxy.query("select 1", [], (r) => received.push(r));
    await waitFor(() => source.subs.length >= 1);

    source.emit({ rows: [{ n: 1 }] });
    source.emit({ rows: [{ n: 2 }] });
    await waitFor(() => received.length >= 2);

    expect(received).toEqual([{ rows: [{ n: 1 }] }, { rows: [{ n: 2 }] }]);
  });

  it("unsubscribes the worker handle and stops delivering after teardown", async () => {
    const source = fakeLiveSource();
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onLiveQuery: source.onLiveQuery,
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const proxy = createLiveQueryProxy(tabRouter(ch.port2));

    const received: unknown[] = [];
    const unsubscribe = proxy.query("select 1", [], (r) => received.push(r));
    await waitFor(() => source.subs.length >= 1);
    source.emit({ rows: [{ n: 1 }] });
    await waitFor(() => received.length >= 1);

    unsubscribe();
    await waitFor(() => source.subs[0]?.unsubscribed === true);
    expect(source.subs[0]?.unsubscribed).toBe(true);

    source.emit({ rows: [{ n: 2 }] });
    await tick();
    expect(received).toEqual([{ rows: [{ n: 1 }] }]);
  });

  it("tears down a tab's live subscriptions when its transport disconnects", async () => {
    const source = fakeLiveSource();
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onLiveQuery: source.onLiveQuery,
    });
    const ch = new MessageChannel();
    const dispose = host.connect(createPortTransport(ch.port1));
    const proxy = createLiveQueryProxy(tabRouter(ch.port2));

    proxy.query("select 1", [], () => undefined);
    await waitFor(() => source.subs.length >= 1);

    dispose();
    expect(source.subs[0]?.unsubscribed).toBe(true);
  });

  it("reports a subscribe failure to onError", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onLiveQuery: () => Promise.reject(new Error("relation does not exist")),
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const proxy = createLiveQueryProxy(tabRouter(ch.port2));

    const error = await new Promise<unknown>((resolve) => {
      proxy.query(
        "select 1",
        [],
        () => undefined,
        (e) => resolve(e),
      );
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/relation does not exist/);
  });

  it("errors a sub-live when no live-query handler is configured", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const proxy = createLiveQueryProxy(tabRouter(ch.port2));

    const error = await new Promise<unknown>((resolve) => {
      proxy.query(
        "select 1",
        [],
        () => undefined,
        (e) => resolve(e),
      );
    });
    expect((error as Error).message).toMatch(/no live-query handler/);
  });
});
