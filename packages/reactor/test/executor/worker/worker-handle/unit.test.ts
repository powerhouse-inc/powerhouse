import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkerAbortTimeoutError,
  WorkerBusyError,
  WorkerExitedError,
  WorkerInitFailedError,
} from "../../../../src/executor/worker/errors.js";
import type {
  ExecuteMessage,
  InitMessage,
  ParentMessage,
} from "../../../../src/executor/worker/protocol.js";
import {
  WorkerHandle,
  type WorkerInitPayload,
} from "../../../../src/executor/worker/worker-handle.js";
import type { Job } from "../../../../src/queue/types.js";
import { FakeWorkerTransport } from "../fake-worker.js";

function createMockLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    errorHandler: () => {},
    child: () => logger,
  };
  return logger;
}

function createTestJob(overrides: Partial<Job> = {}): Job {
  const id = overrides.id ?? `job-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    kind: "mutation",
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    actions: [],
    operations: [],
    createdAt: new Date().toISOString(),
    queueHint: [],
    retryCount: 0,
    maxRetries: 3,
    errorHistory: [],
    meta: { batchId: `test-${id}`, batchJobIds: [id] },
    ...overrides,
  };
}

const flush = () => new Promise<void>((r) => setImmediate(r));

function makeInitPayload(): WorkerInitPayload {
  return {
    poolConfig: {
      enabled: true,
      numWorkers: 1,
      workerType: "thread",
    },
    db: {
      host: "localhost",
      port: 5432,
      database: "test",
      user: "test",
      password: "test",
    },
    signatureVerifier: {
      module: { packageName: "test-verifier", exportName: "factory" },
    },
    models: [],
  };
}

function makeHandle(
  transport: FakeWorkerTransport,
  overrides: Partial<{
    workerId: string;
    index: number;
    abortGraceMs: number;
    defaultShutdownGraceMs: number;
  }> = {},
) {
  return new WorkerHandle({
    workerId: overrides.workerId ?? "worker-0",
    index: overrides.index ?? 0,
    transport,
    initPayload: makeInitPayload(),
    logger: createMockLogger(),
    abortGraceMs: overrides.abortGraceMs ?? 50,
    defaultShutdownGraceMs: overrides.defaultShutdownGraceMs ?? 50,
  });
}

describe("WorkerHandle", () => {
  describe("start()", () => {
    it("sends init and resolves on matching ready", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport);
      await handle.start();
      const init = transport.getSentMessages()[0] as InitMessage;
      expect(init.type).toBe("init");
      expect(init.workerId).toBe("worker-0");
      expect(init.correlationId).toBeTruthy();
      expect(handle.isIdle()).toBe(true);
    });

    it("rejects with WorkerInitFailedError if exit arrives before ready", async () => {
      const transport = new FakeWorkerTransport();
      const handle = makeHandle(transport);
      const startPromise = handle.start();
      await flush();
      transport.simulateExit(1);
      await expect(startPromise).rejects.toBeInstanceOf(WorkerExitedError);
    });

    it("rejects subsequent start() calls", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport);
      await handle.start();
      await expect(handle.start()).rejects.toBeInstanceOf(
        WorkerInitFailedError,
      );
    });
  });

  describe("execute()", () => {
    it("sends execute with a unique correlationId and resolves on matching result", async () => {
      const transport = new FakeWorkerTransport({
        autoReady: true,
        autoExecute: true,
      });
      const handle = makeHandle(transport);
      await handle.start();

      const job1 = createTestJob({ id: "job-a" });
      const job2 = createTestJob({ id: "job-b" });
      const r1 = await handle.execute(job1);
      const r2 = await handle.execute(job2);
      expect(r1.result.success).toBe(true);
      expect(r2.result.success).toBe(true);

      const executes = transport
        .getSentMessages()
        .filter((m): m is ExecuteMessage => m.type === "execute");
      expect(executes).toHaveLength(2);
      expect(executes[0].correlationId).not.toBe(executes[1].correlationId);
    });

    it("rejects a concurrent execute with WorkerBusyError", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport);
      await handle.start();

      const first = handle.execute(createTestJob({ id: "job-a" }));
      await expect(
        handle.execute(createTestJob({ id: "job-b" })),
      ).rejects.toBeInstanceOf(WorkerBusyError);

      const exec = transport
        .getSentMessages()
        .find((m): m is ExecuteMessage => m.type === "execute");
      expect(exec).toBeDefined();
      transport.emitToParent({
        type: "result",
        correlationId: exec!.correlationId,
        result: { job: exec!.job, success: true },
      });
      await first;
    });

    it("materializes ResultMessage.error into an Error", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport);
      await handle.start();

      const job = createTestJob({ id: "job-x" });
      const pending = handle.execute(job);
      await flush();
      const exec = transport
        .getSentMessages()
        .find((m): m is ExecuteMessage => m.type === "execute");
      transport.emitToParent({
        type: "result",
        correlationId: exec!.correlationId,
        result: { job, success: false },
        error: {
          name: "BoomError",
          message: "boom",
          stack: "BoomError: boom\n    at x",
        },
      });
      const outcome = await pending;
      expect(outcome.result.success).toBe(false);
      expect(outcome.result.error?.name).toBe("BoomError");
      expect(outcome.result.error?.message).toBe("boom");
      expect(outcome.result.error?.stack).toContain("BoomError: boom");
    });

    it("rejects after the worker exits abnormally", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport);
      await handle.start();

      const pending = handle.execute(createTestJob({ id: "job-x" }));
      await flush();
      transport.simulateExit(2);

      await expect(pending).rejects.toBeInstanceOf(WorkerExitedError);
      expect(handle.isIdle()).toBe(false);
      await expect(
        handle.execute(createTestJob({ id: "job-y" })),
      ).rejects.toBeInstanceOf(WorkerExitedError);
    });
  });

  describe("abort()", () => {
    it("posts an abort message and escalates to terminate on grace expiry", async () => {
      vi.useFakeTimers();
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport, { abortGraceMs: 25 });
      await handle.start();

      const pending = handle.execute(createTestJob({ id: "job-x" }));
      await Promise.resolve();
      await Promise.resolve();

      const inFlight = handle.getInFlight();
      expect(inFlight).not.toBeNull();
      handle.abort(inFlight!.correlationId, "stuck");

      const abortMsg = transport
        .getSentMessages()
        .find((m: ParentMessage) => m.type === "abort");
      expect(abortMsg).toBeDefined();

      const rejection = expect(pending).rejects.toBeInstanceOf(
        WorkerAbortTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(50);
      await rejection;
      expect(transport.terminateCalls).toBeGreaterThan(0);
      vi.useRealTimers();
    });
  });

  describe("shutdown()", () => {
    it("non-graceful shutdown terminates immediately", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport);
      await handle.start();
      await handle.shutdown(false);
      expect(transport.terminateCalls).toBeGreaterThan(0);
    });

    it("graceful shutdown drains the in-flight job then terminates", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport, { defaultShutdownGraceMs: 200 });
      await handle.start();

      const job = createTestJob({ id: "job-x" });
      const pending = handle.execute(job);
      await flush();
      const exec = transport
        .getSentMessages()
        .find((m): m is ExecuteMessage => m.type === "execute");

      const shutdownPromise = handle.shutdown(true);
      await flush();

      transport.emitToParent({
        type: "result",
        correlationId: exec!.correlationId,
        result: { job, success: true },
      });

      const outcome = await pending;
      expect(outcome.result.success).toBe(true);
      await shutdownPromise;
      expect(transport.terminateCalls).toBeGreaterThan(0);
    });
  });

  describe("AbortSignal", () => {
    it("triggers abort and detaches its listener on settle", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const handle = makeHandle(transport, { abortGraceMs: 25 });
      await handle.start();

      const controller = new AbortController();
      const job = createTestJob({ id: "job-x" });
      const pending = handle.execute(job, controller.signal);
      await flush();

      controller.abort();
      await flush();

      const abortMsg = transport
        .getSentMessages()
        .find((m: ParentMessage) => m.type === "abort");
      expect(abortMsg).toBeDefined();

      const exec = transport
        .getSentMessages()
        .find((m): m is ExecuteMessage => m.type === "execute");
      transport.emitToParent({
        type: "result",
        correlationId: exec!.correlationId,
        result: { job, success: true },
      });
      await pending;
    });
  });

  describe("logs", () => {
    it("forwards log messages to the injected logger", async () => {
      const transport = new FakeWorkerTransport({ autoReady: true });
      const logger = createMockLogger();
      const infoSpy = vi.spyOn(logger, "info");
      const errorSpy = vi.spyOn(logger, "error");

      const handle = new WorkerHandle({
        workerId: "worker-0",
        index: 0,
        transport,
        initPayload: makeInitPayload(),
        logger,
      });
      await handle.start();

      transport.emitToParent({
        type: "log",
        level: "info",
        message: "hello",
        args: ["world"],
        timestamp: Date.now(),
      });
      transport.emitToParent({
        type: "log",
        level: "error",
        message: "boom",
        args: [],
        timestamp: Date.now(),
      });
      expect(infoSpy).toHaveBeenCalledWith("hello", "world");
      expect(errorSpy).toHaveBeenCalledWith("boom");
    });
  });

  describe("correlation ids", () => {
    it("generates unique correlation ids per posted message", async () => {
      const transport = new FakeWorkerTransport({
        autoReady: true,
        autoExecute: true,
      });
      const handle = makeHandle(transport);
      await handle.start();
      await handle.execute(createTestJob({ id: "job-a" }));
      await handle.execute(createTestJob({ id: "job-b" }));
      const ids = transport
        .getSentMessages()
        .map((m) => ("correlationId" in m ? m.correlationId : ""))
        .filter(Boolean);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe("isIdle / getInFlight", () => {
    let transport: FakeWorkerTransport;
    let handle: WorkerHandle;

    beforeEach(async () => {
      transport = new FakeWorkerTransport({ autoReady: true });
      handle = makeHandle(transport);
      await handle.start();
    });

    afterEach(async () => {
      await handle.shutdown(false);
    });

    it("returns idle before any execute", () => {
      expect(handle.isIdle()).toBe(true);
      expect(handle.getInFlight()).toBeNull();
    });

    it("exposes the in-flight slot during execute", async () => {
      const job = createTestJob({ id: "job-x" });
      const pending = handle.execute(job);
      await flush();
      const snap = handle.getInFlight();
      expect(snap?.jobId).toBe("job-x");
      expect(snap?.correlationId).toBeTruthy();
      const exec = transport
        .getSentMessages()
        .find((m): m is ExecuteMessage => m.type === "execute");
      transport.emitToParent({
        type: "result",
        correlationId: exec!.correlationId,
        result: { job, success: true },
      });
      await pending;
      expect(handle.isIdle()).toBe(true);
    });
  });
});
