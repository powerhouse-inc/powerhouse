import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { postReactorIdentity } from "../../src/rpc/connect-reactor.js";
import {
  MessageRouter,
  type ReactorIdentity,
  type VersionFingerprint,
  createPortTransport,
} from "@powerhousedao/reactor/rpc";
import {
  ReactorHost,
  RETIRED_WORKER_RELOAD_REASON,
} from "../../src/rpc/reactor-host.js";

function tabRouter(port: MessagePort): MessageRouter {
  const router = new MessageRouter();
  router.attach(createPortTransport(port));
  return router;
}

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
  const workerGens: (string | undefined)[] = [];
  const migrations: unknown[] = [];
  port.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      k: string;
      id?: string;
      value?: unknown;
      error?: { message: string };
      reason?: string;
      workerGen?: string;
      state?: unknown;
    };
    if (msg.k === "res" && msg.id) {
      pending.get(msg.id)?.resolve(msg.value);
    } else if (
      (msg.k === "err" || msg.k === "sub-err" || msg.k === "live-err") &&
      msg.id
    ) {
      pending.get(msg.id)?.reject(new Error(msg.error?.message));
    } else if (msg.k === "reload") {
      reloads.push(msg.reason ?? "");
      workerGens.push(msg.workerGen);
    } else if (msg.k === "migration") {
      migrations.push(msg.state);
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
  return { send, reloads, workerGens, migrations };
}

