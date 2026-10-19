// The pool leases warm children per request: reuse, routing, retirement and
// sizing, over fakes, then the point of it over real forked children.
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import type {
  IPieceWorker,
  PieceWorkerHealth,
  PieceWorkerResult,
} from "../../../src/pieces/activepieces/worker/host.js";
import { PieceWorkerDisposedError } from "../../../src/pieces/activepieces/worker/host.js";
import {
  DEFAULT_POOL_MAX,
  defaultPoolSize,
  PieceWorkerPool,
  PieceWorkerPoolBusyError,
  PieceWorkerSessionClosedError,
  type PieceWorkerPoolOptions,
} from "../../../src/pieces/activepieces/worker/pool.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const httpBundle = await fetchBundleForTest(
  "@activepieces/piece-http",
  "0.11.19",
);

interface FakeWorker extends IPieceWorker {
  readonly id: number;
  readonly started: string[];
  disposed: boolean;
  health: () => PieceWorkerHealth;
  state: PieceWorkerHealth;
  finish(output?: unknown): void;
}

// Every request parks until the test finishes it, so "these two ran at the
// same time" is observable rather than a matter of timing.
function fakeWorkers() {
  const built: FakeWorker[] = [];
  const createWorker = (): IPieceWorker => {
    const started: string[] = [];
    let settle: ((result: PieceWorkerResult) => void) | undefined;
    const request = (name: string) => {
      started.push(name);
      return new Promise<PieceWorkerResult>((resolve) => {
        settle = resolve;
      });
    };
    const worker: FakeWorker = {
      id: built.length + 1,
      started,
      disposed: false,
      state: { alive: true, tlsPoisoned: false },
      runAction: (r) => request(r.actionName),
      resolveOptions: () => Promise.reject(new Error("not used")),
      checkConnection: () => Promise.reject(new Error("not used")),
      describePiece: () => Promise.reject(new Error("not used")),
      runTriggerHook: (r) => request(`hook:${r.hook}`),
      health() {
        return this.state;
      },
      dispose() {
        this.disposed = true;
      },
      finish(output = {}) {
        settle?.({ output, touched: [], tlsPoisoned: false });
      },
    };
    built.push(worker);
    return worker;
  };
  return { built, createWorker };
}

function pool(options: PieceWorkerPoolOptions = {}) {
  const fakes = fakeWorkers();
  return {
    ...fakes,
    pool: new PieceWorkerPool({
      size: 1,
      memory: () => undefined,
      createWorker: fakes.createWorker,
      ...options,
    }),
  };
}

function runRequest(actionName: string, bundleDir = "/piece-a") {
  return { bundleDir, actionName, propsValue: {} };
}

function hookRequest() {
  return {
    bundleDir: "/piece-a",
    triggerName: "poll",
    hook: "run" as const,
    propsValue: {},
  };
}

// Lets the microtask queue drain, so a request that could have started has.
function settled() {
  return new Promise((resolve) => setImmediate(resolve));
}

// One request, start to finish. Action names are unique within a test, so the
// child that started it is the one to finish.
async function serve(
  { pool: target, built }: ReturnType<typeof pool>,
  request = runRequest("a"),
  session = target.session(),
) {
  const done = session.runAction(request);
  await settled();
  for (const worker of built) {
    if (worker.started.at(-1) === request.actionName) worker.finish();
  }
  await done;
}

