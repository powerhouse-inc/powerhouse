// One warm pool of piece children, leased per request (ADR 0007).

// A request takes an idle child that has its piece loaded, then any idle
// child, then a new child, then a place in a FIFO queue.

// Trigger hooks get children of their own, so a burst of runs can't delay
// polls. A child that dies, grows or poisons TLS is retired.
import { readFileSync } from "node:fs";
import os from "node:os";
import {
  PieceWorker,
  PieceWorkerDisposedError,
  type IPieceWorker,
  type PieceWorkerHealth,
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
import type { WorkflowTelemetry } from "../../../telemetry.js";

// Thrown when a request asks for a child the pool will not queue.

// The pool queues without limit unless an operator caps it, so this only
// appears where someone chose failing fast over waiting.
export class PieceWorkerPoolBusyError extends Error {
  constructor(size: number, waiting: number) {
    super(
      `All ${size} piece workers are busy and ${waiting} requests are already waiting`,
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

// Runs, trigger hooks, and the editor: each waits only behind its own lane.
export type PieceWorkerLane = "run" | "trigger" | "design";

export interface PieceWorkerPoolOptions extends PieceWorkerOptions {
  // Most children serving runs and design-time requests at once. Sized from
  // the container's cores and memory when unset.
  size?: number;
  // How many requests may wait for a child. 0 is unbounded: latency rather
  // than failure.
  maxQueueDepth?: number;
  // Children reserved for trigger hooks.
  triggerSlots?: number;
  // Children reserved for the editor's describe, options and connection checks.
  designSlots?: number;
  // Idle run children kept warm rather than retired.
  minWarm?: number;
  // Requests a child serves before it is retired, for leaks outside the heap.
  maxRequests?: number;
  // An idle child above the warm minimum exits after this long.
  idleMs?: number;
  // Children booting at once; more forks than this slow every boot.
  maxConcurrentForks?: number;
  // The reactor's own worker threads, which share the container's cores.
  reactorThreads?: number;
  // The container's memory, checked before each fork. Read from the cgroup by
  // default; a test substitutes its own.
  memory?: () => ContainerMemory | undefined;
  // Builds one worker. Defaults to a forked child; a test or a remote
  // deployment substitutes its own.
  createWorker?: (options: PieceWorkerOptions) => IPieceWorker;
}

export interface ContainerMemory {
  limit: number;
  // Anonymous memory in use: what an out-of-memory kill counts.
  used: number;
}

export interface PieceWorkerPoolStats {
  size: number;
  active: number;
  idle: number;
  waiting: number;
}

export const DEFAULT_WORKER_HEAP_MB = 256;
// Host-bound runs peak at 4-8 children; past this, a large host with no memory
// limit could fork until it runs out.
export const DEFAULT_POOL_MAX = 32;
const DEFAULT_TRIGGER_SLOTS = 1;
const DEFAULT_DESIGN_SLOTS = 1;
const DEFAULT_MIN_WARM = 1;
const DEFAULT_MAX_REQUESTS = 1_000;
const DEFAULT_IDLE_MS = 60_000;
const DEFAULT_MAX_CONCURRENT_FORKS = 4;
// A child is retired between requests past this share of its heap budget.
const HEAP_RETIREMENT = 0.8;
// RSS over V8 heap total, measured on children with 1 to 14 pieces loaded.
const RSS_PER_HEAP = 1.6;
// Forks stop while anonymous memory plus one child would pass this share.
const FORK_HEADROOM = 0.9;
// About 0.3 cores per busy reactor executor thread.
const REACTOR_THREADS_PER_CORE = 3;
// A fresh child's RSS, until a child has reported its own.
const FRESH_CHILD_BYTES = 80 * 1024 * 1024;
const MIB = 1024 * 1024;
// A fork counts against the cap this long at most; boots measured 20-75ms.
const BOOT_WINDOW_MS = 1_000;
const LANES = ["run", "trigger", "design"] as const;

interface Child {
  readonly worker: IPieceWorker;
  readonly lane: PieceWorkerLane;
  // Bundles this child has loaded, so a request can find one already warm.
  readonly loaded: Set<string>;
  requests: number;
  busy: boolean;
  // Booting until its first reply or BOOT_WINDOW_MS, whichever comes first.
  forkedAt: number;
  replied: boolean;
  // Killed by a session closing mid-request; never handed out again.
  doomed: boolean;
  idleSince: number;
  session: PieceWorkerSession | undefined;
}

interface Waiter {
  session: PieceWorkerSession;
  key: string | undefined;
  resolve: (child: Child) => void;
  reject: (error: unknown) => void;
}

function pieceKey(request: { bundleDir?: string; entryPath?: string }) {
  return request.bundleDir ?? request.entryPath;
}

// The most children the host can carry: the cores left after the reactor's
// threads, or the memory left after the host, whichever is smaller.
export function defaultPoolSize(
  options: { reactorThreads?: number; heapMb?: number } = {},
): number {
  const reactorThreads = Math.max(0, options.reactorThreads ?? 0);
  const cores =
    2 * os.availableParallelism() -
    1 -
    Math.floor(reactorThreads / REACTOR_THREADS_PER_CORE);
  const constrained = process.constrainedMemory();
  const limit =
    constrained > 0 && constrained < os.totalmem()
      ? constrained
      : os.totalmem();
  const perChild =
    RSS_PER_HEAP * (options.heapMb ?? DEFAULT_WORKER_HEAP_MB) * MIB;
  const memory = Math.floor((limit - process.memoryUsage.rss()) / perChild);
  return Math.max(1, Math.min(cores, memory, DEFAULT_POOL_MAX));
}

// cgroup v2 only; undefined outside a memory-limited container.
export function cgroupMemory(): ContainerMemory | undefined {
  try {
    const max = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    if (max === "max") return undefined;
    const stat = readFileSync("/sys/fs/cgroup/memory.stat", "utf8");
    const anon = /^anon (\d+)$/m.exec(stat)?.[1];
    if (!anon) return undefined;
    return { limit: Number(max), used: Number(anon) };
  } catch {
    return undefined;
  }
}

// At most one read a second: the reads are synchronous, on the main thread
// the run dispatcher admits against.
function cachedCgroupMemory(): () => ContainerMemory | undefined {
  let readAt = -Infinity;
  let last: ContainerMemory | undefined;
  return () => {
    const now = performance.now();
    if (now - readAt >= 1_000) {
      last = cgroupMemory();
      readAt = now;
    }
    return last;
  };
}

// A run's or a caller's handle on the pool. Holds no child of its own: each
// request leases one, so a run whose steps are all core blocks forks nothing.
export class PieceWorkerSession implements IPieceWorker {
  private closed = false;

  constructor(
    private readonly pool: PieceWorkerPool,
    /** @internal */
    readonly lane: PieceWorkerLane,
  ) {}

  runAction(
    request: RunActionRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult> {
    return this.pool.request(this, pieceKey(request), (worker) =>
      worker.runAction(request, options),
    );
  }

  resolveOptions(
    request: ResolveOptionsRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult> {
    return this.pool.request(this, pieceKey(request), (worker) =>
      worker.resolveOptions(request, options),
    );
  }

  checkConnection(
    request: CheckConnectionRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult> {
    return this.pool.request(this, pieceKey(request), (worker) =>
      worker.checkConnection(request, options),
    );
  }

  describePiece(
    request: DescribePieceRequest,
    options?: { timeoutMs?: number },
  ): Promise<PieceWorkerResult> {
    return this.pool.request(this, pieceKey(request), (worker) =>
      worker.describePiece(request, options),
    );
  }

  runTriggerHook(
    request: TriggerHookRequest,
    options?: RequestOptions,
  ): Promise<PieceWorkerResult> {
    return this.pool.request(this, pieceKey(request), (worker) =>
      worker.runTriggerHook(request, options),
    );
  }

  // Refuses this session's queued requests and kills any child serving one:
  // a run cancelled mid-step stops its piece code. Idempotent.
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pool.closeSession(this);
  }

  /** @internal */
  isClosed(): boolean {
    return this.closed;
  }

  // IPieceWorker's teardown is this session's close: a caller holding one
  // through the interface ends its own requests, not the pool.
  dispose(): void {
    this.close();
  }
}

export class PieceWorkerPool {
  readonly size: number;
  /** @internal */
  readonly telemetry: WorkflowTelemetry | undefined;
  private readonly maxQueueDepth: number;
  // Children reserved for trigger hooks; the supervisor runs as many at once.
  readonly triggerSlots: number;
  private readonly designSlots: number;
  private readonly minWarm: number;
  private readonly maxRequests: number;
  private readonly idleMs: number;
  private readonly maxConcurrentForks: number;
  private readonly heapMb: number;
  private readonly memory: () => ContainerMemory | undefined;
  private readonly createWorker: (options: PieceWorkerOptions) => IPieceWorker;
  private readonly workerOptions: PieceWorkerOptions;
  private readonly children = new Set<Child>();
  private readonly waiters: Record<PieceWorkerLane, Waiter[]> = {
    run: [],
    trigger: [],
    design: [],
  };
  private largestChild = FRESH_CHILD_BYTES;
  private idleTimer: NodeJS.Timeout | undefined;
  private bootTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(options: PieceWorkerPoolOptions = {}) {
    const {
      size,
      maxQueueDepth,
      triggerSlots,
      designSlots,
      minWarm,
      maxRequests,
      idleMs,
      maxConcurrentForks,
      reactorThreads,
      memory,
      createWorker,
      ...workerOptions
    } = options;
    this.heapMb = workerOptions.heapMb ?? DEFAULT_WORKER_HEAP_MB;
    this.size = Math.max(
      1,
      Math.trunc(
        size ?? defaultPoolSize({ reactorThreads, heapMb: this.heapMb }),
      ),
    );
    this.maxQueueDepth = Math.max(0, Math.trunc(maxQueueDepth ?? 0));
    this.triggerSlots = Math.max(
      1,
      Math.trunc(triggerSlots ?? DEFAULT_TRIGGER_SLOTS),
    );
    this.designSlots = Math.max(
      1,
      Math.trunc(designSlots ?? DEFAULT_DESIGN_SLOTS),
    );
    this.minWarm = Math.max(0, Math.trunc(minWarm ?? DEFAULT_MIN_WARM));
    this.maxRequests = Math.max(1, maxRequests ?? DEFAULT_MAX_REQUESTS);
    this.idleMs = Math.max(0, idleMs ?? DEFAULT_IDLE_MS);
    this.maxConcurrentForks = Math.max(
      1,
      maxConcurrentForks ?? DEFAULT_MAX_CONCURRENT_FORKS,
    );
    this.memory = memory ?? cachedCgroupMemory();
    this.createWorker = createWorker ?? ((o) => new PieceWorker(o));
    this.workerOptions = { ...workerOptions, heapMb: this.heapMb };
    this.telemetry = workerOptions.telemetry;
  }

  // A handle for one run, the design-time editor, or the trigger supervisor.
  // Free until it makes a request; on a disposed pool every request rejects.
  session(lane: PieceWorkerLane = "run"): PieceWorkerSession {
    return new PieceWorkerSession(this, lane);
  }

  // Run children serving a request or idle, and requests waiting for one. The
  // wait is what a queue-depth alarm watches.
  stats(): PieceWorkerPoolStats {
    let active = 0;
    let idle = 0;
    for (const child of this.children) {
      if (child.lane !== "run") continue;
      if (child.busy) active++;
      else idle++;
    }
    return { size: this.size, active, idle, waiting: this.waiters.run.length };
  }

  // Memory of the live children, from each one's last report.
  memoryStats(): Record<string, number> {
    let childRssTotal = 0;
    let childRssMax = 0;
    let childHeapUsedTotal = 0;
    for (const child of this.children) {
      const memory = child.worker.health?.().memory;
      if (!memory) continue;
      childRssTotal += memory.rss;
      childRssMax = Math.max(childRssMax, memory.rss);
      childHeapUsedTotal += memory.heapUsed;
    }
    return {
      children: this.children.size,
      childRssTotal,
      childRssMax,
      childHeapUsedTotal,
    };
  }

  // Kills every child, mid-request ones too, and refuses queued requests.
  // For shutdown; a live run does not survive it.
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    clearTimeout(this.bootTimer);
    this.bootTimer = undefined;
    for (const lane of LANES) {
      for (const waiter of this.waiters[lane].splice(0)) {
        waiter.reject(new PieceWorkerDisposedError());
      }
    }
    for (const child of this.children) child.worker.dispose();
    this.children.clear();
  }

  /** @internal — one request on a leased child. */
  async request<T>(
    session: PieceWorkerSession,
    key: string | undefined,
    fn: (worker: IPieceWorker) => Promise<T>,
  ): Promise<T> {
    if (session.isClosed()) throw new PieceWorkerSessionClosedError();
    const child = await this.lease(session, key);
    // Closed or disposed while it waited: the child is killed, not used.
    if (this.disposed) {
      this.giveBack(child, key);
      throw new PieceWorkerDisposedError();
    }
    if (session.isClosed()) {
      this.giveBack(child, key);
      throw new PieceWorkerSessionClosedError();
    }
    try {
      return await fn(child.worker);
    } finally {
      this.giveBack(child, key);
    }
  }

  /** @internal — a session that closed. */
  closeSession(session: PieceWorkerSession): void {
    const queue = this.waiters[session.lane];
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].session !== session) continue;
      const [waiter] = queue.splice(i, 1);
      waiter.reject(new PieceWorkerSessionClosedError());
    }
    for (const child of this.children) {
      if (child.busy && child.session === session) {
        child.doomed = true;
        child.worker.dispose();
      }
    }
  }

  private lease(
    session: PieceWorkerSession,
    key: string | undefined,
  ): Promise<Child> {
    if (this.disposed) {
      return Promise.reject(new PieceWorkerDisposedError());
    }
    const queue = this.waiters[session.lane];
    // FIFO: a request arriving behind waiters must not overtake them.
    const child = queue.length === 0 ? this.take(session.lane, key) : undefined;
    if (child) {
      child.session = session;
      return Promise.resolve(child);
    }
    if (
      session.lane === "run" &&
      this.maxQueueDepth > 0 &&
      queue.length >= this.maxQueueDepth
    ) {
      return Promise.reject(
        new PieceWorkerPoolBusyError(this.size, queue.length),
      );
    }
    const wait = new Promise<Child>((resolve, reject) => {
      queue.push({ session, key, resolve, reject });
    });
    // The wait for a child; a run's own timings can't show it.
    return this.telemetry
      ? this.telemetry.phase("worker.acquire", {}, () => wait)
      : wait;
  }

  // An idle child with the piece loaded, then the most recently used idle
  // child so the rest can idle out, then a new child.
  private take(lane: PieceWorkerLane, key: string | undefined) {
    let warm: Child | undefined;
    let recent: Child | undefined;
    for (const child of this.children) {
      if (child.lane !== lane || child.busy) continue;
      if (key && child.loaded.has(key)) {
        warm = child;
        break;
      }
      if (!recent || child.idleSince > recent.idleSince) recent = child;
    }
    const child = warm ?? recent ?? this.fork(lane);
    if (child) child.busy = true;
    return child;
  }

  private fork(lane: PieceWorkerLane): Child | undefined {
    let inLane = 0;
    let booting = 0;
    let firstBootEnds = Infinity;
    const now = performance.now();
    for (const child of this.children) {
      if (child.lane === lane) inLane++;
      if (!child.replied && now - child.forkedAt < BOOT_WINDOW_MS) {
        booting++;
        firstBootEnds = Math.min(
          firstBootEnds,
          child.forkedAt + BOOT_WINDOW_MS,
        );
      }
    }
    const capacity = {
      run: this.size,
      trigger: this.triggerSlots,
      design: this.designSlots,
    }[lane];
    if (inLane >= capacity) return undefined;
    // A lane's first child forks regardless of either limit, or its requests
    // would wait on another lane's. An out-of-memory kill takes the host.
    if (inLane > 0) {
      if (booting >= this.maxConcurrentForks) {
        this.redispatchAt(firstBootEnds - now);
        return undefined;
      }
      if (!this.roomForChild()) return undefined;
    }
    const child: Child = {
      worker: this.createWorker(this.workerOptions),
      lane,
      loaded: new Set(),
      requests: 0,
      busy: false,
      forkedAt: now,
      replied: false,
      doomed: false,
      idleSince: 0,
      session: undefined,
    };
    this.children.add(child);
    return child;
  }

  private roomForChild(): boolean {
    const memory = this.memory();
    if (!memory) return true;
    return memory.used + this.largestChild <= FORK_HEADROOM * memory.limit;
  }

  private giveBack(child: Child, key: string | undefined): void {
    child.busy = false;
    child.replied = true;
    child.session = undefined;
    child.requests++;
    child.idleSince = performance.now();
    const health = child.worker.health?.();
    if (health?.memory) {
      this.largestChild = Math.max(this.largestChild, health.memory.rss);
    }
    if (this.spent(child, health)) {
      this.retire(child);
    } else if (key) {
      child.loaded.add(key);
    }
    this.dispatch();
    this.scheduleIdleSweep();
  }

  private spent(child: Child, health: PieceWorkerHealth | undefined): boolean {
    if (this.disposed || child.doomed) return true;
    if (child.requests >= this.maxRequests) return true;
    if (!health) return false;
    // Dead or timed out: the next request would fork a stranger anyway. A
    // request that set NODE_TLS_REJECT_UNAUTHORIZED=0 no longer retires the
    // child: the TLS guard (worker/tls-guard.ts) verifies regardless.
    if (!health.alive) return true;
    return (
      health.memory !== undefined &&
      health.memory.heapUsed > HEAP_RETIREMENT * this.heapMb * MIB
    );
  }

  private retire(child: Child): void {
    this.children.delete(child);
    child.worker.dispose();
  }

  // Serves waiters in order, each lane on its own.
  private dispatch(): void {
    if (this.disposed) return;
    for (const lane of LANES) {
      const queue = this.waiters[lane];
      while (queue.length > 0) {
        const child = this.take(lane, queue[0].key);
        if (!child) break;
        const waiter = queue.shift()!;
        child.session = waiter.session;
        waiter.resolve(child);
      }
    }
  }

  // A boot window that closes with no reply frees a fork; nothing else would
  // tell the waiters.
  private redispatchAt(ms: number): void {
    if (this.bootTimer || this.disposed) return;
    this.bootTimer = setTimeout(
      () => {
        this.bootTimer = undefined;
        this.dispatch();
      },
      Math.max(1, ms),
    );
    this.bootTimer.unref();
  }

  private scheduleIdleSweep(): void {
    if (this.idleTimer || this.disposed || this.idleMs === 0) return;
    if (this.retirable().length === 0) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.sweepIdle();
    }, this.idleMs);
    this.idleTimer.unref();
  }

  // Retires children idle past idleMs. Trigger children stay: polls come back
  // on a schedule.
  private sweepIdle(): void {
    const now = performance.now();
    for (const child of this.retirable()) {
      if (now - child.idleSince >= this.idleMs) this.retire(child);
    }
    this.scheduleIdleSweep();
  }

  // Idle run children above the warm minimum, oldest first, and every idle
  // editor child: the editor is used now and then.
  private retirable(): Child[] {
    const idle = (lane: PieceWorkerLane) =>
      [...this.children]
        .filter((child) => child.lane === lane && !child.busy)
        .sort((a, b) => a.idleSince - b.idleSince);
    const run = idle("run");
    return [
      ...run.slice(0, Math.max(0, run.length - this.minWarm)),
      ...idle("design"),
    ];
  }
}
