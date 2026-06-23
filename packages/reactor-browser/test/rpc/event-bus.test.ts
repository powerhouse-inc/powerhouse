import type { IReactorClient } from "@powerhousedao/reactor";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import { createPortTransport } from "../../src/rpc/transport.js";

const CONNECTION_STATE_CHANGED = 20005;
const SYNC_PENDING = 20001;
const JOB_PENDING = 10001;

function fakeClient(): IReactorClient {
  return {} as unknown as IReactorClient;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

describe("distributed EventBus (worker -> tabs)", () => {
  let host: ReactorHost;
  const channels: MessageChannel[] = [];
  const disposers: Array<() => void> = [];

  function connectTab() {
    const channel = new MessageChannel();
    channels.push(channel);
    disposers.push(host.connect(createPortTransport(channel.port1)));
    return createReactorEventBusProxy(createPortTransport(channel.port2));
  }

  beforeEach(() => {
    host = new ReactorHost({ client: fakeClient() });
  });

  afterEach(() => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
    channels.length = 0;
  });

  it("fans out a bus event to all connected tabs", async () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    connectTab().subscribe(CONNECTION_STATE_CHANGED, (_type, e) => {
      a.push(e);
    });
    connectTab().subscribe(CONNECTION_STATE_CHANGED, (_type, e) => {
      b.push(e);
    });
    const snapshot = { remoteName: "r1", current: "connected" };
    host.broadcastBusEvent(CONNECTION_STATE_CHANGED, snapshot);
    await tick();
    expect(a).toEqual([snapshot]);
    expect(b).toEqual([snapshot]);
  });

  it("dispatches only to listeners for the matching event type", async () => {
    const seen: number[] = [];
    const proxy = connectTab();
    proxy.subscribe(CONNECTION_STATE_CHANGED, () => {
      seen.push(CONNECTION_STATE_CHANGED);
    });
    proxy.subscribe(SYNC_PENDING, () => {
      seen.push(SYNC_PENDING);
    });
    host.broadcastBusEvent(CONNECTION_STATE_CHANGED, {});
    await tick();
    expect(seen).toEqual([CONNECTION_STATE_CHANGED]);
  });

  it("stops delivering after unsubscribe", async () => {
    const seen: unknown[] = [];
    const off = connectTab().subscribe(CONNECTION_STATE_CHANGED, (_type, e) => {
      seen.push(e);
    });
    off();
    host.broadcastBusEvent(CONNECTION_STATE_CHANGED, { x: 1 });
    await tick();
    expect(seen).toEqual([]);
  });

  it("does not deliver to a disconnected tab", async () => {
    const seen: unknown[] = [];
    const channel = new MessageChannel();
    channels.push(channel);
    const dispose = host.connect(createPortTransport(channel.port1));
    createReactorEventBusProxy(createPortTransport(channel.port2)).subscribe(
      CONNECTION_STATE_CHANGED,
      (_type, e) => {
        seen.push(e);
      },
    );
    dispose();
    host.broadcastBusEvent(CONNECTION_STATE_CHANGED, { x: 1 });
    await tick();
    expect(seen).toEqual([]);
  });

  it("throws when subscribing to an event the worker does not forward", () => {
    const proxy = connectTab();
    expect(() => proxy.subscribe(JOB_PENDING, () => {})).toThrow();
  });
});
