import { configuredMaxFileBytes } from "../context/limits.js";
import type { StagedFile } from "../context/files.js";
import type { RecordedListener, RecordedSchedule } from "../context/trigger.js";
import { jsonSafe } from "./json-safe.js";
import { randomUUID } from "node:crypto";
import { createIpcTransport, type ReactorTap } from "./reactor-rpc.js";
import {
  createForkTransport,
  defaultEntryPath,
  type IPieceWorkerTransport,
  type PieceWorkerTransportFactory,
  type TransportExit,
} from "./transport.js";
import {
  MODEL_ENTRIES,
  MODEL_MANIFEST,
  type CheckConnectionRequest,
  type DescribePieceRequest,
  type HostCallHandlers,
  type HostCallMessage,
  type HostCallResponse,
  type HostNotifyHandlers,
  type HostNotifyMessage,
  type ModelEntriesPayload,
  type ModelManifestMessage,
  type ReactorRequestBinding,
  type ReactorRpcEnvelope,
  type ResolveOptionsRequest,
  type RunActionRequest,
  type SerializedPieceError,
  type TriggerHookRequest,
  type WorkerResponse,
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

// Handlers the host offers for the duration of one request: calls it answers,
// and one-way reports it receives.
export interface RequestTaps {
  hostCalls?: HostCallHandlers;
  notifications?: HostNotifyHandlers;
  // ctx.reactor over the reactor RPC; ignored by check-connection and describe.
  reactor?: ReactorTap;
}

// Every request that can serve a piece takes the same shape: a deadline plus
// the taps the host offers while it runs.
export interface RequestOptions extends RequestTaps {
  timeoutMs?: number;
  // Cap on each call the child makes of its host, for THIS request. Per
  // request rather than per worker because it follows the step's own timeout
  // (`hostCallTimeoutForStep`), and one worker serves many steps.
  hostCallTimeoutMs?: number;
}

/** @deprecated Named for the one request that had it; every request takes it
 * now. Kept because the old name is on main, in this package's public types. */
export type RunActionOptions = RequestOptions;

type ChildMessage =
  | WorkerResponse
  | HostCallMessage
  | HostNotifyMessage
  | ReactorRpcEnvelope;

interface OpenReactor {
  binding: ReactorRequestBinding;
  stop: () => void;
}

// Importable document models for the child (the reactor's ModelManifestEntry).
export interface ModelManifestSource {
  // Sent on fork.
  entries(): unknown[];
  // The child's lookup on a miss; without a type, every entry the host knows.
  lookup?(documentType?: string): unknown[] | Promise<unknown[]>;
}

// A tap reports on the step; it never decides its outcome. Node delivers these
// before the result, so no draining step is needed at teardown.
function serveNotify(
  message: HostNotifyMessage,
  handlers: HostNotifyHandlers | undefined,
): void {
  const handler = handlers?.[message.method];
  if (!handler) return;
  try {
    // Declared void, but TypeScript admits an async function here, and its
    // rejection would take the host down rather than the tap.
    void Promise.resolve(handler(message.payload)).catch(() => undefined);
  } catch {
    // A broken tap is not the step's problem.
  }
}

export interface PieceWorkerOptions {
  // Absolute path to the compiled worker entry; defaults to dist/worker-entry.js.
  entryPath?: string;
  defaultTimeoutMs?: number;
  // How to reach a worker. Defaults to a forked child on this machine; a
  // remote transport replaces it without touching the protocol above.
  transport?: PieceWorkerTransportFactory;
  // Cap on each call the child makes of its host; the child's default if unset.
  hostCallTimeoutMs?: number;
  // Sent to each child on fork, and looked up by type on a miss.
  models?: ModelManifestSource;
}

// The five requests a worker serves, plus teardown. Callers hold this rather
// than PieceWorker itself, so a child that outlives every request and a child
// that lives for one run are interchangeable to them.
export interface IPieceWorker {
  runAction(
    request: RunActionRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult>;
  resolveOptions(
    request: ResolveOptionsRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult>;
  checkConnection(
    request: CheckConnectionRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult>;
  describePiece(
    request: DescribePieceRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult>;
  runTriggerHook(
    request: TriggerHookRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult>;
  // Ends the worker. A caller that was handed one it does not own must not
  // call this; PieceWorkerPool disposes the workers it hands out.
  dispose(): void;
}

// Executes piece actions in a child process. Side-effects (TLS env poisoning,
// crashes) stay in the child; a timed-out or crashed worker is replaced.
export class PieceWorker implements IPieceWorker {
  private readonly connect: PieceWorkerTransportFactory;
  private readonly defaultTimeoutMs: number;
  private readonly hostCallTimeoutMs: number | undefined;
  private readonly models: ModelManifestSource | undefined;
  private worker: IPieceWorkerTransport | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  constructor(options: PieceWorkerOptions = {}) {
    const entryPath = options.entryPath;
    this.connect =
      options.transport ??
      (() => createForkTransport(entryPath ?? defaultEntryPath()));
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.hostCallTimeoutMs = options.hostCallTimeoutMs;
    this.models = options.models;
  }

  // Requests are serialized per worker; concurrency comes from holding more
  // than one, which is what PieceWorkerPool does.
  runAction(
    request: RunActionRequest,
    options: RequestOptions = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("run", request, options.timeoutMs, options);
  }

  // Design-time DROPDOWN options() / DYNAMIC props() resolution. It takes the
  // same taps a run does: a package piece's resolver may read the reactor.
  resolveOptions(
    request: ResolveOptionsRequest,
    options: RequestOptions = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("resolve-options", request, options.timeoutMs, options);
  }

  // The piece's auth.validate and auth.getConnectionIdentifier over resolved
  // credentials; the output is a CheckConnectionOutcome.
  checkConnection(
    request: CheckConnectionRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("check-connection", request, options.timeoutMs);
  }

  // The piece's design-time descriptor; the output is a PieceDescriptor.
  describePiece(
    request: DescribePieceRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("describe", request, options.timeoutMs);
  }

  // One trigger lifecycle hook. It takes the same taps a run does, so a
  // `durableStore` hook reaches the host's store while it is still running.
  runTriggerHook(
    request: TriggerHookRequest,
    options: RequestOptions = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("trigger-hook", request, options.timeoutMs, options);
  }

  private enqueue(
    type: WorkerRequestType,
    request: WorkerRequest,
    timeoutMs?: number,
    taps: RequestOptions = {},
  ): Promise<PieceWorkerResult> {
    const run = this.queue.then(() =>
      this.execute(type, request, timeoutMs ?? this.defaultTimeoutMs, taps),
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
    this.sendModels(worker);
    const forget = () => {
      if (this.worker === worker) this.worker = undefined;
      worker.off("exit", forget);
    };
    worker.on("exit", forget);
    this.worker = worker;
    return worker;
  }

  private sendModels(worker: IPieceWorkerTransport): void {
    const entries = this.models?.entries() ?? [];
    if (entries.length === 0 || !worker.connected) return;
    const message: ModelManifestMessage = { type: MODEL_MANIFEST, entries };
    worker.send(jsonSafe(message));
  }

  private async modelEntries(payload: unknown): Promise<unknown[]> {
    const documentType = (payload as ModelEntriesPayload | undefined)
      ?.documentType;
    return (await this.models?.lookup?.(documentType)) ?? [];
  }

  // Starts serving ctx.reactor for one request; the returned stop closes it.
  private openReactor(
    worker: IPieceWorkerTransport,
    tap: ReactorTap,
    deadline: number,
  ): OpenReactor {
    const requestId = randomUUID();
    const transport = createIpcTransport(worker, requestId);
    let stopServing: () => void;
    try {
      stopServing = tap.open(transport, { requestId, deadline });
    } catch (error) {
      transport.close();
      throw error;
    }
    return {
      binding: { requestId, requireReactor: tap.requireReactor },
      stop: () => {
        transport.close();
        stopServing();
      },
    };
  }

  private execute(
    type: WorkerRequestType,
    request: WorkerRequest,
    timeoutMs: number,
    taps: RequestOptions,
  ): Promise<PieceWorkerResult> {
    const worker = this.spawn();
    const id = this.nextId++;
    // An explicit per-worker cap is the host's own decision and wins. With
    // none — which is how the pool builds them — each request carries the cap
    // derived from its step (`hostCallTimeoutForStep`), because one worker
    // serves many steps and the cap follows the step's own timeout.
    const hostCallTimeoutMs = this.hostCallTimeoutMs ?? taps.hostCallTimeoutMs;

    return new Promise<PieceWorkerResult>((resolve, reject) => {
      // The kill timer's own reading, so the child can give up in time to say why.
      const deadline = Date.now() + timeoutMs;
      let reactor: OpenReactor | undefined;
      if (taps.reactor && type !== "check-connection" && type !== "describe") {
        try {
          reactor = this.openReactor(worker, taps.reactor, deadline);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      }
      const timer = setTimeout(() => {
        cleanup();
        worker.kill();
        this.worker = undefined;
        reject(new PieceWorkerTimeoutError(timeoutMs));
      }, timeoutMs);

      const onMessage = (value: unknown) => {
        const response = value as ChildMessage;
        // Ids come from two counters; dispatch on type before comparing them.
        if (
          response.type === "host-call" ||
          response.type === "host-notify" ||
          response.type === "reactor-rpc"
        ) {
          return;
        }
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
        const message = value as ChildMessage;
        if (message.type === "host-call") {
          void this.serveHostCall(worker, message, taps.hostCalls);
          return;
        }
        if (message.type === "host-notify") {
          serveNotify(message, taps.notifications);
        }
      };

      const cleanup = () => {
        reactor?.stop();
        reactor = undefined;
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("message", onHostCall);
        worker.off("exit", onExit);
      };

      worker.on("message", onMessage);
      worker.on("message", onHostCall);
      worker.on("exit", onExit);
      // Flattened here rather than per caller: config, auth and connection
      // values are piece-authored, and the contract is JSON-shaped both ways.
      // The file ceiling is stamped on the same way the egress policy is passed
      // in: the child reads no environment of its own.
      worker.send(
        jsonSafe({
          id,
          type,
          request: {
            maxFileBytes: configuredMaxFileBytes(),
            deadline,
            ...(hostCallTimeoutMs ? { hostCallTimeoutMs } : {}),
            ...request,
            ...(reactor ? { reactor: reactor.binding } : {}),
          },
        }),
      );
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
      const handler =
        message.method === MODEL_ENTRIES
          ? (payload: unknown) => this.modelEntries(payload)
          : handlers?.[message.method];
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
