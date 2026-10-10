import {
  GQL_CHANNEL_TYPE,
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  LOCAL_CHANNEL_TYPE,
  PGliteSessionPoisonedError,
  ReactorEventTypes,
  UNKNOWN_STORAGE_FACTS,
  type ReactorInspector,
} from "@powerhousedao/reactor";
import { createPortTransport } from "@powerhousedao/reactor-browser/rpc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkerReactor,
  connectManagedWorkerReactor,
  createMonitorWorkerHost,
  linkLocalSync,
  provisionInProcess,
  provisionWorkerReactor,
  ReactorMonitorRegistry,
  type BuildWorkerReactorOptions,
  type BuiltWorkerReactor,
  type ManagedInProcessReactor,
  type ManagedWorkerReactor,
  type MonitorWorkerHost,
  type ReactorDescriptor,
} from "../src/index.js";
import { descriptor as inProcessDescriptor, nodeChannel } from "./helpers.js";

const DRIVE_TYPE = "powerhouse/document-drive";

/**
 * The worker path, end to end, with a `MessageChannel` where the SharedWorker
 * would be: `createMonitorWorkerHost()` plays the worker side (its only
 * untested part is the entry's `self.onconnect`), and
 * `connectManagedWorkerReactor()` is the real tab-side wiring.
 *
 * `storage: memory` keeps it out of IndexedDB, which does not exist in node.
 * Built on the shared in-process `descriptor` helper with `kind` overridden
 * to `"worker"`, rather than its own copy of the same base shape.
 */
function descriptor(
  name: string,
  overrides?: Partial<ReactorDescriptor>,
): ReactorDescriptor {
  return inProcessDescriptor(name, { kind: "worker", ...overrides });
}

