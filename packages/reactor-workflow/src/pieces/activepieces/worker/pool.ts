// A bounded set of piece workers, handed out one per run (doc 08 §7, doc 03 §5).

// PieceWorker serializes its requests, so one shared worker makes every
// connector step on the server wait for every other.

// The pool answers both halves of that: N sessions run at once, and each holds
// a child of its own, killed when the session closes.

// So a run starts on a clean heap, waits only on itself, and takes nothing
// with it when it ends.
import {
  PieceWorker,
  type IPieceWorker,
  type PieceWorkerOptions,
  type PieceWorkerResult,
  type RequestOptions,
} from "./host.js";
import type {
  CheckConnectionRequest,
  DescribePieceRequest,
  ResolveOptionsRequest,
  RunActionRequest,
  TriggerHookRequest,
} from "./protocol.js";

// Thrown when a session asks for a slot the pool will not queue.

// The pool queues without limit unless an operator caps it, so this only
// appears where someone chose failing fast over waiting.
export class PieceWorkerPoolBusyError extends Error {
  constructor(size: number, waiting: number) {
    super(
      `All ${size} piece workers are busy and ${waiting} runs are already waiting`,
    );
    this.name = "PieceWorkerPoolBusyError";
  }
}

export class PieceWorkerSessionClosedError extends Error {
  constructor() {
    super("This piece worker session is closed");
    this.name = "PieceWorkerSessionClosedError";
  }
}

export interface PieceWorkerPoolOptions extends PieceWorkerOptions {
  // How many sessions may hold a worker at once. Each one is a child process,
  // so this is the server's real connector concurrency.
  size?: number;
  // How many sessions may wait for a slot. 0 is unbounded, which is what the
  // single shared worker effectively did: latency rather than failure.
  maxQueueDepth?: number;
  // Builds one worker. Defaults to a forked child; a test or a remote
  // deployment substitutes its own.
  createWorker?: (options: PieceWorkerOptions) => IPieceWorker;
}

const DEFAULT_SIZE = 4;

interface Waiter {
  session: PieceWorkerSession;
  resolve: () => void;
  reject: (error: unknown) => void;
}

// One run's claim on a worker. Lazy on purpose: a run whose steps are all
// document or core blocks never takes a slot and never forks a child.
export class PieceWorkerSession implements IPieceWorker {
  private worker: IPieceWorker | undefined;
  private taking: Promise<IPieceWorker> | undefined;
  private held = false;
  private closed = false;

  constructor(private readonly pool: PieceWorkerPool) {}