describe("PieceWorkerPool", () => {
  it("runs as many requests at once as it has children", async () => {
    const { built, pool: workers } = pool({ size: 2 });

    const first = workers.session().runAction(runRequest("a"));
    const second = workers.session().runAction(runRequest("b"));
    await settled();

    expect(built).toHaveLength(2);
    expect(built.map((worker) => worker.started)).toEqual([["a"], ["b"]]);
    expect(workers.stats()).toEqual({
      size: 2,
      active: 2,
      idle: 0,
      waiting: 0,
    });

    built[0].finish({ ok: "a" });
    built[1].finish({ ok: "b" });
    await expect(first).resolves.toMatchObject({ output: { ok: "a" } });
    await expect(second).resolves.toMatchObject({ output: { ok: "b" } });
  });

  it("queues a request until a child frees, then serves it on that child", async () => {
    const { built, pool: workers } = pool();

    const first = workers.session().runAction(runRequest("a"));
    const queued = workers.session().runAction(runRequest("b"));
    await settled();
    expect(workers.stats()).toMatchObject({ active: 1, waiting: 1 });

    built[0].finish();
    await first;
    await settled();

    expect(built).toHaveLength(1);
    expect(built[0].started).toEqual(["a", "b"]);
    built[0].finish({ ok: "b" });
    await expect(queued).resolves.toMatchObject({ output: { ok: "b" } });
  });

  it("serves the next run from the warm child the last one left", async () => {
    const fakes = pool();

    const first = fakes.pool.session();
    await serve(fakes, runRequest("a"), first);
    first.close();
    await serve(fakes, runRequest("b"));

    expect(fakes.built).toHaveLength(1);
    expect(fakes.built[0].started).toEqual(["a", "b"]);
    expect(fakes.built[0].disposed).toBe(false);
  });

  it("routes a request to the idle child that has its piece loaded", async () => {
    const fakes = pool({ size: 2 });
    const { built, pool: workers } = fakes;
    // Two children at once: one loads piece A, the other piece B.
    const a = workers.session().runAction(runRequest("a", "/piece-a"));
    const b = workers.session().runAction(runRequest("b", "/piece-b"));
    await settled();
    built[0].finish();
    await a;
    built[1].finish();
    await b;

    // The child that served B is the most recent, but A's request skips it.
    await serve(fakes, runRequest("again", "/piece-a"));

    expect(built[0].started).toEqual(["a", "again"]);
    expect(built[1].started).toEqual(["b"]);
  });

  it("holds no child between a session's requests", async () => {
    const fakes = pool();
    const run = fakes.pool.session();
    await serve(fakes, runRequest("a"), run);

    // Another run takes the only child while the first sits between steps.
    await serve(fakes, runRequest("b"));
    await serve(fakes, runRequest("c"), run);

    expect(fakes.built).toHaveLength(1);
    expect(fakes.built[0].started).toEqual(["a", "b", "c"]);
  });

  it("forks nothing for a session that makes no request", () => {
    const { built, pool: workers } = pool();

    workers.session().close();

    expect(built).toHaveLength(0);
    expect(workers.stats()).toMatchObject({ active: 0, idle: 0, waiting: 0 });
  });

  it("refuses a request once the session is closed", async () => {
    const { pool: workers } = pool();
    const session = workers.session();
    session.close();

    await expect(session.runAction(runRequest("a"))).rejects.toBeInstanceOf(
      PieceWorkerSessionClosedError,
    );
  });

  it("drops a closed session's queued requests and forks nothing for them", async () => {
    const { built, pool: workers } = pool();
    const holding = workers.session().runAction(runRequest("a"));
    await settled();
    const waiting = workers.session();
    // Asserted before the close that rejects it, so the rejection is handled.
    const abandoned = expect(
      waiting.runAction(runRequest("b")),
    ).rejects.toBeInstanceOf(PieceWorkerSessionClosedError);
    await settled();

    waiting.close();
    await abandoned;
    built[0].finish();
    await holding;

    expect(built).toHaveLength(1);
    expect(workers.stats()).toMatchObject({ active: 0, idle: 1, waiting: 0 });
  });

  it("kills the child serving a closed session's request and forks a fresh one", async () => {
    const fakes = pool();
    const { built, pool: workers } = fakes;
    const cancelled = workers.session();
    const inFlight = cancelled.runAction(runRequest("a"));
    await settled();

    cancelled.close();
    expect(built[0].disposed).toBe(true);
    // A real child dies with its request; the fake settles to free the lease.
    built[0].finish();
    await inFlight;

    await serve(fakes, runRequest("b"));
    expect(built).toHaveLength(2);
    expect(built[1].started).toEqual(["b"]);
  });

  it("refuses to dispatch on a pool disposed while it forked", async () => {
    const { built, createWorker } = fakeWorkers();
    const workers: PieceWorkerPool = new PieceWorkerPool({
      size: 1,
      memory: () => undefined,
      createWorker: () => {
        workers.dispose();
        return createWorker();
      },
    });

    // The shutdown refusal, so callers read it as a stop, not a failure.
    await expect(
      workers.session().runAction(runRequest("a")),
    ).rejects.toBeInstanceOf(PieceWorkerDisposedError);
    expect(built[0].started).toEqual([]);
    expect(built[0].disposed).toBe(true);
  });

  describe("retires a child", () => {
    it("after its request backstop", async () => {
      const fakes = pool({ maxRequests: 2 });
      await serve(fakes, runRequest("a"));
      await serve(fakes, runRequest("b"));
      await serve(fakes, runRequest("c"));

      expect(fakes.built).toHaveLength(2);
      expect(fakes.built[0].disposed).toBe(true);
      expect(fakes.built[1].started).toEqual(["c"]);
    });

    it("once it has died", async () => {
      const fakes = pool();
      const first = fakes.pool.session().runAction(runRequest("a"));
      await settled();
      fakes.built[0].state = { alive: false, tlsPoisoned: false };
      fakes.built[0].finish();
      await first;

      await serve(fakes, runRequest("b"));
      expect(fakes.built).toHaveLength(2);
    });

    it("once a request switched TLS verification off", async () => {
      const fakes = pool();
      const first = fakes.pool.session().runAction(runRequest("a"));
      await settled();
      fakes.built[0].state = { alive: true, tlsPoisoned: true };
      fakes.built[0].finish();
      await first;

      expect(fakes.built[0].disposed).toBe(true);
    });

    it("past 80% of its heap budget", async () => {
      const fakes = pool({ heapMb: 100 });
      const memory = (heapMb: number) => ({
        rss: 0,
        heapUsed: heapMb * 1024 * 1024,
        heapTotal: 0,
        external: 0,
      });
      const first = fakes.pool.session().runAction(runRequest("a"));
      await settled();
      fakes.built[0].state = {
        alive: true,
        tlsPoisoned: false,
        memory: memory(79),
      };
      fakes.built[0].finish();
      await first;
      expect(fakes.built[0].disposed).toBe(false);

      const second = fakes.pool.session().runAction(runRequest("b"));
      await settled();
      fakes.built[0].state = { ...fakes.built[0].state, memory: memory(81) };
      fakes.built[0].finish();
      await second;
      expect(fakes.built[0].disposed).toBe(true);
    });

    it("idle above the warm minimum", async () => {
      const { built, pool: workers } = pool({
        size: 3,
        minWarm: 1,
        idleMs: 20,
      });
      const requests = ["a", "b", "c"].map((name) =>
        workers.session().runAction(runRequest(name)),
      );
      await settled();
      for (const worker of built) worker.finish();
      await Promise.all(requests);
      expect(workers.stats()).toMatchObject({ idle: 3 });

      await vi.waitFor(() =>
        expect(workers.stats()).toMatchObject({ idle: 1 }),
      );
      expect(built.filter((worker) => worker.disposed)).toHaveLength(2);
    });
  });

  it("serves trigger hooks from their own children while runs fill the pool", async () => {
    const { built, pool: workers } = pool();
    void workers.session().runAction(runRequest("a"));
    await settled();

    const hook = workers.session("trigger").runTriggerHook(hookRequest());
    await settled();

    expect(built).toHaveLength(2);
    expect(built[1].started).toEqual(["hook:run"]);
    built[1].finish();
    await hook;
  });

  it("serves the editor from its own child while runs fill the pool", async () => {
    const { built, pool: workers } = pool({ maxQueueDepth: 1 });
    void workers.session().runAction(runRequest("a"));
    void workers.session().runAction(runRequest("b"));
    await settled();

    // The run queue is at its cap; the editor's request neither waits nor fails.
    const options = workers.session("design").runAction(runRequest("pick"));
    await settled();

    expect(built).toHaveLength(2);
    expect(built[1].started).toEqual(["pick"]);
    built[1].finish({ ok: "pick" });
    await expect(options).resolves.toMatchObject({ output: { ok: "pick" } });
  });

  it("retires an idle editor child whatever the warm minimum", async () => {
    const { built, pool: workers } = pool({ minWarm: 1, idleMs: 20 });
    const run = workers.session().runAction(runRequest("a"));
    const design = workers.session("design").runAction(runRequest("pick"));
    await settled();
    for (const worker of built) worker.finish();
    await Promise.all([run, design]);

    await vi.waitFor(() => expect(built[1].disposed).toBe(true));
    expect(built[0].disposed).toBe(false);
  });

  it("boots at most maxConcurrentForks children at once", async () => {
    const { built, pool: workers } = pool({ size: 4, maxConcurrentForks: 2 });

    const requests = ["a", "b", "c"].map((name) =>
      workers.session().runAction(runRequest(name)),
    );
    await settled();
    expect(built).toHaveLength(2);
    expect(workers.stats()).toMatchObject({ waiting: 1 });

    built[0].finish();
    await settled();
    // A finished boot frees a fork, but the warm child serves the waiter first.
    expect(built).toHaveLength(2);
    expect(built[0].started).toEqual(["a", "c"]);
    built[0].finish();
    built[1].finish();
    await Promise.all(requests);
  });

  it("forks a lane's first child even while the other lane's children boot", async () => {
    const { built, pool: workers } = pool({ size: 4, maxConcurrentForks: 2 });
    void workers.session().runAction(runRequest("a"));
    void workers.session().runAction(runRequest("b"));
    await settled();

    void workers.session("trigger").runTriggerHook(hookRequest());
    await settled();

    expect(built).toHaveLength(3);
    expect(built[2].started).toEqual(["hook:run"]);
  });

  it("forks again once a boot window passes with no reply", async () => {
    const { built, pool: workers } = pool({ size: 2, maxConcurrentForks: 1 });
    void workers.session().runAction(runRequest("a"));
    void workers.session().runAction(runRequest("b"));
    await settled();
    expect(built).toHaveLength(1);

    // A's request is still running; its boot is long over.
    await vi.waitFor(() => expect(built).toHaveLength(2), { timeout: 3_000 });
    expect(built[1].started).toEqual(["b"]);
  });

  it("stops forking while memory is short, but forks a lane's first child", async () => {
    const { built, pool: workers } = pool({
      size: 4,
      memory: () => ({ limit: 1_000 * 1024 * 1024, used: 900 * 1024 * 1024 }),
    });

    void workers.session().runAction(runRequest("a"));
    void workers.session().runAction(runRequest("b"));
    await settled();

    expect(built).toHaveLength(1);
    expect(workers.stats()).toMatchObject({ active: 1, waiting: 1 });
  });

  it("fails fast past a queue depth an operator capped", async () => {
    const { pool: workers } = pool({ maxQueueDepth: 1 });

    void workers.session().runAction(runRequest("a"));
    void workers.session().runAction(runRequest("b"));
    await settled();

    await expect(
      workers.session().runAction(runRequest("c")),
    ).rejects.toBeInstanceOf(PieceWorkerPoolBusyError);
  });

  it("queues without limit by default", async () => {
    const { pool: workers } = pool();

    for (const name of ["a", "b", "c", "d"]) {
      void workers.session().runAction(runRequest(name));
    }
    await settled();

    expect(workers.stats()).toMatchObject({ active: 1, waiting: 3 });
  });

  it("kills every child and refuses queued requests on dispose", async () => {
    const { built, pool: workers } = pool();

    const live = workers.session().runAction(runRequest("a"));
    await settled();
    const queued = expect(
      workers.session().runAction(runRequest("b")),
    ).rejects.toThrow("disposed");
    await settled();

    workers.dispose();

    expect(built[0].disposed).toBe(true);
    await queued;
    // The in-flight request is the child's to reject; a real one dies with it.
    built[0].finish();
    await expect(live).resolves.toBeDefined();
    await expect(workers.session().runAction(runRequest("c"))).rejects.toThrow(
      "disposed",
    );
  });
});

