import type { StagedFile } from "../context/files.js";
import type {
  RecordedListener,
  RecordedSchedule,
} from "../context/trigger.js";
import {
  createForkTransport,
  defaultEntryPath,
  type IPieceWorkerTransport,
  type PieceWorkerTransportFactory,
  type TransportExit,
} from "./transport.js";
import type {
  CheckConnectionRequest,
  DescribePieceRequest,
  HostCallHandlers,
  HostCallMessage,
  HostCallResponse,
  ResolveOptionsRequest,
  RunActionRequest,
  SerializedPieceError,
  TriggerHookRequest,
  WorkerResponse,
} from "./protocol.js";

type WorkerRequestType =
  | "run"
  | "resolve-options"
  | "trigger-hook"
  | "check-connection"
  | "describe";

type WorkerRequest =
  | RunActionRequest
  | ResolveOptionsRequest
  | TriggerHookRequest
  | CheckConnectionRequest
  | DescribePieceRequest;

export class PieceWorkerError extends Error {
  readonly serialized: SerializedPieceError;

  constructor(serialized: SerializedPieceError) {
    super(`${serialized.name}: ${serialized.message}`);
    this.name = "PieceWorkerError";
    this.serialized = serialized;
  }
}

export class PieceWorkerTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Piece action timed out after ${timeoutMs}ms; worker was replaced`);
    this.name = "PieceWorkerTimeoutError";
  }
}

export class PieceWorkerExitError extends Error {
  constructor(code: number | null, signal: string | null) {
    super(`Piece worker exited unexpectedly (code=${code}, signal=${signal})`);
    this.name = "PieceWorkerExitError";
  }
}

export interface PieceWorkerResult {
  output: unknown;
  touched: string[];
  tlsPoisoned: boolean;
  // run only: files the piece wrote through ctx.files, staged on disk for the
  // host to ingest before the output is journalled.
  files?: StagedFile[];
  // trigger-hook only: final store contents plus captured context calls.
  storeState?: Record<string, unknown>;
  schedules?: RecordedSchedule[];
  listeners?: RecordedListener[];
}

export interface PieceWorkerOptions {
  // Absolute path to the compiled worker entry; defaults to dist/worker-entry.js.
  entryPath?: string;
  defaultTimeoutMs?: number;
  // How to reach a worker. Defaults to a forked child on this machine; a
  // remote transport replaces it without touching the protocol above.
  transport?: PieceWorkerTransportFactory;
}


// Executes piece actions in a child process. Side-effects (TLS env poisoning,
// crashes) stay in the child; a timed-out or crashed worker is replaced.
export class PieceWorker {
  private readonly connect: PieceWorkerTransportFactory;
  private readonly defaultTimeoutMs: number;
  private worker: IPieceWorkerTransport | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  constructor(options: PieceWorkerOptions = {}) {
    const entryPath = options.entryPath;
    this.connect =
      options.transport ??
      (() => createForkTransport(entryPath ?? defaultEntryPath()));
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
  }

  // Runs are serialized per worker; a pool composes multiple workers later.
  runAction(
    request: RunActionRequest,
    options: { timeoutMs?: number; hostCalls?: HostCallHandlers } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("run", request, options.timeoutMs, options.hostCalls);
  }

  // Design-time DROPDOWN options() / DYNAMIC props() resolution.
  resolveOptions(
    request: ResolveOptionsRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("resolve-options", request, options.timeoutMs);
  }

  // A piece's app.checkConnection over resolved credentials; the output is a
  // CheckConnectionOutcome.
  checkConnection(
    request: CheckConnectionRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("check-connection", request, options.timeoutMs);
  }

  // The piece's design-time descriptor; the output is a ConnectorDescriptor.
  describePiece(
    request: DescribePieceRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("describe", request, options.timeoutMs);
  }

  // One trigger lifecycle hook; the caller owns storeState persistence.
  runTriggerHook(
    request: TriggerHookRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("trigger-hook", request, options.timeoutMs);
  }

  private enqueue(
    type: WorkerRequestType,
    request: WorkerRequest,
    timeoutMs?: number,
    hostCalls?: HostCallHandlers,
  ): Promise<PieceWorkerResult> {
    const run = this.queue.then(() =>
      this.execute(type, request, timeoutMs ?? this.defaultTimeoutMs, hostCalls),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    this.worker?.kill();
    this.worker = undefined;
  }

  private spawn(): IPieceWorkerTransport {
    if (this.worker) return this.worker;
    const worker = this.connect();
    const forget = () => {
      if (this.worker === worker) this.worker = undefined;
      worker.off("exit", forget);
    };
    worker.on("exit", forget);
    this.worker = worker;
    return worker;
  }

  private execute(
    type: WorkerRequestType,
    request: WorkerRequest,
    timeoutMs: number,
    hostCalls?: HostCallHandlers,
  ): Promise<PieceWorkerResult> {
    const worker = this.spawn();
    const id = this.nextId++;

    return new Promise<PieceWorkerResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        worker.kill();
        this.worker = undefined;
        reject(new PieceWorkerTimeoutError(timeoutMs));
      }, timeoutMs);

      const onMessage = (value: unknown) => {
        const response = value as WorkerResponse | HostCallMessage;
        // Ids come from two counters; dispatch on type before comparing them.
        if (response.type === "host-call") return;
        if (response.id !== id) return;
        cleanup();
        if (response.type === "result") {
          resolve({
            output: response.output,
            touched: response.touched,
            tlsPoisoned: response.tlsPoisoned,
            files: response.files,
            storeState: response.storeState,
            schedules: response.schedules,
            listeners: response.listeners,
          });
        } else {
          reject(new PieceWorkerError(response.error));
        }
      };

      const onExit = ({ code, signal }: TransportExit) => {
        cleanup();
        reject(new PieceWorkerExitError(code, signal));
      };

      // Served outside the request queue: the queue is held by this very
      // request, so routing a call through it would deadlock the step.
      const onHostCall = (value: unknown) => {
        const message = value as WorkerResponse | HostCallMessage;
        if (message.type !== "host-call") return;
        void this.serveHostCall(worker, message, hostCalls);
      };

      const cleanup = () => {
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("message", onHostCall);
        worker.off("exit", onExit);
      };

      worker.on("message", onMessage);
      worker.on("message", onHostCall);
      worker.on("exit", onExit);
      worker.send({ id, type, request });
    });
  }

  // Answers one call from the child. The handler set belongs to the request in
  // flight, so a call arriving after the step returned is refused, not served.
  private async serveHostCall(
    worker: IPieceWorkerTransport,
    message: HostCallMessage,
    handlers: HostCallHandlers | undefined,
  ): Promise<void> {
    let response: HostCallResponse;
    try {
      const handler = handlers?.[message.method];
      if (!handler) {
        throw new Error(`No host handler for "${message.method}"`);
      }
      response = {
        id: message.id,
        type: "host-result",
        value: await handler(message.payload),
      };
    } catch (error) {
      response = {
        id: message.id,
        type: "host-result",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // A worker killed on timeout takes its pending calls with it.
    if (worker.connected) worker.send(response);
  }
}