  runAction(
    request: RunActionRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult> {
    return this.request((worker) => worker.runAction(request, options));
  }

  resolveOptions(
    request: ResolveOptionsRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult> {
    return this.request((worker) => worker.resolveOptions(request, options));
  }

  checkConnection(
    request: CheckConnectionRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult> {
    return this.request((worker) => worker.checkConnection(request, options));
  }

  describePiece(
    request: DescribePieceRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult> {
    return this.request((worker) => worker.describePiece(request, options));
  }

  runTriggerHook(
    request: TriggerHookRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult> {
    return this.request((worker) => worker.runTriggerHook(request, options));
  }

  // Kills this session's child and frees its slot for whoever is waiting.

  // Idempotent: a caller closing in a `finally` must not have to care whether
  // the run failed before it ever reached a piece step.
  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Still queueing: the request fails now rather than when a slot happens
    // to free, which for a saturated pool may be never.
    this.pool.cancel(this);
    this.worker?.dispose();
    this.worker = undefined;
    this.pool.forget(this);
    this.giveBack();
  }

  // IPieceWorker's teardown is this session's close: a caller holding one
  // through the interface ends the run's child, not the pool.
  dispose(): void {
    this.close();
  }

  private async request<T>(fn: (worker: IPieceWorker) => Promise<T>) {
    const worker = await this.take();
    // Closed while this was waiting — a shutdown landing mid-run.

    // Its worker is already killed, and PieceWorker forks a replacement on the
    // next request, so dispatching now would leak a child the pool never sees.
    if (this.closed) throw new PieceWorkerSessionClosedError();
    return fn(worker);
  }

  private take(): Promise<IPieceWorker> {
    if (this.closed) {
      return Promise.reject(new PieceWorkerSessionClosedError());
    }
    if (this.worker) return Promise.resolve(this.worker);
    // Memoized: two steps entering at once must not take two slots, even
    // though the coordinator runs a run's steps one after another.
    this.taking ??= this.acquire();
    return this.taking;
  }

  private async acquire(): Promise<IPieceWorker> {
    await this.pool.acquire(this);
    this.held = true;
    // Closed while queueing: hand the slot straight back rather than fork a
    // child for a run that is already over.
    if (this.closed) {
      this.giveBack();
      throw new PieceWorkerSessionClosedError();
    }
    this.worker = this.pool.build();
    return this.worker;
  }

  private giveBack(): void {
    if (!this.held) return;
    this.held = false;
    this.pool.release();
  }
}

// Sized once at construction. Sessions queue for a slot in the order they ask
// for one, so a burst of runs is served first-come rather than at random.
export class PieceWorkerPool {
  readonly size: number;
  private readonly maxQueueDepth: number;
  private readonly createWorker: (options: PieceWorkerOptions) => IPieceWorker;
  private readonly workerOptions: PieceWorkerOptions;
  private readonly sessions = new Set<PieceWorkerSession>();
  private readonly waiters: Waiter[] = [];
  private inUse = 0;
  private disposed = false;

  constructor(options: PieceWorkerPoolOptions = {}) {
    const { size, maxQueueDepth, createWorker, ...workerOptions } = options;
    this.size = Math.max(1, Math.trunc(size ?? DEFAULT_SIZE));
    this.maxQueueDepth = Math.max(0, Math.trunc(maxQueueDepth ?? 0));
    this.createWorker = createWorker ?? ((o) => new PieceWorker(o));
    this.workerOptions = workerOptions;
  }

  // A run's claim on a worker, for the length of the run. Free until its
  // first piece step, so opening one per run costs nothing.
  session(): PieceWorkerSession {
    if (this.disposed) throw new Error("Piece worker pool is disposed");
    const session = new PieceWorkerSession(this);
    this.sessions.add(session);
    return session;
  }

  // Sessions holding a worker, and sessions waiting for one. The wait is what
  // a queue-depth alarm watches: it is invisible in a run's own timings.
  stats(): { size: number; active: number; waiting: number } {
    return {
      size: this.size,
      active: this.inUse,
      waiting: this.waiters.length,
    };
  }

  // Closes every session — killing the children mid-run — and refuses the ones
  // still queueing. For shutdown; a live run does not survive it.
  dispose(): void {
    this.disposed = true;
    // Queued sessions hear why before the closing below turns their wait into
    // the more ordinary "your session closed".
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new Error("Piece worker pool is disposed"));
    }
    for (const session of [...this.sessions]) session.close();
    this.sessions.clear();
  }

  /** @internal — a session taking its slot. */
  acquire(session: PieceWorkerSession): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error("Piece worker pool is disposed"));
    }
    if (this.inUse < this.size) {
      this.inUse++;
      return Promise.resolve();
    }
    if (this.maxQueueDepth > 0 && this.waiters.length >= this.maxQueueDepth) {
      return Promise.reject(
        new PieceWorkerPoolBusyError(this.size, this.waiters.length),
      );
    }
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ session, resolve, reject });
    });
  }

  /** @internal — a session that closed while queueing. */
  cancel(session: PieceWorkerSession): void {
    const index = this.waiters.findIndex((w) => w.session === session);
    if (index < 0) return;
    const [waiter] = this.waiters.splice(index, 1);
    waiter.reject(new PieceWorkerSessionClosedError());
  }

  /** @internal — a session giving its slot back. */
  release(): void {
    const next = this.waiters.shift();
    // Handed straight on rather than counted down and up again, so a slot
    // freed with someone waiting cannot be taken by a later arrival.
    if (next) {
      next.resolve();
      return;
    }
    this.inUse = Math.max(0, this.inUse - 1);
  }

  /** @internal — one child for one session. */
  build(): IPieceWorker {
    return this.createWorker(this.workerOptions);
  }

  /** @internal — a session that closed itself. */
  forget(session: PieceWorkerSession): void {
    this.sessions.delete(session);
  }
}
