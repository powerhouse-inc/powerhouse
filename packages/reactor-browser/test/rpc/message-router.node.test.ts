import { describe, expect, it } from "vitest";
import { createWorkerAdminClient } from "../../src/rpc/admin-client.js";
import { createReactorClientProxy } from "../../src/rpc/client-proxy.js";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import { createInspectorProxy } from "../../src/rpc/inspector-proxy.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import type {
  ClientMessage,
  OwnerMessage,
  RpcMessage,
} from "../../src/rpc/protocol.js";
import { createRelationalPgliteProxy } from "../../src/rpc/relational-db-proxy.js";
import { createSyncManagerProxy } from "../../src/rpc/sync-manager-proxy.js";
import type { IRpcTransport } from "../../src/rpc/transport.js";

function createFakeTransport() {
  const listeners = new Set<(m: RpcMessage) => void>();
  const posted: ClientMessage[] = [];
  const transport: IRpcTransport = {
    post: (m) => {
      posted.push(m as ClientMessage);
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
    for (const l of [...listeners]) l(m);
  };
  return { transport, posted, deliver };
}

function lastId(posted: ClientMessage[]): string {
  const m = posted.at(-1);
  if (!m || !("id" in m)) throw new Error("no id-bearing message posted");
  return m.id;
}

describe("MessageRouter", () => {
  it("routes each kind to its single owner", () => {
    const { transport, deliver } = createFakeTransport();
    const router = new MessageRouter();
    router.attach(transport);

    const events: string[] = [];
    router.on("event", (m) => events.push(`event:${m.id}`));
    router.on("sub-err", (m) => events.push(`sub-err:${m.id}`));
    router.on("live-err", (m) => events.push(`live-err:${m.id}`));
    router.on("bus-event", (m) => events.push(`bus:${m.eventType}`));

    deliver({ k: "event", id: "sub1", change: {} });
    deliver({
      k: "sub-err",
      id: "sub2",
      error: { name: "E", message: "x" },
    });
    deliver({
      k: "live-err",
      id: "live1",
      error: { name: "E", message: "x" },
    });
    deliver({ k: "bus-event", eventType: 20005, event: {} });

    expect(events).toEqual([
      "event:sub1",
      "sub-err:sub2",
      "live-err:live1",
      "bus:20005",
    ]);
  });

  it("throws on a second owner for a kind", () => {
    const router = new MessageRouter();
    router.on("event", () => {});
    expect(() => router.on("event", () => {})).toThrow(/already has a handler/);
  });

  it("reserves res/err for the built-in correlator", () => {
    const router = new MessageRouter();
    expect(() => router.on("res", () => {})).toThrow();
    expect(() => router.on("err", () => {})).toThrow();
  });

  it("settles a request via the composed correlator", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const router = new MessageRouter();
    router.attach(transport);

    const promise = router.request((id) => ({
      k: "req",
      id,
      method: "get",
      args: [],
    }));
    deliver({ k: "res", id: lastId(posted), value: 7 });
    expect(await promise).toBe(7);
  });

  it("hosts every RPC consumer on one router without a kind collision", () => {
    // Mirrors the real wiring in reactor-worker-client.ts: a single router
    // shared by all proxies. A duplicate kind owner would throw here.
    const { transport } = createFakeTransport();
    const router = new MessageRouter();
    router.attach(transport);
    expect(() => {
      const bus = createReactorEventBusProxy(router);
      createReactorClientProxy(router);
      createInspectorProxy(router);
      createRelationalPgliteProxy(router);
      createWorkerAdminClient(router);
      createSyncManagerProxy(router, bus);
    }).not.toThrow();
  });

  it("stops routing to the old transport after attach swaps it", () => {
    const a = createFakeTransport();
    const b = createFakeTransport();
    const router = new MessageRouter();
    router.attach(a.transport);

    const seen: string[] = [];
    router.on("reload", (m) => seen.push(m.reason));

    a.deliver({ k: "reload", reason: "first" });
    router.attach(b.transport);
    a.deliver({ k: "reload", reason: "stale" }); // old transport detached
    b.deliver({ k: "reload", reason: "second" });

    expect(seen).toEqual(["first", "second"]);
  });
});
