import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  RecordedListener,
  RecordedSchedule,
} from "../context/trigger.js";
import type {
  ResolveOptionsRequest,
  RunActionRequest,
  SerializedPieceError,
  TriggerHookRequest,
  WorkerResponse,
} from "./protocol.js";

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
  // trigger-hook only: final store contents plus captured context calls.
  storeState?: Record<string, unknown>;
  schedules?: RecordedSchedule[];
  listeners?: RecordedListener[];
}

export interface PieceWorkerOptions {
  // Absolute path to the compiled worker entry; defaults to dist/worker-entry.js.
  entryPath?: string;
  defaultTimeoutMs?: number;
}

function defaultEntryPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not locate package root");
    dir = parent;
  }
  const entry = path.join(dir, "dist", "worker-entry.js");
  if (!existsSync(entry)) {
    throw new Error(`Worker entry not built at ${entry} — run pnpm build`);
  }
  return entry;
}

// Executes piece actions in a child process. Side-effects (TLS env poisoning,
// crashes) stay in the child; a timed-out or crashed worker is replaced.
export class PieceWorker {
  private readonly entryPath: string;
  private readonly defaultTimeoutMs: number;
  private child: ChildProcess | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  constructor(options: PieceWorkerOptions = {}) {
    this.entryPath = options.entryPath ?? defaultEntryPath();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
  }

  // Runs are serialized per worker; a pool composes multiple workers later.
  runAction(
    request: RunActionRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("run", request, options.timeoutMs);
  }

  // Design-time DROPDOWN options() / DYNAMIC props() resolution.
  resolveOptions(
    request: ResolveOptionsRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("resolve-options", request, options.timeoutMs);
  }

  // One trigger lifecycle hook; the caller owns storeState persistence.
  runTriggerHook(
    request: TriggerHookRequest,
    options: { timeoutMs?: number } = {},
  ): Promise<PieceWorkerResult> {
    return this.enqueue("trigger-hook", request, options.timeoutMs);
  }

  private enqueue(
    type: "run" | "resolve-options" | "trigger-hook",
    request: RunActionRequest | ResolveOptionsRequest | TriggerHookRequest,
    timeoutMs?: number,
  ): Promise<PieceWorkerResult> {
    const run = this.queue.then(() =>
      this.execute(type, request, timeoutMs ?? this.defaultTimeoutMs),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    this.child?.kill("SIGKILL");
    this.child = undefined;
  }

  private spawn(): ChildProcess {
    if (this.child) return this.child;
    // Empty env: the child gets no host secrets and no inherited TLS overrides.
    this.child = fork(this.entryPath, [], {
      env: {},
      execArgv: [],
      serialization: "advanced",
      // Piece stdout/stderr are dropped for now; log capture arrives with journaling.
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    this.child.once("exit", () => {
      this.child = undefined;
    });
    return this.child;
  }

  private execute(
    type: "run" | "resolve-options" | "trigger-hook",
    request: RunActionRequest | ResolveOptionsRequest | TriggerHookRequest,
    timeoutMs: number,
  ): Promise<PieceWorkerResult> {
    const child = this.spawn();
    const id = this.nextId++;

    return new Promise<PieceWorkerResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        child.kill("SIGKILL");
        this.child = undefined;
        reject(new PieceWorkerTimeoutError(timeoutMs));
      }, timeoutMs);

      const onMessage = (response: WorkerResponse) => {
        if (response.id !== id) return;
        cleanup();
        if (response.type === "result") {
          resolve({
            output: response.output,
            touched: response.touched,
            tlsPoisoned: response.tlsPoisoned,
            storeState: response.storeState,
            schedules: response.schedules,
            listeners: response.listeners,
          });
        } else {
          reject(new PieceWorkerError(response.error));
        }
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(new PieceWorkerExitError(code, signal));
      };

      const cleanup = () => {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
      };

      child.on("message", onMessage);
      child.on("exit", onExit);
      child.send({ id, type, request });
    });
  }
}
