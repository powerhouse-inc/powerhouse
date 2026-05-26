/**
 * Parent-side IPC wrapper around a single executor worker.
 *
 * Implements {@link IExecutorWorker} on top of an injectable
 * {@link IWorkerTransport}. The handle owns one worker's lifecycle (init ->
 * ready -> execute/result rounds -> abort/shutdown -> terminate) and bounds
 * its in-flight slot to a single job — `SimpleJobExecutor` is single-threaded
 * inside the worker, and concurrent dispatches would race its caches.
 *
 * @see Executor Worker Pool Design wiki page
 *   (Powerhouse board wiki id: d400d711-f07e-4389-a226-4e9fdd4fa8ba)
 */

import type { ILogger } from "document-model";
import { randomUUID } from "node:crypto";
import type {
  IExecutorWorker,
  WorkerExecutionOutcome,
  WorkerInFlightSnapshot,
} from "../interfaces.js";
import type { Job } from "../../queue/types.js";
import { fromErrorInfo } from "./error-info.js";
import {
  WorkerAbortTimeoutError,
  WorkerBusyError,
  WorkerExitedError,
  WorkerInitFailedError,
  WorkerLoadModelFailedError,
  WorkerShutdownTimeoutError,
} from "./errors.js";
import type { ForwardingPoolInstrumentation } from "../../storage/pool-instrumentation.js";
import type {
  DbConfig,
  HeartbeatMessage,
  LogMessage,
  MetricsMessage,
  ModelLoadFailedMessage,
  ModelLoadedMessage,
  ModelManifestEntry,
  PoolAcquireSamplesMessage,
  ResultMessage,
  SignatureVerifierSpec,
  WorkerMessage,
  WorkerPoolConfig,
} from "./protocol.js";
import type { IWorkerTransport, WorkerTransportListener } from "./transport.js";

const DEFAULT_ABORT_GRACE_MS = 5_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;

/**
 * Payload the parent ships in the `init` message (everything except the
 * envelope fields the handle fills in itself).
 */
export type WorkerInitPayload = {
  poolConfig: WorkerPoolConfig;
  db: DbConfig;
  signatureVerifier: SignatureVerifierSpec;
  models: ModelManifestEntry[];
};

export type WorkerHandleOptions = {
  workerId: string;
  index: number;
  transport: IWorkerTransport;
  initPayload: WorkerInitPayload;
  logger: ILogger;
  /** Grace period before an outstanding `abort` escalates to terminate. */
  abortGraceMs?: number;
  /** Default grace period applied to graceful `shutdown` when not overridden. */
  defaultShutdownGraceMs?: number;
  /**
   * Forwarding instrumentation the host registers per worker. The handle
   * pumps `pool-acquire-samples` messages into this object so the host's
   * OpenTelemetry instrumentation records acquire-wait latencies as if the
   * worker's pool were local.
   */
  poolInstrumentation?: ForwardingPoolInstrumentation;
};

type PendingEntry =
  | {
      kind: "init";
      resolve: () => void;
      reject: (err: Error) => void;
    }
  | {
      kind: "execute";
      jobId: string;
      resolve: (outcome: WorkerExecutionOutcome) => void;
      reject: (err: Error) => void;
    }
  | {
      kind: "shutdown";
      resolve: () => void;
      reject: (err: Error) => void;
    }
  | {
      kind: "load-model";
      documentType: string;
      version: string;
      resolve: () => void;
      reject: (err: Error) => void;
    };

type Phase = "fresh" | "starting" | "ready" | "shutting-down" | "terminated";

export class WorkerHandle implements IExecutorWorker {
  readonly workerId: string;
  readonly index: number;

  private readonly transport: IWorkerTransport;
  private readonly initPayload: WorkerInitPayload;
  private readonly logger: ILogger;
  private readonly abortGraceMs: number;
  private readonly defaultShutdownGraceMs: number;
  private readonly poolInstrumentation?: ForwardingPoolInstrumentation;

  private readonly pending = new Map<string, PendingEntry>();
  private inFlight: { correlationId: string; jobId: string } | null = null;
  private phase: Phase = "fresh";
  private lastExitError: Error | null = null;
  private lastCorrelationId: string | null = null;
  private abortTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastMetrics: {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    timestamp: number;
  } | null = null;

  private readonly onMessage: WorkerTransportListener<"message">;
  private readonly onError: WorkerTransportListener<"error">;
  private readonly onExit: WorkerTransportListener<"exit">;

