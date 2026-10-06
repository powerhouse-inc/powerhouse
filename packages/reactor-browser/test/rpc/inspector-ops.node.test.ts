import {
  INSPECTOR_OPS,
  READ_ONLY_ACCESS,
  ReactorInspector,
  type InspectorAccess,
  type ISyncAdmin,
  type ISyncInspector,
} from "@powerhousedao/reactor";
import {
  MessageRouter,
  toErrorInfo,
  type IRpcTransport,
  type OwnerMessage,
  type RpcMessage,
} from "@powerhousedao/reactor/rpc";
import { describe, expect, it, vi } from "vitest";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import {
  dispatchInspectorOp,
  dispatchSyncInspectionOp,
  isSyncInspectionOp,
} from "../../src/rpc/inspector-ops.js";
import { createInspectorProxy } from "../../src/rpc/inspector-proxy.js";
import { SyncManagerProxy } from "../../src/rpc/sync-manager-proxy.js";

type Handler = (method: string, args: unknown[]) => Promise<unknown>;

// A router whose far end answers inspector-op and sync-op through `handlers`.
function loopback(handlers: { inspector?: Handler; sync?: Handler }) {
  const listeners = new Set<(m: OwnerMessage) => void>();
  const deliver = (m: OwnerMessage) => {
    for (const l of [...listeners]) l(m);
  };
  const transport: IRpcTransport = {
    post: (m: RpcMessage) => {
      const handler =
        m.k === "inspector-op"
          ? handlers.inspector
          : m.k === "sync-op"
            ? handlers.sync
            : undefined;
      if (!handler || (m.k !== "inspector-op" && m.k !== "sync-op")) return;
      handler(m.method, m.args).then(
        (value) => deliver({ k: "res", id: m.id, value }),
        (error: unknown) =>
          deliver({ k: "err", id: m.id, error: toErrorInfo(error) }),
      );
    },
    onMessage: (l) => {
      listeners.add(l as (m: OwnerMessage) => void);
      return () => listeners.delete(l as (m: OwnerMessage) => void);
    },
    close: () => {},
  };
  const router = new MessageRouter();
  router.attach(transport);
  return router;
}

function inspectorHost(access: InspectorAccess, queryDb = vi.fn()) {
  const inspector = new ReactorInspector({
    queue: {
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(() => Promise.resolve()),
      getPendingJobs: () => [],
      getExecutingJobIds: () => new Map(),
      getJob: () => undefined,
    },
    facts: { access, syncChannels: ["gql"] },
  });
  return {
    inspector,
    queryDb,
    handler: (method: string, args: unknown[]) =>
      dispatchInspectorOp(
        { inspector, dbQuery: { queryDb } },
        access,
        method,
        args,
      ),
  };
}

describe("inspector RPC", () => {
  it("proxies every op in the table", () => {
    const proxy = createInspectorProxy(loopback({}));
    for (const key of Object.keys(INSPECTOR_OPS)) {
      expect(typeof (proxy as unknown as Record<string, unknown>)[key]).toBe(
        "function",
      );
    }
  });

  it("serves reads to a read-only host", async () => {
    const host = inspectorHost(READ_ONLY_ACCESS);
    const proxy = createInspectorProxy(loopback({ inspector: host.handler }));
    await expect(proxy.info()).resolves.toMatchObject({
      syncChannels: ["gql"],
      access: { admin: false, sql: false },
    });
    await expect(proxy.getStorageHealth()).resolves.toMatchObject({
      tracked: false,
    });
  });

  it("refuses admin ops unless the host grants admin", async () => {
    const host = inspectorHost(READ_ONLY_ACCESS);
    const proxy = createInspectorProxy(loopback({ inspector: host.handler }));
    await expect(proxy.pauseQueue()).rejects.toThrow(/admin-tier/);
    const queue = (await proxy.getQueueState()).isPaused;
    expect(queue).toBe(false);
  });

  it("refuses sql to an admin-only host", async () => {
    const host = inspectorHost({ admin: true, sql: false });
    const proxy = createInspectorProxy(loopback({ inspector: host.handler }));
    await expect(proxy.queryReactorDb("select 1")).rejects.toThrow(/sql-tier/);
    expect(host.queryDb).not.toHaveBeenCalled();
    await expect(proxy.pauseQueue()).resolves.toBeUndefined();
  });

  it("runs sql when granted, with params defaulting to []", async () => {
    const host = inspectorHost(
      { admin: true, sql: true },
      vi.fn(() => Promise.resolve([{ one: 1 }])),
    );
    const proxy = createInspectorProxy(loopback({ inspector: host.handler }));
    await expect(proxy.queryReactorDb("select 1")).resolves.toEqual([
      { one: 1 },
    ]);
    expect(host.queryDb).toHaveBeenCalledWith("select 1", []);
  });

  it("refuses a method the table does not name", async () => {
    const host = inspectorHost({ admin: true, sql: true });
    await expect(host.handler("queue.drop", [])).rejects.toThrow(
      /Unknown inspector op/,
    );
  });
});

describe("sync inspection RPC", () => {
  const inspection = {
    remoteName: "r",
    remoteId: "id",
  };
  function syncHost(access: InspectorAccess) {
    const listDeadLetters = vi.fn((remoteName: string) =>
      Promise.resolve({ remoteName, results: [] }),
    );
    const resetChannel = vi.fn(() => Promise.resolve());
    const inspector: ISyncInspector = {
      inspectRemote: vi.fn(() => Promise.resolve(inspection as never)),
      inspectRemotes: vi.fn(() => Promise.resolve([inspection as never])),
      listDeadLetters,
    };
    const admin: ISyncAdmin = {
      resetChannel,
      requeueDeadLetter: vi.fn(() => Promise.resolve()),
      clearDeadLetter: vi.fn(() => Promise.resolve()),
    };
    const handler: Handler = (method, args) => {
      if (isSyncInspectionOp(method)) {
        return dispatchSyncInspectionOp(
          { inspector, admin },
          access,
          method,
          args,
        );
      }
      return Promise.resolve(method === "list" ? [] : undefined);
    };
    return { listDeadLetters, resetChannel, handler };
  }

  function proxyFor(handler: Handler) {
    const router = loopback({ sync: handler });
    return new SyncManagerProxy(router, createReactorEventBusProxy(router));
  }

  it("carries the read half to a read-only host", async () => {
    const host = syncHost(READ_ONLY_ACCESS);
    const proxy = proxyFor(host.handler);
    await expect(proxy.inspectRemotes()).resolves.toEqual([inspection]);
    await expect(proxy.listDeadLetters("r", "5", 10)).resolves.toEqual({
      remoteName: "r",
      results: [],
    });
    expect(host.listDeadLetters).toHaveBeenCalledWith("r", "5", 10);
  });

  it("refuses repair levers unless the host grants admin", async () => {
    const readOnly = syncHost(READ_ONLY_ACCESS);
    await expect(proxyFor(readOnly.handler).resetChannel("r")).rejects.toThrow(
      /admin-tier/,
    );
    expect(readOnly.resetChannel).not.toHaveBeenCalled();

    const admin = syncHost({ admin: true, sql: false });
    await proxyFor(admin.handler).resetChannel("r");
    expect(admin.resetChannel).toHaveBeenCalledWith("r");
  });

  it("leaves the orchestration ops to the host's own dispatch", () => {
    expect(isSyncInspectionOp("list")).toBe(false);
    expect(isSyncInspectionOp("inspect.remote")).toBe(true);
  });
});