function openTab(host: ReactorHost) {
  const channel = new MessageChannel();
  host.connect(createPortTransport(channel.port1));
  return rawTab(channel.port2);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  // A stale tab left on the old worker means two workers over one idb namespace.
  it("reloads every connected tab onto one generation on a mismatch", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const tab1 = openTab(host);
    await tab1.send({ k: "hello", version: V1 });
    const tab2 = openTab(host);
    await tab2.send({ k: "hello", version: V2 });
    await settle();

    expect(tab1.reloads).toEqual(["reactor version mismatch"]);
    expect(tab2.reloads).toEqual(["reactor version mismatch"]);
    expect(tab1.workerGens[0]).toMatch(/^v1-build-2-/);
    expect(tab2.workerGens).toEqual(tab1.workerGens);
    expect(host.retired).toBe(true);
  });

  it("stops the reactor and stores of a worker a mismatch retires", async () => {
    let retired = 0;
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onRetire: () => {
        retired += 1;
        return Promise.resolve();
      },
    });
    await openTab(host).send({ k: "hello", version: V1 });
    await openTab(host).send({ k: "hello", version: V2 });
    await settle();
    expect(retired).toBe(1);
  });

  // A tab that named its worker before any sibling bumped the gen lands here late.
  it("sends a late tab on the new build away instead of serving it", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const tab1 = openTab(host);
    await tab1.send({ k: "hello", version: V1 });
    await openTab(host).send({ k: "hello", version: V2 });
    await settle();

    const late = openTab(host);
    expect(await late.send({ k: "hello", version: V2 })).toEqual({
      ok: false,
    });
    await settle();
    expect(late.reloads).toEqual(["reactor version mismatch"]);
    expect(late.workerGens).toEqual(tab1.workerGens);
  });

  it("sends every later hello away once retired, even one matching its build", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const tab1 = openTab(host);
    await tab1.send({ k: "hello", version: V1 });
    await openTab(host).send({ k: "hello", version: V2 });
    await settle();

    const sameBuild = openTab(host);
    await expect(sameBuild.send({ k: "hello", version: V1 })).rejects.toThrow(
      /retired/,
    );
    expect(sameBuild.workerGens).toEqual(tab1.workerGens);
  });

  it("keeps reporting the build it booted for after a mismatch", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const tab1 = openTab(host);
    await tab1.send({ k: "hello", version: V1 });
    await openTab(host).send({ k: "hello", version: V2 });

    expect(await tab1.send({ k: "admin", method: "info" })).toMatchObject({
      appBuildId: "build-1",
    });
  });

  // A slow package load can outlast the retirement and open the stores after it.
  it("stops the reactor and stores again when a build finishes after retirement", async () => {
    let finishBuild: (client: IReactorClient) => void = () => undefined;
    const built = new Promise<IReactorClient>((resolve) => {
      finishBuild = resolve;
    });
    let retired = 0;
    const host = new ReactorHost({
      build: () => built,
      onRetire: () => {
        retired += 1;
        return Promise.resolve();
      },
    });
    void openTab(host)
      .send({ k: "hello", version: V1 })
      .catch(() => undefined);
    await settle();
    await openTab(host).send({ k: "hello", version: V2 });
    await settle();
    expect(retired).toBe(1);

    finishBuild(fakeClient([]));
    await settle();
    expect(retired).toBe(2);
  });

  // Stored gen v1-A, a switch to build B and back to A would land on this worker again.
  it("never names its own worker as the generation to reload onto", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      namespace: "ph-reactor:ns#v1-build-1",
    });
    const tab1 = openTab(host);
    await tab1.send({ k: "hello", version: V2 });
    await openTab(host).send({ k: "hello", version: V1 });
    await settle();
    expect(tab1.workerGens).toHaveLength(1);
    expect(tab1.workerGens[0]).toMatch(/^v1-build-1-/);
  });

  it("reloads a tab whose enforcement flags differ from the running worker's", async () => {
    // A flag flip is a config change, not a rebuild: same build id, and serving
    // the tab from the running worker would enforce the flags it booted with.
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
    const enforcing: VersionFingerprint = {
      ...V1,
      featureFlags: "authEnforcement,documentDecisions",
    };
    expect(await tab2.send({ k: "hello", version: enforcing })).toMatchObject({
      ok: false,
    });
    expect(tab2.reloads[0]).toContain("reactor enforcement flags changed");
    // A fresh worker name, or the reload would land on this same worker again.
    expect(tab2.workerGens[0]).not.toBe(`v${V1.rpcProtocolVersion}-build-1`);
  });

  it("treats an absent flag set and an all-off one as the same worker", async () => {
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
    expect(
      await tab2.send({ k: "hello", version: { ...V1, featureFlags: "" } }),
    ).toEqual({ ok: true });
    expect(tab2.reloads).toEqual([]);
  });

  it("fails ops after a failed build with its error until a hello rebuilds", async () => {
    let builds = 0;
    const host = new ReactorHost({
      build: () => {
        builds += 1;
        return builds === 1
          ? Promise.reject(new Error("store holds base-reducer 7"))
          : Promise.resolve(fakeClient([]));
      },
      onSyncOp: () => Promise.resolve([]),
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await expect(tab.send({ k: "hello", version: V1 })).rejects.toThrow(
      "store holds base-reducer 7",
    );
    await expect(
      tab.send({ k: "sync-op", method: "list", args: [] }),
    ).rejects.toThrow("store holds base-reducer 7");

    expect(await tab.send({ k: "hello", version: V1 })).toEqual({ ok: true });
    expect(builds).toBe(2);
    expect(await tab.send({ k: "sync-op", method: "list", args: [] })).toEqual(
      [],
    );
  });

  it("answers a ping with a pong carrying ownerId/bootedAtMs before any build", async () => {
    let builds = 0;
    const host = new ReactorHost({
      ownerId: "owner-xyz",
      bootedAtMs: 12345,
      build: () => {
        builds += 1;
        return Promise.resolve(fakeClient([]));
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));

    const pong = await new Promise<Record<string, unknown>>((resolve) => {
      ch.port2.onmessage = (event: MessageEvent) =>
        resolve(event.data as Record<string, unknown>);
      ch.port2.postMessage({ k: "ping", id: "p1" });
    });

    expect(pong).toEqual({
      k: "pong",
      id: "p1",
      ownerId: "owner-xyz",
      bootedAtMs: 12345,
    });
    expect(builds).toBe(0);
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
    const tab = tabRouter(ch.port2);
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

  it("routes an inspector-op to onInspectorOp and returns its value", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onInspectorOp: (method, args) => {
        calls.push([method, args]);
        return Promise.resolve({ totalPending: 3 });
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    const result = await tab.send({
      k: "inspector-op",
      method: "queue.getState",
      args: [],
    });
    expect(result).toEqual({ totalPending: 3 });
    expect(calls).toEqual([["queue.getState", []]]);
  });

  it("errors an inspector-op when no inspector handler is configured", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await expect(
      tab.send({ k: "inspector-op", method: "queue.getState", args: [] }),
    ).rejects.toThrow(/no inspector handler/);
  });

  it("routes an admin clearStorage to onAdminClearStorage", async () => {
    let cleared = false;
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onAdminClearStorage: () => {
        cleared = true;
        return Promise.resolve();
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    const result = await tab.send({ k: "admin", method: "clearStorage" });
    expect(result).toEqual({ ok: true });
    expect(cleared).toBe(true);
  });

  it("routes an admin migrate to onAdminMigrate", async () => {
    let migrated = false;
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onAdminMigrate: () => {
        migrated = true;
        return Promise.resolve();
      },
    });

    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    const result = await tab.send({ k: "admin", method: "migrate" });
    expect(result).toEqual({ ok: true });
    expect(migrated).toBe(true);
  });

  it("bounces data messages while migrating", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);

    host.setMigrationState({ status: "migrating" });
    await expect(
      tab.send({ k: "req", method: "get", args: ["abc"] }),
    ).rejects.toThrow(/migration in progress/);
  });

  it("pushes migration state to connected tabs and seeds new ones", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const ch1 = new MessageChannel();
    host.connect(createPortTransport(ch1.port1));
    const tab1 = rawTab(ch1.port2);

    host.setMigrationState({ status: "needed", legacyMajor: 16 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tab1.migrations).toEqual([{ status: "needed", legacyMajor: 16 }]);

    const ch2 = new MessageChannel();
    host.connect(createPortTransport(ch2.port1));
    const tab2 = rawTab(ch2.port2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tab2.migrations).toEqual([{ status: "needed", legacyMajor: 16 }]);
  });

  it("replays a retiring reload to a tab that connects to the old worker later", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
    });
    const ch1 = new MessageChannel();
    host.connect(createPortTransport(ch1.port1));
    const tab1 = rawTab(ch1.port2);

    host.retireAndReload("storage session poisoned", "gen-2");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tab1.reloads).toEqual(["storage session poisoned"]);
    expect(tab1.workerGens).toEqual(["gen-2"]);

    const ch2 = new MessageChannel();
    host.connect(createPortTransport(ch2.port1));
    const tab2 = rawTab(ch2.port2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tab2.reloads).toEqual(["storage session poisoned"]);
    expect(tab2.workerGens).toEqual(["gen-2"]);
  });

  it.each(["restart", "clearStorage", "migrate"])(
    "refuses admin %s once retired and sends the tab to the current worker",
    async (method) => {
      const ran: string[] = [];
      const host = new ReactorHost({
        build: () => Promise.resolve(fakeClient([])),
        onAdminRestart: () => ran.push("restart"),
        onAdminClearStorage: () => {
          ran.push("clearStorage");
          return Promise.resolve();
        },
        onAdminMigrate: () => {
          ran.push("migrate");
          return Promise.resolve();
        },
      });
      host.retireAndReload("storage session poisoned", "gen-2");

      const ch = new MessageChannel();
      host.connect(createPortTransport(ch.port1));
      const tab = rawTab(ch.port2);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(tab.send({ k: "admin", method })).rejects.toThrow(/retired/);
      expect(ran).toEqual([]);
      expect(tab.reloads.at(-1)).toBe(RETIRED_WORKER_RELOAD_REASON);
      expect(tab.workerGens.at(-1)).toBe("gen-2");
    },
  );

  it.each([
    { k: "req", method: "get", args: ["abc"] },
    { k: "sub", search: {} },
    { k: "page", token: "t" },
    { k: "sync-op", method: "list", args: [] },
    { k: "db-op", method: "query", args: ["select 1", []] },
    { k: "inspector-op", method: "db.query", args: ["select 1", []] },
    { k: "sub-live", sql: "select 1", params: [] },
  ])("refuses a $k once retired without reaching the reactor", async (msg) => {
    const ran: string[] = [];
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient(ran)),
      onSyncOp: (method) => {
        ran.push(`sync:${method}`);
        return Promise.resolve([]);
      },
      onDbOp: (method) => {
        ran.push(`db:${method}`);
        return Promise.resolve([]);
      },
      onInspectorOp: (method) => {
        ran.push(`inspector:${method}`);
        return Promise.resolve([]);
      },
      onLiveQuery: () => {
        ran.push("live");
        return Promise.resolve(() => undefined);
      },
      onRetire: () => Promise.resolve(),
    });
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await tab.send({ k: "hello", version: V1 });
    host.retireAndReload("storage session poisoned", "gen-2");

    await expect(tab.send(msg)).rejects.toThrow(/retired/);
    expect(ran).toEqual([]);
  });

  it("stops the retired worker's reactor and stores once", async () => {
    let retired = 0;
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onRetire: () => {
        retired += 1;
        return Promise.resolve();
      },
    });
    host.retireAndReload("storage session poisoned", "gen-2");
    host.retireAndReload("storage session poisoned", "gen-3");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(retired).toBe(1);
  });

  it("does not rebuild the reactor on a hello once retired", async () => {
    let builds = 0;
    const host = new ReactorHost({
      build: () => {
        builds += 1;
        return Promise.resolve(fakeClient([]));
      },
    });
    host.retireAndReload("storage session poisoned", "gen-2");
    const ch = new MessageChannel();
    host.connect(createPortTransport(ch.port1));
    const tab = rawTab(ch.port2);
    await expect(tab.send({ k: "hello", version: V1 })).rejects.toThrow(
      /retired/,
    );
    expect(builds).toBe(0);
  });

  it("refuses a hello once retired, even after it has built", async () => {
    const host = new ReactorHost({
      build: () => Promise.resolve(fakeClient([])),
      onRetire: () => Promise.resolve(),
    });
    const ch1 = new MessageChannel();
    host.connect(createPortTransport(ch1.port1));
    await rawTab(ch1.port2).send({ k: "hello", version: V1 });
    host.retireAndReload("storage cleared", "gen-2");

    const ch2 = new MessageChannel();
    host.connect(createPortTransport(ch2.port1));
    const late = rawTab(ch2.port2);
    await expect(late.send({ k: "hello", version: V1 })).rejects.toThrow(
      /retired/,
    );
    expect(late.workerGens).toEqual(["gen-2"]);
    expect(host.retired).toBe(true);
  });
});