  constructor(options: WorkerHandleOptions) {
    this.workerId = options.workerId;
    this.index = options.index;
    this.transport = options.transport;
    this.initPayload = options.initPayload;
    this.logger = options.logger;
    this.abortGraceMs = options.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS;
    this.defaultShutdownGraceMs =
      options.defaultShutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
    this.poolInstrumentation = options.poolInstrumentation;

    this.onMessage = (msg) => this.handleMessage(msg);
    this.onError = (err) => this.handleTransportError(err);
    this.onExit = (code) => this.handleExit(code);

    this.transport.on("message", this.onMessage);
    this.transport.on("error", this.onError);
    this.transport.on("exit", this.onExit);
  }

  public async start(): Promise<void> {
    if (this.phase !== "fresh") {
      throw new WorkerInitFailedError(
        this.workerId,
        `cannot start worker in phase ${this.phase}`,
      );
    }
    this.phase = "starting";
    const correlationId = this.nextCorrelationId();
    const ready = new Promise<void>((resolve, reject) => {
      this.pending.set(correlationId, {
        kind: "init",
        resolve,
        reject,
      });
    });
    this.transport.postMessage({
      type: "init",
      correlationId,
      workerId: this.workerId,
      poolConfig: this.initPayload.poolConfig,
      db: this.initPayload.db,
      signatureVerifier: this.initPayload.signatureVerifier,
      models: this.initPayload.models,
    });
    await ready;
    this.phase = "ready";
  }

  public execute(
    job: Job,
    signal?: AbortSignal,
  ): Promise<WorkerExecutionOutcome> {
    if (this.phase === "terminated") {
      return Promise.reject(
        this.lastExitError ??
          new WorkerExitedError(this.workerId, -1, this.lastCorrelationId),
      );
    }
    if (this.phase !== "ready") {
      return Promise.reject(
        new WorkerInitFailedError(
          this.workerId,
          `worker not ready (phase=${this.phase})`,
        ),
      );
    }
    if (this.inFlight !== null) {
      return Promise.reject(new WorkerBusyError(this.workerId, job.id));
    }

    const correlationId = this.nextCorrelationId();
    this.lastCorrelationId = correlationId;
    this.inFlight = { correlationId, jobId: job.id };

    let abortListener: (() => void) | null = null;
    const detachSignal = () => {
      if (signal && abortListener) {
        signal.removeEventListener("abort", abortListener);
        abortListener = null;
      }
    };

    const promise = new Promise<WorkerExecutionOutcome>((resolve, reject) => {
      this.pending.set(correlationId, {
        kind: "execute",
        jobId: job.id,
        resolve: (outcome) => {
          detachSignal();
          resolve(outcome);
        },
        reject: (err) => {
          detachSignal();
          reject(err);
        },
      });
    });

    if (signal) {
      if (signal.aborted) {
        this.abort(correlationId, "aborted before dispatch");
      } else {
        abortListener = () => this.abort(correlationId, "caller signal");
        signal.addEventListener("abort", abortListener, { once: true });
      }
    }

    this.transport.postMessage({
      type: "execute",
      correlationId,
      job,
    });

    return promise;
  }

  public abort(correlationId: string, reason?: string): void {
    if (this.phase === "terminated") {
      return;
    }
    if (!this.inFlight || this.inFlight.correlationId !== correlationId) {
      return;
    }
    if (this.abortTimer) {
      return;
    }
    this.transport.postMessage({
      type: "abort",
      correlationId: this.nextCorrelationId(),
      targetCorrelationId: correlationId,
      reason,
    });
    this.abortTimer = setTimeout(() => {
      this.abortTimer = null;
      const entry = this.pending.get(correlationId);
      if (!entry || entry.kind !== "execute") {
        return;
      }
      const err = new WorkerAbortTimeoutError(
        this.workerId,
        correlationId,
        this.abortGraceMs,
      );
      this.failPending(correlationId, err);
      this.inFlight = null;
      void this.forceTerminate(err);
    }, this.abortGraceMs);
  }

