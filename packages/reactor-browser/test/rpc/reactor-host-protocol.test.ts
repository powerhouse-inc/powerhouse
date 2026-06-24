import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { postReactorIdentity } from "../../src/rpc/connect-reactor.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import type {
  ReactorIdentity,
  VersionFingerprint,
} from "../../src/rpc/protocol.js";
import { createPortTransport } from "../../src/rpc/transport.js";

const V1: VersionFingerprint = {
  appBuildId: "build-1",
  rpcProtocolVersion: 1,
  models: [],
};
const V2: VersionFingerprint = {
  appBuildId: "build-2",
  rpcProtocolVersion: 1,
  models: [],
};

function rawTab(port: MessagePort) {
  let counter = 0;
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();
  const reloads: string[] = [];
  port.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      k: string;
      id?: string;
      value?: unknown;
      error?: { message: string };
      reason?: string;
    };
    if (msg.k === "res" && msg.id) {
      pending.get(msg.id)?.resolve(msg.value);
    } else if (msg.k === "err" && msg.id) {
      pending.get(msg.id)?.reject(new Error(msg.error?.message));
    } else if (msg.k === "reload") {
      reloads.push(msg.reason ?? "");
    }
  };
  const send = (msg: Record<string, unknown>): Promise<unknown> => {
    const id = `t${++counter}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    port.postMessage({ ...msg, id });
    return promise;
  };
  return { send, reloads };
}

function fakeClient(calls: string[]): IReactorClient {
  return {
    get: (id: string) => {
      calls.push(`get:${id}`);
      return Promise.resolve({ header: { id } });
    },
  } as unknown as IReactorClient;
}

describe("ReactorHost protocol (hello / version / register)", () => {
  it("builds the reactor lazily on the first hello and shares it", async () => {
    let builds = 0;
    const calls: string[] = [];
    const host = new ReactorHost({
      build: () => {
        builds += 1;
        return Promise.resolve(fakeClient(calls));
      },
    });

    const ch1 = new MessageChannel();
    host.connect(createPortTransport(ch1.port1));
    const tab1 = rawTab(ch1.port2);
    expect(await tab1.send({ k: "hello", version: V1 })).toEqual({ ok: true });
    expect(builds).toBe(1);

    const ch2 = new MessageChannel();
    host.connect(createPortTransport(ch2.port1));
    const tab2 = rawTab(ch2.port2);
    expect(await tab2.send({ k: "hello", version: V1 })).toEqual({ ok: true });
    expect(builds).toBe(1);

    const doc = await tab1.send({ k: "req", method: "get", args: ["abc"] });
    expect(doc).toEqual({ header: { id: "abc" } });
    expect(calls).toContain("get:abc");
  });

  it("rejects an incompatible version with a reload", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });

    const ch1 = new MessageChannel();
    host.connect(createPortTransport(ch1.port1));
    const tab1 = rawTab(ch1.port2);
    await tab1.send({ k: "hello", version: V1 });

    const ch2 = new MessageChannel();
    host.connect(createPortTransport(ch2.port1));
    const tab2 = rawTab(ch2.port2);
    const result = await tab2.send({ k: "hello", version: V2 });
    expect(result).toMatchObject({ ok: false });
    expect(tab2.reloads).toContain("reactor version mismatch");
  });

  it("lazily registers each connecting tab's packages on hello", async () => {
    const registered: string[][] = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      registerPackages: (specs) => {
        registered.push(specs);
        return Promise.resolve();
      },
    });

    const ch1 = new MessageChannel();
    host.connect(createPortTransport(ch1.port1));
    const tab1 = rawTab(ch1.port2);
    expect(
      await tab1.send({
        k: "hello",
        version: V1,
        packages: ["@scope/a@1.0.0"],
      }),
    ).toEqual({ ok: true });

    const ch2 = new MessageChannel();
    host.connect(createPortTransport(ch2.port1));
    const tab2 = rawTab(ch2.port2);
    expect(
      await tab2.send({
        k: "hello",
        version: V1,
        packages: ["@scope/b@1.0.0"],
      }),
    ).toEqual({ ok: true });

    expect(registered).toEqual([["@scope/a@1.0.0"], ["@scope/b@1.0.0"]]);
  });

  it("does not invoke registerPackages when a hello carries no packages", async () => {
    const registered: string[][] = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      registerPackages: (specs) => {
        registered.push(specs);
        return Promise.resolve();
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await tab.send({ k: "hello", version: V1 });
    expect(registered).toEqual([]);
  });

  it("registers packages via the injected handler", async () => {
    const registered: string[][] = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      registerPackages: (specs) => {
        registered.push(specs);
        return Promise.resolve();
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await tab.send({ k: "hello", version: V1 });
    const ack = await tab.send({
      k: "register-packages",
      specs: ["@scope/pkg@1.0.0"],
    });
    expect(ack).toEqual({ ok: true });
    expect(registered).toEqual([["@scope/pkg@1.0.0"]]);
  });

  it("routes pushed identity (and null on logout) to onIdentity", async () => {
    const seen: (ReactorIdentity | null)[] = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onIdentity: (user) => seen.push(user),
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = createPortTransport(ch.port2);
    const identity: ReactorIdentity = {
      address: "0xabc",
      chainId: 1,
      networkId: "eip155",
    };
    postReactorIdentity(tab, identity);
    postReactorIdentity(tab, null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toEqual([identity, null]);
  });

  it("routes a sync-op to onSyncOp and returns its result", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onSyncOp: (method, args) => {
        calls.push([method, args]);
        return Promise.resolve([{ name: "r1" }]);
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    const result = await tab.send({ k: "sync-op", method: "list", args: [] });
    expect(result).toEqual([{ name: "r1" }]);
    expect(calls).toEqual([["list", []]]);
  });

  it("errors a sync-op when no sync handler is configured", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await expect(
      tab.send({ k: "sync-op", method: "list", args: [] }),
    ).rejects.toThrow(/no sync handler/);
  });

  it("routes a db-op to onDbOp and returns its rows", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onDbOp: (method, args) => {
        calls.push([method, args]);
        return Promise.resolve([{ n: 1 }]);
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    const result = await tab.send({
      k: "db-op",
      method: "query",
      args: ["select 1 as n", []],
    });
    expect(result).toEqual([{ n: 1 }]);
    expect(calls).toEqual([["query", ["select 1 as n", []]]]);
  });

  it("errors a db-op when no db handler is configured", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await expect(
      tab.send({ k: "db-op", method: "query", args: ["select 1", []] }),
    ).rejects.toThrow(/no db handler/);
  });
});