describe("monitor worker host over a MessageChannel", () => {
  let channel: MessageChannel;
  let worker: MonitorWorkerHost;
  let tab: ManagedWorkerReactor;
  let disconnect: () => void;

  beforeEach(async () => {
    channel = new MessageChannel();
    worker = createMonitorWorkerHost({ workerName: "ph-reactor-monitor:w" });
    disconnect = worker.host.connectPort(channel.port1);
    tab = await connectManagedWorkerReactor(
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

  it("builds the reactor from the tab's construct by the time it connects", async () => {
    // Connecting awaits info() over RPC, so the build has completed.
    expect(worker.current()?.construct).toMatchObject({
      name: "w",
      namespace: "reactor-monitor-w",
      storage: { kind: "memory" },
    });

    const created = await tab.client.createEmpty(DRIVE_TYPE);
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

    await tab.admin!.pauseQueue();
    expect((await tab.inspector.getQueueState()).isPaused).toBe(true);
    await tab.admin!.resumeQueue();
    expect((await tab.inspector.getQueueState()).isPaused).toBe(false);
  });

  it("serves raw SQL against the worker's own store", async () => {
    await tab.client.createEmpty(DRIVE_TYPE);

    await expect(tab.dbQuery!.queryDb("select 1 as n")).resolves.toEqual([
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

  it("serves the sync reads and reconfiguration rows over the op channel", async () => {
    await expect(tab.syncManager.inspectRemotes()).resolves.toEqual([]);
    await expect(tab.syncManager.listHolds()).resolves.toEqual([]);
    // The sync manager's own refusal: the admin row reached syncAdmin.
    await expect(tab.syncAdmin!.resetChannel("no-such-remote")).rejects.toThrow(
      /Remote with name 'no-such-remote' does not exist/,
    );
  });

  it("reports the worker reactor's info read over RPC", () => {
    expect(tab.reach).toEqual({ hosting: "worker", inspection: "rpc" });
    expect(tab.info).toEqual({
      storage: IN_MEMORY_PGLITE_STORAGE_FACTS,
      workflows: false,
      syncChannels: [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
      access: { admin: true, sql: true },
    });
    expect(tab.admin).toBeDefined();
    expect(tab.dbQuery).toBeDefined();
    expect(tab.syncAdmin).toBeDefined();
  });

  it("declares both sync channels for a connect-mode worker reactor and exposes the link handles", () => {
    expect(tab.info.syncChannels).toEqual([
      GQL_CHANNEL_TYPE,
      LOCAL_CHANNEL_TYPE,
    ]);
    expect(tab.descriptorMismatch).toBe(false);
    expect(tab.adoptLocalSyncPeer).toBeDefined();
    expect(tab.removeLocalSyncPeer).toBeDefined();
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
    const otherTab = await connectManagedWorkerReactor(
      descriptor("w"),
      createPortTransport(other.port2),
      { buildId: "test-build", onReload: (reason) => reloads.push(reason) },
    );

    await otherTab.restart();
    // Drain the microtask + message queue so the broadcast is delivered.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reloads).toContain("admin restart");
    // Retired, not just reloaded: the reactor is released and data ops refused.
    await vi.waitFor(() => expect(worker.current()).toBeUndefined());
    await expect(otherTab.client.get("any")).rejects.toThrow(/retired/);

    await otherTab.kill();
    otherDispose();
    other.port1.close();
    other.port2.close();
  });

  it("shares one worker reactor between two tabs", async () => {
    const other = new MessageChannel();
    const otherDispose = worker.host.connectPort(other.port1);
    const otherTab = await connectManagedWorkerReactor(
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

  it("reports a later tab the FIRST built reactor's info, and flags the mismatch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mismatchHost = createMonitorWorkerHost();
    const firstChannel = new MessageChannel();
    const firstDispose = mismatchHost.host.connectPort(firstChannel.port1);

    // The FIRST tab wins the build: sync.local, so the worker actually wires
    // a LocalChannelFactory reactor.
    const first = await connectManagedWorkerReactor(
      descriptor("mismatch", { sync: { local: true } }),
      createPortTransport(firstChannel.port2),
      { buildId: "test-build" },
    );

    const secondChannel = new MessageChannel();
    const secondDispose = mismatchHost.host.connectPort(secondChannel.port1);
    // The worker builds once, so this sync-less construct is dropped.
    const second = await connectManagedWorkerReactor(
      descriptor("mismatch", { sync: { channelScheme: null } }),
      createPortTransport(secondChannel.port2),
      { buildId: "test-build" },
    );

    try {
      expect(first.info.syncChannels).toEqual([LOCAL_CHANNEL_TYPE]);
      expect(first.descriptorMismatch).toBe(false);
      expect(first.adoptLocalSyncPeer).toBeDefined();

      expect(second.info.syncChannels).toEqual([LOCAL_CHANNEL_TYPE]);
      expect(second.descriptorMismatch).toBe(true);
      expect(second.adoptLocalSyncPeer).toBeDefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      await first.kill();
      await second.kill();
      firstDispose();
      secondDispose();
      firstChannel.port1.close();
      firstChannel.port2.close();
      secondChannel.port1.close();
      secondChannel.port2.close();
      await mismatchHost.release();
    }
  }, 60_000);

  /**
   * Version skew in the direction that matters: a worker that does not report
   * the `local` channel type -- an older build whose reactor composed no local
   * factory, or one deliberately built without it -- must not get the adopt
   * handles, and the link must be refused before any port is opened. The
   * handle gates on the REPORTED types, so the tab's own descriptor (plain
   * connect mode, which would ask for local) cannot talk it into them.
   */
  it("withholds the link handles from a worker that reports no local channel type", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stale = createMonitorWorkerHost({
      // A real reactor; only what its info() reports routing is narrowed.
      build: async (construct, importers, options) => {
        const built = await buildWorkerReactor(construct, importers, options);
        const inspector = Object.create(built.inspector) as ReactorInspector;
        inspector.info = async () => ({
          ...(await built.inspector.info()),
          syncChannels: [GQL_CHANNEL_TYPE],
        });
        return { ...built, inspector };
      },
    });
    const staleChannel = new MessageChannel();
    const staleDispose = stale.host.connectPort(staleChannel.port1);
    const staleTab = await connectManagedWorkerReactor(
      descriptor("stale"),
      createPortTransport(staleChannel.port2),
      { buildId: "test-build" },
    );
    const peer: ManagedInProcessReactor = await provisionInProcess(
      inProcessDescriptor("stale-peer", { sync: { local: true } }),
    );

    try {
      expect(staleTab.info.syncChannels).toEqual([GQL_CHANNEL_TYPE]);
      expect(staleTab.adoptLocalSyncPeer).toBeUndefined();
      expect(staleTab.removeLocalSyncPeer).toBeUndefined();

      let opened = 0;
      await expect(
        linkLocalSync(peer, staleTab, {
          driveId: "stale-drive",
          createChannel: () => {
            opened++;
            return nodeChannel();
          },
        }),
      ).rejects.toThrow(/has no local sync channel/);
      // No port was opened, so none was transferred into the worker either.
      expect(opened).toBe(0);
    } finally {
      warn.mockRestore();
      await peer.kill();
      await staleTab.kill();
      staleDispose();
      staleChannel.port1.close();
      staleChannel.port2.close();
      await stale.release();
    }
  }, 60_000);

  it("surfaces a failed build to the ops that follow it", async () => {
    const failing = createMonitorWorkerHost({
      build: () => Promise.reject(new Error("boom")),
    });
    const failingChannel = new MessageChannel();
    const failingDispose = failing.host.connectPort(failingChannel.port1);
    // The info() read fails too; the handle still connects, on unknown facts.
    const failingTab = await connectManagedWorkerReactor(
      descriptor("fails"),
      createPortTransport(failingChannel.port2),
    );

    // Inspector ops await the client and re-throw the boot failure.
    await expect(failingTab.inspector.getQueueState()).rejects.toThrow(/boom/);
    expect(failing.current()).toBeUndefined();

    // Nothing was verified, so no lever, no SQL and no adopt handle is offered.
    expect(failingTab.info).toEqual({
      storage: UNKNOWN_STORAGE_FACTS,
      workflows: false,
      syncChannels: [],
      access: { admin: false, sql: false },
    });
    expect(failingTab.descriptorMismatch).toBe(false);
    expect(failingTab.admin).toBeUndefined();
    expect(failingTab.dbQuery).toBeUndefined();
    expect(failingTab.syncAdmin).toBeUndefined();
    expect(failingTab.adoptLocalSyncPeer).toBeUndefined();
    expect(failingTab.removeLocalSyncPeer).toBeUndefined();

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

/** A host whose builds hand back their poison trigger and built reactor. */
function poisonableHost(workerName?: string) {
  const builds: {
    built: BuiltWorkerReactor;
    poison: () => void;
  }[] = [];
  const worker = createMonitorWorkerHost({
    ...(workerName ? { workerName } : {}),
    build: async (
      construct,
      importers,
      options?: BuildWorkerReactorOptions,
    ) => {
      const built = await buildWorkerReactor(construct, importers, options);
      builds.push({
        built,
        poison: () =>
          options?.onUnrecoverable?.(
            new PGliteSessionPoisonedError(new Error("dead wasm call")),
          ),
      });
      return built;
    },
  });
  return { worker, builds };
}

describe("a worker reactor whose store is poisoned", () => {
  it("retires the worker and fails every connected handle", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { worker, builds } = poisonableHost();
    const channel = new MessageChannel();
    const dispose = worker.host.connectPort(channel.port1);
    const failures: Error[] = [];
    const gens: (string | undefined)[] = [];
    const tab = await connectManagedWorkerReactor(
      descriptor("poison-host"),
      createPortTransport(channel.port2),
      {
        buildId: "test-build",
        onReload: (_reason, gen) => gens.push(gen),
        onUnrecoverable: (cause) => failures.push(cause),
      },
    );
    const late = new MessageChannel();
    let lateDispose = (): void => undefined;
    try {
      builds[0].poison();
      builds[0].poison();

      await vi.waitFor(() => expect(failures).toHaveLength(1));
      await vi.waitFor(() => expect(builds[0].built.pg.closed).toBe(true));
      expect(worker.current()).toBeUndefined();
      expect(gens[0]).toBeTruthy();
      await expect(tab.client.get("any")).rejects.toThrow(/retired/);

      // A tab reaching the retired worker later is sent to the same gen.
      lateDispose = worker.host.connectPort(late.port1);
      const lateGens: (string | undefined)[] = [];
      const lateFailures: Error[] = [];
      const lateTab = await connectManagedWorkerReactor(
        descriptor("poison-host"),
        createPortTransport(late.port2),
        {
          buildId: "test-build",
          onReload: (_reason, gen) => lateGens.push(gen),
          onUnrecoverable: (cause) => lateFailures.push(cause),
        },
      );
      await vi.waitFor(() => expect(lateFailures).toHaveLength(1));
      expect(lateGens).toEqual([gens[0]]);
      await lateTab.kill();
    } finally {
      error.mockRestore();
      await tab.kill();
      dispose();
      lateDispose();
      channel.port1.close();
      channel.port2.close();
      late.port1.close();
      late.port2.close();
      await worker.release();
    }
  });

  it("re-provisions onto a fresh worker under a gen-salted name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hosts = new Map<string, ReturnType<typeof poisonableHost>>();
    const channels: MessageChannel[] = [];
    const names: string[] = [];
    const registry = new ReactorMonitorRegistry();
    const workerDescriptor = descriptor("poison-registry", {
      createWorker: (name) => {
        names.push(name);
        let host = hosts.get(name);
        if (!host) {
          host = poisonableHost(name);
          hosts.set(name, host);
        }
        const channel = new MessageChannel();
        channels.push(channel);
        host.worker.host.connectPort(channel.port1);
        return {
          port: channel.port2,
          addEventListener: () => undefined,
        } as unknown as SharedWorker;
      },
    });
    try {
      await registry.provision(workerDescriptor);
      const first = hosts.get(names[0])!;
      first.builds[0].poison();

      await vi.waitFor(() =>
        expect(registry.get("poison-registry")?.status).toBe("failed"),
      );
      expect(registry.get("poison-registry")?.error?.message).toMatch(
        /reactor store poisoned/,
      );

      const again = await registry.provision(workerDescriptor);
      expect(names).toHaveLength(2);
      expect(names[0]).toBe("ph-reactor-monitor:poison-registry");
      expect(names[1]).toMatch(/^ph-reactor-monitor:poison-registry#.+/);
      const created = await again.client.createEmpty(DRIVE_TYPE);
      expect(created.header.id).toBeTruthy();
      expect(hosts.get(names[1])!.worker.current()).toBeDefined();
    } finally {
      error.mockRestore();
      warn.mockRestore();
      await registry.killAll();
      for (const channel of channels) {
        channel.port1.close();
        channel.port2.close();
      }
      for (const { worker } of hosts.values()) {
        await worker.release();
      }
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

    const reactor = await provisionWorkerReactor({
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
