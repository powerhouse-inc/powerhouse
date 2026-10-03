import { ReactorEventTypes } from "@powerhousedao/reactor";
import { createPortTransport } from "@powerhousedao/reactor-browser/rpc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildWorkerReactor,
  connectManagedWorkerReactor,
  createMonitorWorkerHost,
  provisionWorkerReactor,
  type ManagedWorkerReactor,
  type MonitorWorkerHost,
  type ReactorDescriptor,
} from "../src/index.js";

const DRIVE_TYPE = "powerhouse/document-drive";

/**
 * The worker path, end to end, with a `MessageChannel` where the SharedWorker
 * would be: `createMonitorWorkerHost()` plays the worker side (its only
 * untested part is the entry's `self.onconnect`), and
 * `connectManagedWorkerReactor()` is the real tab-side wiring.
 *
 * `storage: memory` keeps it out of IndexedDB, which does not exist in node.
 */
function descriptor(name: string): ReactorDescriptor {
  return { kind: "worker", name, storage: { kind: "memory" } };
}

describe("monitor worker host over a MessageChannel", () => {
  let channel: MessageChannel;
  let worker: MonitorWorkerHost;
  let tab: ManagedWorkerReactor;
  let disconnect: () => void;

  beforeEach(() => {
    channel = new MessageChannel();
    worker = createMonitorWorkerHost({ workerName: "ph-reactor-monitor:w" });
    disconnect = worker.host.connectPort(channel.port1);
    tab = connectManagedWorkerReactor(
      descriptor("w"),
      createPortTransport(channel.port2),
      { buildId: "test-build" },
    );
  });

  afterEach(async () => {
    await tab.kill();
    disconnect();
    channel.port1.close();
    channel.port2.close();
    await worker.release();
  });

  it("builds the reactor from the tab's construct on first use", async () => {
    expect(worker.current()).toBeUndefined();

    const created = await tab.client.createEmpty(DRIVE_TYPE);

    expect(worker.current()?.construct).toMatchObject({
      name: "w",
      namespace: "reactor-monitor-w",
      storage: { kind: "memory" },
    });
    expect(created.header.id).toBeTruthy();
  });

  it("creates a document and reads it back across the boundary", async () => {
    const created = await tab.client.createEmpty(DRIVE_TYPE);

    const fetched = await tab.client.get(created.header.id);

    expect(fetched.header.id).toBe(created.header.id);
  });

  it("serves the inspector over the op channel", async () => {
    await tab.client.createEmpty(DRIVE_TYPE);

    const snapshot = await tab.inspector.getQueueState();

    expect(snapshot.isPaused).toBe(false);
    expect(typeof snapshot.totalPending).toBe("number");
    expect(typeof snapshot.totalExecuting).toBe("number");

    await tab.inspector.pauseQueue();
    expect((await tab.inspector.getQueueState()).isPaused).toBe(true);
    await tab.inspector.resumeQueue();
    expect((await tab.inspector.getQueueState()).isPaused).toBe(false);
  });

  it("serves raw SQL against the worker's own store", async () => {
    await tab.client.createEmpty(DRIVE_TYPE);

    await expect(tab.dbQuery.queryDb("select 1 as n")).resolves.toEqual([
      { n: 1 },
    ]);
  });

  it("proxies the sync manager", async () => {
    await tab.client.createEmpty(DRIVE_TYPE);

    // list() is seeded asynchronously from the worker's `list` op; the empty
    // reply is what matters, not the timing.
    expect(tab.syncManager.agreement().basis()).toBeDefined();
    expect(tab.syncManager.list()).toEqual([]);
  });

  it("exposes the event bus, forwarding only the whitelisted types", async () => {
    await tab.client.createEmpty(DRIVE_TYPE);

    expect(() =>
      tab.events.subscribe(ReactorEventTypes.JOB_WRITE_READY, () => {}),
    ).toThrow(/forwards only/);

    const unsubscribe = tab.events.subscribe(
      ReactorEventTypes.MODEL_LOADED,
      () => {},
    );
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("answers adminInfo with the worker's identity", async () => {
    const info = await tab.adminInfo();

    expect(info).toMatchObject({
      namespace: "ph-reactor-monitor:w",
      appBuildId: "test-build",
      connectedClients: 1,
    });
    expect(info.ownerId).toBeTruthy();
  });

  it("broadcasts a reload when restart() is called", async () => {
    const reloads: string[] = [];
    const other = new MessageChannel();
    const otherDispose = worker.host.connectPort(other.port1);
    const otherTab = connectManagedWorkerReactor(
      descriptor("w"),
      createPortTransport(other.port2),
      { buildId: "test-build", onReload: (reason) => reloads.push(reason) },
    );

    await otherTab.restart();
    // Drain the microtask + message queue so the broadcast is delivered.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reloads).toContain("admin restart");

    await otherTab.kill();
    otherDispose();
    other.port1.close();
    other.port2.close();
  });

  it("shares one worker reactor between two tabs", async () => {
    const other = new MessageChannel();
    const otherDispose = worker.host.connectPort(other.port1);
    const otherTab = connectManagedWorkerReactor(
      descriptor("w"),
      createPortTransport(other.port2),
      { buildId: "test-build" },
    );

    const created = await tab.client.createEmpty(DRIVE_TYPE);
    const fetched = await otherTab.client.get(created.header.id);

    expect(fetched.header.id).toBe(created.header.id);

    await otherTab.kill();
    otherDispose();
    other.port1.close();
    other.port2.close();
  });

  it("surfaces a failed build to the ops that follow it", async () => {
    const failing = createMonitorWorkerHost({
      build: () => Promise.reject(new Error("boom")),
    });
    const failingChannel = new MessageChannel();
    const failingDispose = failing.host.connectPort(failingChannel.port1);
    const failingTab = connectManagedWorkerReactor(
      descriptor("fails"),
      createPortTransport(failingChannel.port2),
    );

    // Inspector and db ops await the client and re-throw the boot failure.
    // (A plain `req` sent before the first hello settles is buffered by
    // ReactorHost and never answered on a failed build — see the W0.2
    // report; that is upstream behaviour, not this host's.)
    await expect(failingTab.inspector.getQueueState()).rejects.toThrow(/boom/);
    await expect(failingTab.dbQuery.queryDb("select 1")).rejects.toThrow(
      /boom/,
    );
    expect(failing.current()).toBeUndefined();

    await failingTab.kill();
    failingDispose();
    failingChannel.port1.close();
    failingChannel.port2.close();
  });
});

describe("buildWorkerReactor", () => {
  it("validates the construct before touching a store", async () => {
    await expect(buildWorkerReactor({ name: "" })).rejects.toThrow(
      /Invalid worker construct/,
    );
    await expect(buildWorkerReactor(undefined)).rejects.toThrow(
      /Invalid worker construct/,
    );
  });

  it("refuses packages when it has no way to import them", async () => {
    await expect(
      buildWorkerReactor({
        name: "needs-packages",
        storage: { kind: "memory" },
        packageSpecs: ["pkg@1.0.0"],
      }),
    ).rejects.toThrow(/no importers were provided/);
  });

  it("registers the base models and the loader's models together", async () => {
    const extraModel = {
      documentModel: { global: { id: "monitor/extra" } },
      reducer: () => undefined,
      version: 1,
    };
    const built = await buildWorkerReactor(
      {
        name: "with-packages",
        storage: { kind: "memory" },
        cdnUrl: "https://registry.test",
        packageSpecs: ["extra@1.0.0"],
      },
      {
        importPackage: () =>
          Promise.resolve({ extraDocumentModelModule: extraModel }),
      },
    );
    try {
      const models = await built.module.client.getDocumentModelModules();
      const ids = models.results.map((m) => m.documentModel.global.id);

      expect(ids).toContain(DRIVE_TYPE);
      expect(ids).toContain("monitor/extra");
      expect(built.loader).toBeDefined();
    } finally {
      await built.shutdown();
    }
  });
});

describe("provisionWorkerReactor", () => {
  it("takes the worker from descriptor.createWorker", async () => {
    // The `createWorker` seam exists so a bundled app owns the one
    // `new SharedWorker(new URL(...))` its bundler must see. Here it hands
    // back a MessageChannel port dressed as a SharedWorker, which is enough
    // to prove the seam is wired to the transport.
    const channel = new MessageChannel();
    const host = createMonitorWorkerHost();
    const dispose = host.host.connectPort(channel.port1);
    const names: string[] = [];

    const reactor = provisionWorkerReactor({
      kind: "worker",
      name: "supplied",
      storage: { kind: "memory" },
      createWorker: (name) => {
        names.push(name);
        return {
          port: channel.port2,
          addEventListener: () => undefined,
        } as unknown as SharedWorker;
      },
    });

    try {
      expect(names).toEqual(["ph-reactor-monitor:supplied"]);
      const created = await reactor.client.createEmpty(DRIVE_TYPE);
      expect((await reactor.client.get(created.header.id)).header.id).toBe(
        created.header.id,
      );
      expect(host.current()?.construct.name).toBe("supplied");
    } finally {
      await reactor.kill();
      dispose();
      channel.port1.close();
      channel.port2.close();
      await host.release();
    }
  });

  it("refuses without a worker to use in an environment that has none", () => {
    expect(() =>
      provisionWorkerReactor({ kind: "worker", name: "nope" }),
    ).toThrow(/SharedWorker is not available/);
  });
});
