import type {
  CatchUpStatus,
  IInspector,
  InspectorProcessorInfo,
  IReactorDbQuery,
  QueueStateSnapshot,
  RebuildResult,
  SweepResult,
  ValidationResult,
} from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  dispatchInspectorOp,
  INSPECTOR_OPS,
} from "../../src/rpc/inspector-ops.js";
import { createInspectorProxy } from "../../src/rpc/inspector-proxy.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import type { CorrelationId, RpcMessage } from "../../src/rpc/protocol.js";
import type { IRpcTransport } from "../../src/rpc/transport.js";

const queueState: QueueStateSnapshot = {
  isPaused: true,
  pendingJobs: [],
  executingJobs: [],
  totalPending: 0,
  totalExecuting: 0,
};
const processors: InspectorProcessorInfo[] = [
  {
    processorId: "p1",
    factoryId: "f1",
    driveId: "d1",
    processorIndex: 0,
    lastOrdinal: 4,
    status: "active",
    lastError: undefined,
    lastErrorTimestamp: undefined,
  },
];
const catchUpStatus: CatchUpStatus = {
  watermark: { head: 3, settledThrough: 3, waitingOn: [] },
  consumers: [],
};
const sweeps: SweepResult[] = [];
const validation: ValidationResult = {
  documentId: "doc-1",
  isConsistent: true,
  keyframeIssues: [],
  snapshotIssues: [],
  streamOrderIssues: [],
};
const rebuild: RebuildResult = {
  documentId: "doc-1",
  keyframesDeleted: 0,
  scopesInvalidated: 0,
};

type FakeInspector = {
  [K in keyof IInspector]: ReturnType<typeof vi.fn>;
};

function fakeInspector(): FakeInspector {
  return {
    getQueueState: vi.fn(() => Promise.resolve(queueState)),
    pauseQueue: vi.fn(() => Promise.resolve()),
    resumeQueue: vi.fn(() => Promise.resolve()),
    getProcessors: vi.fn(() => Promise.resolve(processors)),
    retryProcessor: vi.fn(() => Promise.resolve()),
    getCatchUpStatus: vi.fn(() => Promise.resolve(catchUpStatus)),
    sweepCatchUp: vi.fn(() => Promise.resolve(sweeps)),
    validateDocument: vi.fn(() => Promise.resolve(validation)),
    rebuildKeyframes: vi.fn(() => Promise.resolve(rebuild)),
    rebuildSnapshots: vi.fn(() => Promise.resolve(rebuild)),
  };
}

function fakeDb(rows: unknown[] = [{ n: 1 }]): IReactorDbQuery & {
  queryDb: ReturnType<typeof vi.fn>;
} {
  return { queryDb: vi.fn(() => Promise.resolve(rows)) };
}

/**
 * Records the op strings and arg arrays a proxy puts on the wire, and answers
 * every request so the proxy's promise settles.
 */
function recordingRouter(): {
  router: MessageRouter;
  sent: { method: string; args: unknown[] }[];
} {
  const sent: { method: string; args: unknown[] }[] = [];
  let deliver: (message: RpcMessage) => void = () => undefined;
  const transport: IRpcTransport = {
    post: (message) => {
      const msg = message as {
        k: string;
        id: CorrelationId;
        method: string;
        args: unknown[];
      };
      sent.push({ method: msg.method, args: msg.args });
      queueMicrotask(() => deliver({ k: "res", id: msg.id, value: undefined }));
    },
    onMessage: (listener) => {
      deliver = listener;
      return () => {
        deliver = () => undefined;
      };
    },
    close: () => undefined,
  };
  const router = new MessageRouter();
  router.attach(transport);
  return { router, sent };
}

