import { ChannelScheme } from "@powerhousedao/reactor";
import { afterEach, describe, expect, it } from "vitest";
import {
  provision,
  provisionInProcess,
  reactorStorageNamespace,
  type ManagedInProcessReactor,
  type ReactorDescriptor,
} from "../src/index.js";

const DRIVE_TYPE = "powerhouse/document-drive";

/**
 * An in-memory PGlite, so a test reactor leaves nothing behind. `idb://` is
 * the browser default and has no backing store in node.
 */
function descriptor(name: string): ReactorDescriptor {
  return { kind: "in-process", name, storage: { kind: "memory" } };
}

describe("provisionInProcess", () => {
  const provisioned: ManagedInProcessReactor[] = [];

  async function host(name: string): Promise<ManagedInProcessReactor> {
    const reactor = await provisionInProcess(descriptor(name));
    provisioned.push(reactor);
    return reactor;
  }

  afterEach(async () => {
    // Serially: each kill closes a PGlite in this realm.
    for (const reactor of provisioned.splice(0)) {
      await reactor.kill();
    }
  });

  it("creates a document and reads it back", async () => {
    const reactor = await host("create-read");

    const created = await reactor.client.createEmpty(DRIVE_TYPE);
    const fetched = await reactor.client.get(created.header.id);

    expect(fetched.header.id).toBe(created.header.id);
  });

  it("registers the base document models so drives work", async () => {
    const reactor = await host("base-models");

    const models = await reactor.client.getDocumentModelModules();
    const ids = models.results.map((m) => m.documentModel.global.id);

    expect(ids).toContain(DRIVE_TYPE);
  });

  it("exposes a typed inspector over the live queue", async () => {
    const reactor = await host("inspector");

    const snapshot = await reactor.inspector.getQueueState();

    expect(snapshot.isPaused).toBe(false);
    expect(typeof snapshot.totalPending).toBe("number");
    expect(typeof snapshot.totalExecuting).toBe("number");
    expect(Array.isArray(snapshot.pendingJobs)).toBe(true);

    await reactor.inspector.pauseQueue();
    expect((await reactor.inspector.getQueueState()).isPaused).toBe(true);
    await reactor.inspector.resumeQueue();
    expect((await reactor.inspector.getQueueState()).isPaused).toBe(false);
  });

  it("answers raw SQL against the reactor's own store", async () => {
    const reactor = await host("db-query");

    const rows = await reactor.dbQuery.queryDb("select 1 as n");

    expect(rows).toEqual([{ n: 1 }]);
  });

  it("builds a sync manager on the CONNECT channel scheme by default", async () => {
    const reactor = await host("sync-default");

    expect(reactor.syncManager).toBeDefined();
    expect(reactor.syncManager?.list()).toEqual([]);
    expect(reactor.module.reactorModule?.syncModule).toBeDefined();
  });

  it("builds no sync module when channelScheme is null", async () => {
    const reactor = await provisionInProcess({
      ...descriptor("sync-off"),
      sync: { channelScheme: null },
    });
    provisioned.push(reactor);

    expect(reactor.syncManager).toBeUndefined();
    expect(reactor.module.reactorModule?.syncModule).toBeUndefined();
  });

  it("accepts an explicit CONNECT scheme", async () => {
    const reactor = await provisionInProcess({
      ...descriptor("sync-connect"),
      sync: { channelScheme: ChannelScheme.CONNECT },
    });
    provisioned.push(reactor);

    expect(reactor.syncManager).toBeDefined();
  });

  it("hands back a BrowserReactorClientModule-shaped module", async () => {
    const reactor = await host("module-shape");

    expect(reactor.module.kind).toBe("in-process");
    expect(reactor.module.client).toBe(reactor.client);
    expect(reactor.module.reactorModule?.pg).toBeDefined();
    expect(reactor.module.reactorModule?.documentModelRegistry).toBeDefined();
    // adminInfo/restart are worker-only capabilities.
    expect(reactor.adminInfo).toBeUndefined();
    expect(reactor.restart).toBeUndefined();
  });

  it("shuts down cleanly and leaves the store closed", async () => {
    const reactor = await provisionInProcess(descriptor("kill"));

    await reactor.kill();

    expect(reactor.isShutdown()).toBe(true);
    await expect(reactor.dbQuery.queryDb("select 1")).rejects.toThrow();
    // Idempotent: the monitor kills on unmount and the user can kill too.
    await expect(reactor.kill()).resolves.toBeUndefined();
  });

  it("namespaces the store by descriptor name", () => {
    expect(reactorStorageNamespace("alpha")).toBe("reactor-monitor-alpha");
    expect(reactorStorageNamespace("Two Words/x")).toBe(
      "reactor-monitor-Two-Words-x",
    );
    expect(reactorStorageNamespace("alpha")).not.toBe(
      reactorStorageNamespace("beta"),
    );
  });

  it("gives two named reactors independent stores", async () => {
    const [a, b] = [await host("iso-a"), await host("iso-b")];

    const created = await a.client.createEmpty(DRIVE_TYPE);

    expect((await a.client.find({ type: DRIVE_TYPE })).results).toHaveLength(1);
    expect((await b.client.find({ type: DRIVE_TYPE })).results).toHaveLength(0);
    expect(created.header.id).toBeTruthy();
  });
});

describe("provision", () => {
  it("dispatches in-process descriptors", async () => {
    const reactor = await provision(descriptor("dispatch"));
    try {
      expect(reactor.kind).toBe("in-process");
    } finally {
      await reactor.kill();
    }
  });

  it("refuses the remote kind until stage 3", async () => {
    await expect(provision({ kind: "remote", name: "far" })).rejects.toThrow(
      /NotImplemented/,
    );
  });

  it("refuses the worker kind where SharedWorker does not exist", async () => {
    await expect(provision({ kind: "worker", name: "w" })).rejects.toThrow(
      /SharedWorker is not available/,
    );
  });
});