  public async shutdown(graceful: boolean, graceMs?: number): Promise<void> {
    if (this.phase === "terminated") {
      return;
    }
    if (!graceful) {
      this.phase = "shutting-down";
      await this.forceTerminate(null);
      return;
    }

    const effectiveGrace = graceMs ?? this.defaultShutdownGraceMs;
    this.phase = "shutting-down";
    const correlationId = this.nextCorrelationId();
    const drained = new Promise<void>((resolve, reject) => {
      this.pending.set(correlationId, {
        kind: "shutdown",
        resolve,
        reject,
      });
    });
    this.transport.postMessage({
      type: "shutdown",
      correlationId,
      graceMs: effectiveGrace,
    });

    let timer!: NodeJS.Timeout;
    const timeout = new Promise<void>((_, reject) => {
      timer = setTimeout(() => {
        reject(new WorkerShutdownTimeoutError(this.workerId, effectiveGrace));
      }, effectiveGrace);
    });

    try {
      await Promise.race([drained, timeout]);
    } catch (err) {
      this.logger.warn(
        `worker ${this.workerId} shutdown timed out after ${effectiveGrace}ms`,
        err,
      );
    } finally {
      clearTimeout(timer);
    }

    await this.forceTerminate(null);
  }

  public loadModel(
    entry: ModelManifestEntry,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.phase === "terminated") {
      return Promise.reject(
        this.lastExitError ??
          new WorkerExitedError(this.workerId, -1, this.lastCorrelationId),
      );
    }
    if (this.phase !== "ready") {
      return Promise.reject(
        new WorkerInitFailedError(
          this.workerId,
          `worker not ready (phase=${this.phase})`,
        ),
      );
    }

    const correlationId = this.nextCorrelationId();
    let abortListener: (() => void) | null = null;
    const detachSignal = () => {
      if (signal && abortListener) {
        signal.removeEventListener("abort", abortListener);
        abortListener = null;
      }
    };

    const promise = new Promise<void>((resolve, reject) => {
      this.pending.set(correlationId, {
        kind: "load-model",
        documentType: entry.documentType,
        version: entry.version,
        resolve: () => {
          detachSignal();
          resolve();
        },
        reject: (err) => {
          detachSignal();
          reject(err);
        },
      });
    });

    if (signal) {
      if (signal.aborted) {
        this.failPending(
          correlationId,
          new WorkerLoadModelFailedError(
            this.workerId,
            entry.documentType,
            entry.version,
            "aborted before dispatch",
          ),
        );
        return promise;
      }
      abortListener = () => {
        this.failPending(
          correlationId,
          new WorkerLoadModelFailedError(
            this.workerId,
            entry.documentType,
            entry.version,
            "caller signal",
          ),
        );
      };
      signal.addEventListener("abort", abortListener, { once: true });
    }

    this.transport.postMessage({
      type: "load-model",
      correlationId,
      model: entry,
    });

