import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { createRelationalPgliteProxy } from "../../src/rpc/relational-db-proxy.js";
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

describe("relational PGlite proxy", () => {
  it("query() forwards a SELECT over db-op and returns { rows }", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onDbOp: (method, args) => {
        calls.push([method, args]);
        return Promise.resolve([{ n: 1 }]);
      },
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const pg = createRelationalPgliteProxy(tabRouter(ch.port2));

    const result = await pg.query("select 1 as n", []);
    expect(result).toEqual({ rows: [{ n: 1 }] });
    expect(calls).toEqual([["query", ["select 1 as n", []]]]);
  });

  it("live.query() streams results and resolves with an unsubscribe", async () => {
    const source = fakeLiveSource();
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onLiveQuery: source.onLiveQuery,
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const pg = createRelationalPgliteProxy(tabRouter(ch.port2));

    const received: unknown[] = [];
    const handlePromise = pg.live.query("select 1", [], (r) =>
      received.push(r),
    );
    await waitFor(() => source.subs.length >= 1);
    source.emit({ rows: [{ n: 1 }] });

    const handle = await handlePromise;
    await waitFor(() => received.length >= 1);
    expect(received).toEqual([{ rows: [{ n: 1 }] }]);

    void handle.unsubscribe();
    await waitFor(() => source.subs[0]?.unsubscribed === true);
    expect(source.subs[0]?.unsubscribed).toBe(true);
  });

  it("live.query() rejects when the worker reports a subscribe error", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient()),
      onLiveQuery: () => Promise.reject(new Error("relation does not exist")),
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const pg = createRelationalPgliteProxy(tabRouter(ch.port2));

    await expect(pg.live.query("select 1", [])).rejects.toThrow(
      /relation does not exist/,
    );
  });
});