describe("defaultPoolSize", () => {
  // A tiny heap budget leaves memory unbounded, so the cores decide.
  it("takes twice the cores, less one, and a core per three reactor threads", () => {
    const cores = os.availableParallelism();

    const capped = (n: number) => Math.max(1, Math.min(n, DEFAULT_POOL_MAX));

    expect(defaultPoolSize({ heapMb: 1 })).toBe(capped(2 * cores - 1));
    expect(defaultPoolSize({ heapMb: 1, reactorThreads: 6 })).toBe(
      capped(2 * cores - 3),
    );
  });

  it("stops at DEFAULT_POOL_MAX however many cores and how much memory", () => {
    const cores = vi.spyOn(os, "availableParallelism").mockReturnValue(64);
    try {
      expect(defaultPoolSize({ heapMb: 1 })).toBe(DEFAULT_POOL_MAX);
    } finally {
      cores.mockRestore();
    }
  });

  it("fits the children's heap budget into the memory left", () => {
    const heapMb = Math.ceil(os.totalmem() / 1024 / 1024 / 1.6 / 2);

    expect(defaultPoolSize({ heapMb })).toBeLessThanOrEqual(2);
  });
});

describe.skipIf(!httpBundle)("PieceWorkerPool over real children", () => {
  let server: http.Server;
  let baseUrl: string;

  // Answers nothing until two requests are in flight, so a pool that served
  // them one after another would never get its first response.
  beforeAll(async () => {
    const held: http.ServerResponse[] = [];
    server = http.createServer((_req, res) => {
      held.push(res);
      if (held.length < 2) return;
      for (const response of held.splice(0)) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves two sessions from two children at the same time", async () => {
    const workers = new PieceWorkerPool({ size: 2 });
    const request = (session: IPieceWorker) =>
      session.runAction(
        {
          bundleDir: httpBundle,
          actionName: "send_request",
          propsValue: {
            method: "GET",
            url: `${baseUrl}/hold`,
            headers: {},
            queryParams: {},
            authType: "NONE",
            timeout: 20,
            failureMode: "continue_none",
          },
        },
        { timeoutMs: 25_000 },
      );

    try {
      const results = await Promise.all([
        request(workers.session()),
        request(workers.session()),
      ]);

      for (const result of results) {
        expect(result.output).toMatchObject({ status: 200 });
      }
    } finally {
      workers.dispose();
    }
  }, 30_000);
});