describe("dispatchInspectorOp", () => {
  it("routes every op string to its inspector method", async () => {
    const inspector = fakeInspector();
    const db = fakeDb();
    const call = (method: string, args: unknown[] = []) =>
      dispatchInspectorOp(inspector as unknown as IInspector, db, method, args);

    await expect(call(INSPECTOR_OPS.getQueueState)).resolves.toBe(queueState);
    await expect(call(INSPECTOR_OPS.pauseQueue)).resolves.toBeUndefined();
    await expect(call(INSPECTOR_OPS.resumeQueue)).resolves.toBeUndefined();
    await expect(call(INSPECTOR_OPS.getProcessors)).resolves.toBe(processors);
    await expect(
      call(INSPECTOR_OPS.retryProcessor, ["p1"]),
    ).resolves.toBeUndefined();
    await expect(call(INSPECTOR_OPS.getCatchUpStatus)).resolves.toBe(
      catchUpStatus,
    );
    await expect(call(INSPECTOR_OPS.sweepCatchUp)).resolves.toBe(sweeps);
    await expect(
      call(INSPECTOR_OPS.validateDocument, ["doc-1", "main"]),
    ).resolves.toBe(validation);
    await expect(
      call(INSPECTOR_OPS.rebuildKeyframes, ["doc-1", undefined]),
    ).resolves.toBe(rebuild);
    await expect(
      call(INSPECTOR_OPS.rebuildSnapshots, ["doc-1", "draft"]),
    ).resolves.toBe(rebuild);
    await expect(
      call(INSPECTOR_OPS.queryReactorDb, ["select 1", []]),
    ).resolves.toEqual([{ n: 1 }]);

    expect(inspector.getQueueState).toHaveBeenCalledTimes(1);
    expect(inspector.pauseQueue).toHaveBeenCalledTimes(1);
    expect(inspector.resumeQueue).toHaveBeenCalledTimes(1);
    expect(inspector.getProcessors).toHaveBeenCalledTimes(1);
    expect(inspector.retryProcessor).toHaveBeenCalledWith("p1");
    expect(inspector.getCatchUpStatus).toHaveBeenCalledTimes(1);
    expect(inspector.sweepCatchUp).toHaveBeenCalledTimes(1);
    expect(inspector.validateDocument).toHaveBeenCalledWith("doc-1", "main");
    expect(inspector.rebuildKeyframes).toHaveBeenCalledWith("doc-1", undefined);
    expect(inspector.rebuildSnapshots).toHaveBeenCalledWith("doc-1", "draft");
    expect(db.queryDb).toHaveBeenCalledWith("select 1", []);
  });

  it("keeps the op strings the wire protocol was shipped with", () => {
    expect(INSPECTOR_OPS).toEqual({
      getQueueState: "queue.getState",
      pauseQueue: "queue.pause",
      resumeQueue: "queue.resume",
      getProcessors: "processors.getAll",
      retryProcessor: "processors.retry",
      getCatchUpStatus: "catchUp.status",
      sweepCatchUp: "catchUp.sweepNow",
      validateDocument: "integrity.validate",
      rebuildKeyframes: "integrity.rebuildKeyframes",
      rebuildSnapshots: "integrity.rebuildSnapshots",
      queryReactorDb: "db.query",
    });
  });

  it("resolves void ops to undefined rather than the method's value", async () => {
    const inspector = fakeInspector();
    inspector.pauseQueue.mockReturnValue(Promise.resolve("ignored"));
    inspector.retryProcessor.mockReturnValue(Promise.resolve("ignored"));

    await expect(
      dispatchInspectorOp(
        inspector as unknown as IInspector,
        fakeDb(),
        INSPECTOR_OPS.pauseQueue,
        [],
      ),
    ).resolves.toBeUndefined();
    await expect(
      dispatchInspectorOp(
        inspector as unknown as IInspector,
        fakeDb(),
        INSPECTOR_OPS.retryProcessor,
        ["p1"],
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses db.query without a db capability", async () => {
    await expect(
      dispatchInspectorOp(
        fakeInspector() as unknown as IInspector,
        undefined,
        INSPECTOR_OPS.queryReactorDb,
        ["select 1", []],
      ),
    ).rejects.toThrow("Reactor store not available");
  });

  it("errors on an unknown op", async () => {
    await expect(
      dispatchInspectorOp(
        fakeInspector() as unknown as IInspector,
        fakeDb(),
        "queue.explode",
        [],
      ),
    ).rejects.toThrow("Unknown inspector op: queue.explode");
  });
});

describe("createInspectorProxy", () => {
  it("sends the op strings and arg order the dispatcher expects", async () => {
    const { router, sent } = recordingRouter();
    const proxy = createInspectorProxy(router);

    await proxy.getQueueState();
    await proxy.pauseQueue();
    await proxy.resumeQueue();
    await proxy.getProcessors();
    await proxy.retryProcessor("p1");
    await proxy.getCatchUpStatus();
    await proxy.sweepCatchUp();
    await proxy.validateDocument("doc-1", "main");
    await proxy.rebuildKeyframes("doc-1");
    await proxy.rebuildSnapshots("doc-1", "draft");
    await proxy.queryReactorDb("select 1");

    expect(sent).toEqual([
      { method: "queue.getState", args: [] },
      { method: "queue.pause", args: [] },
      { method: "queue.resume", args: [] },
      { method: "processors.getAll", args: [] },
      { method: "processors.retry", args: ["p1"] },
      { method: "catchUp.status", args: [] },
      { method: "catchUp.sweepNow", args: [] },
      { method: "integrity.validate", args: ["doc-1", "main"] },
      { method: "integrity.rebuildKeyframes", args: ["doc-1", undefined] },
      { method: "integrity.rebuildSnapshots", args: ["doc-1", "draft"] },
      { method: "db.query", args: ["select 1", []] },
    ]);
  });
});
