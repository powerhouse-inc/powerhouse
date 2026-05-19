import type {
  ParentMessage,
  WorkerMessage,
} from "../../../src/executor/worker/protocol.js";
import type {
  IWorkerTransport,
  WorkerTransportEvent,
  WorkerTransportEventMap,
  WorkerTransportListener,
} from "../../../src/executor/worker/transport.js";

type Listeners = {
  message: Set<WorkerTransportListener<"message">>;
  error: Set<WorkerTransportListener<"error">>;
  exit: Set<WorkerTransportListener<"exit">>;
};

export type FakeWorkerOptions = {
  /** When true, auto-replies `ready` to any `init` message. */
  autoReady?: boolean;
  /** When true, auto-replies `result` (success) to any `execute` message. */
  autoExecute?: boolean;
  /** When true, auto-replies `result` to any `abort` message (cancelled). */
  autoAbort?: boolean;
  /** When true, exits with code 0 in response to a `shutdown` message. */
  autoShutdown?: boolean;
};

/**
 * In-memory implementation of {@link IWorkerTransport} for unit tests.
 *
 * Test code uses `emitToParent` to push messages back to the handle and the
 * `getSentMessages` helper to inspect what the handle posted.
 */
export class FakeWorkerTransport implements IWorkerTransport {
  private readonly sent: ParentMessage[] = [];
  private readonly listeners: Listeners = {
    message: new Set(),
    error: new Set(),
    exit: new Set(),
  };
  private terminated = false;
  public terminateCalls = 0;

  constructor(private readonly options: FakeWorkerOptions = {}) {}

  postMessage(message: ParentMessage): void {
    if (this.terminated) {
      return;
    }
    this.sent.push(message);
    queueMicrotask(() => this.handleAutoResponses(message));
  }

  on<E extends WorkerTransportEvent>(
    event: E,
    listener: WorkerTransportListener<E>,
  ): void {
    (this.listeners[event] as Set<WorkerTransportListener<E>>).add(listener);
  }

  off<E extends WorkerTransportEvent>(
    event: E,
    listener: WorkerTransportListener<E>,
  ): void {
    (this.listeners[event] as Set<WorkerTransportListener<E>>).delete(listener);
  }

  terminate(): Promise<number> {
    this.terminateCalls += 1;
    if (this.terminated) {
      return Promise.resolve(0);
    }
    this.terminated = true;
    queueMicrotask(() => this.emit("exit", 0));
    return Promise.resolve(0);
  }

  // --- test helpers ---

  getSentMessages(): readonly ParentMessage[] {
    return this.sent;
  }

  getLastSent(): ParentMessage | undefined {
    return this.sent[this.sent.length - 1];
  }

  emitToParent(message: WorkerMessage): void {
    this.emit("message", message);
  }

  simulateError(err: Error): void {
    this.emit("error", err);
  }

  simulateExit(code: number): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.emit("exit", code);
  }

  listenerCount(event: WorkerTransportEvent): number {
    return this.listeners[event].size;
  }

  private emit<E extends WorkerTransportEvent>(
    event: E,
    payload: WorkerTransportEventMap[E],
  ): void {
    for (const listener of [...this.listeners[event]]) {
      (listener as (p: WorkerTransportEventMap[E]) => void)(payload);
    }
  }

  private handleAutoResponses(msg: ParentMessage): void {
    if (msg.type === "init" && this.options.autoReady) {
      this.emit("message", {
        type: "ready",
        correlationId: msg.correlationId,
        workerId: msg.workerId,
      });
      return;
    }
    if (msg.type === "execute" && this.options.autoExecute) {
      this.emit("message", {
        type: "result",
        correlationId: msg.correlationId,
        result: {
          job: msg.job,
          success: true,
          operations: [],
        },
      });
      return;
    }
    if (msg.type === "abort" && this.options.autoAbort) {
      this.emit("message", {
        type: "result",
        correlationId: msg.targetCorrelationId,
        result: {
          job: { id: "aborted" } as never,
          success: false,
        },
        error: { name: "AbortError", message: msg.reason ?? "aborted" },
      });
      return;
    }
    if (msg.type === "shutdown" && this.options.autoShutdown) {
      this.simulateExit(0);
    }
  }
}