    return promise;
  }

  public isIdle(): boolean {
    return this.inFlight === null && this.phase === "ready";
  }

  public getInFlight(): WorkerInFlightSnapshot | null {
    if (!this.inFlight) {
      return null;
    }
    return {
      correlationId: this.inFlight.correlationId,
      jobId: this.inFlight.jobId,
    };
  }

  private nextCorrelationId(): string {
    return randomUUID();
  }

  private handleMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case "ready":
        this.handleReady(msg.correlationId);
        return;
      case "result":
        this.handleResult(msg);
        return;
      case "model-loaded":
        this.handleModelLoaded(msg);
        return;
      case "model-load-failed":
        this.handleModelLoadFailed(msg);
        return;
      case "log":
        this.handleLog(msg);
        return;
      case "heartbeat":
        this.handleHeartbeat(msg);
        return;
      case "metrics":
        this.handleMetrics(msg);
        return;
      case "pool-acquire-samples":
        this.handlePoolAcquireSamples(msg);
        return;
      default: {
        const exhaustive: never = msg;
        void exhaustive;
      }
    }
  }

  private handlePoolAcquireSamples(msg: PoolAcquireSamplesMessage): void {
    if (!this.poolInstrumentation) {
      return;
    }
    this.poolInstrumentation.updateStats({
      size: msg.size,
      idle: msg.idle,
      waiting: msg.waiting,
    });
    this.poolInstrumentation.pushSamples(msg.durations);
  }

  private handleReady(correlationId: string): void {
    const entry = this.pending.get(correlationId);
    if (!entry || entry.kind !== "init") {
      return;
    }
    this.pending.delete(correlationId);
    entry.resolve();
  }

  private handleResult(msg: ResultMessage): void {
    const entry = this.pending.get(msg.correlationId);
    if (!entry || entry.kind !== "execute") {
      return;
    }
    this.pending.delete(msg.correlationId);
    if (this.inFlight?.correlationId === msg.correlationId) {
      this.inFlight = null;
    }
    if (this.abortTimer) {
      clearTimeout(this.abortTimer);
      this.abortTimer = null;
    }

    const outcome: WorkerExecutionOutcome = msg.error
      ? {
          result: {
            ...msg.result,
            success: false,
            error: fromErrorInfo(msg.error),
          },
        }
      : {
          result: msg.result,
          writeReady: msg.writeReady,
        };
    entry.resolve(outcome);

    if (this.phase === "shutting-down") {
      const shutdownEntry = [...this.pending.values()].find(
        (e) => e.kind === "shutdown",
      );
      if (shutdownEntry) {
        shutdownEntry.resolve();
      }
    }
  }

  private handleModelLoaded(msg: ModelLoadedMessage): void {
    const entry = this.pending.get(msg.correlationId);
    if (!entry || entry.kind !== "load-model") {
      return;
    }
    this.pending.delete(msg.correlationId);
    entry.resolve();
  }

  private handleModelLoadFailed(msg: ModelLoadFailedMessage): void {
    const entry = this.pending.get(msg.correlationId);
    if (!entry || entry.kind !== "load-model") {
      return;
    }
    this.pending.delete(msg.correlationId);
    entry.reject(
      new WorkerLoadModelFailedError(
        this.workerId,
        msg.documentType,
        msg.version,
        msg.error.message,
        { cause: fromErrorInfo(msg.error) },
      ),
    );
  }

  private handleLog(msg: LogMessage): void {
    const args = msg.args;
    switch (msg.level) {
      case "debug":
        this.logger.debug(msg.message, ...args);
        return;
      case "info":
        this.logger.info(msg.message, ...args);
        return;
      case "warn":
        this.logger.warn(msg.message, ...args);
        return;
      case "error":
        this.logger.error(msg.message, ...args);
        return;
      default: {
        const exhaustive: never = msg.level;
        void exhaustive;
      }
    }
  }

  private handleHeartbeat(msg: HeartbeatMessage): void {
    this.lastHeartbeatAt = msg.timestamp;
  }

  private handleMetrics(msg: MetricsMessage): void {
    this.lastMetrics = {
      counters: msg.counters,
      gauges: msg.gauges,
      timestamp: msg.timestamp,
    };
  }

  private handleTransportError(err: Error): void {
    this.logger.error(
      `worker ${this.workerId} transport error: ${err.message}`,
      err,
    );
  }

  private handleExit(code: number): void {
    if (this.phase === "terminated") {
      return;
    }
    const wasGraceful = this.phase === "shutting-down" && code === 0;
    this.phase = "terminated";
    const err = wasGraceful
      ? null
      : new WorkerExitedError(this.workerId, code, this.lastCorrelationId);
    this.lastExitError = err;
    if (this.abortTimer) {
      clearTimeout(this.abortTimer);
      this.abortTimer = null;
    }
    this.detachTransportListeners();
    this.drainPending(err);
    this.inFlight = null;
  }

  private detachTransportListeners(): void {
    this.transport.off("message", this.onMessage);
    this.transport.off("error", this.onError);
    this.transport.off("exit", this.onExit);
  }

  private drainPending(err: Error | null): void {
    for (const [, entry] of this.pending) {
      if (err) {
        entry.reject(err);
      } else if (entry.kind === "shutdown") {
        entry.resolve();
      } else if (entry.kind === "init") {
        entry.reject(new WorkerInitFailedError(this.workerId, "worker exited"));
      } else if (entry.kind === "load-model") {
        entry.reject(
          new WorkerLoadModelFailedError(
            this.workerId,
            entry.documentType,
            entry.version,
            "worker exited before responding",
          ),
        );
      } else {
        entry.reject(
          new WorkerExitedError(this.workerId, 0, this.lastCorrelationId),
        );
      }
    }
    this.pending.clear();
  }

  private failPending(correlationId: string, err: Error): void {
    const entry = this.pending.get(correlationId);
    if (!entry) {
      return;
    }
    this.pending.delete(correlationId);
    entry.reject(err);
  }

  private async forceTerminate(reason: Error | null): Promise<void> {
    if (this.phase === "terminated") {
      return;
    }
    try {
      await this.transport.terminate();
    } catch (err) {
      this.logger.warn(
        `worker ${this.workerId} terminate threw: ${(err as Error).message}`,
      );
    }
    const phaseAfter = this.phase as Phase;
    if (phaseAfter === "terminated") {
      return;
    }
    this.phase = "terminated";
    this.lastExitError = reason;
    this.detachTransportListeners();
    this.drainPending(reason);
    this.inFlight = null;
  }
}
