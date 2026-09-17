// The pool's whole job is what one shared PieceWorker could not do: run more
// than one run's piece steps at once, each in a child of its own.
import http from "node:http";
import type { AddressInfo } from "node:net";
import type {
  IPieceWorker,
  PieceWorkerResult,
} from "../../src/activepieces/worker/host.js";
import {
  PieceWorkerPool,
  PieceWorkerPoolBusyError,
  PieceWorkerSessionClosedError,
} from "../../src/activepieces/worker/pool.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const httpBundle = await fetchBundleForTest(
  "@activepieces/piece-http",
  "0.11.19",
);

interface FakeWorker extends IPieceWorker {
  readonly id: number;
  readonly started: string[];
  disposed: boolean;
  finish(output: unknown): void;
}

// Every request parks until the test finishes it, so "these two ran at the
// same time" is observable rather than a matter of timing.
function fakeWorkers() {
  const built: FakeWorker[] = [];
  const createWorker = (): IPieceWorker => {
    const started: string[] = [];
    let settle: ((result: PieceWorkerResult) => void) | undefined;
    const worker: FakeWorker = {
      id: built.length + 1,
      started,
      disposed: false,
      runAction(request) {
        started.push(request.actionName);
        return new Promise<PieceWorkerResult>((resolve) => {
          settle = resolve;
        });
      },
      resolveOptions: () => Promise.reject(new Error("not used")),
      checkConnection: () => Promise.reject(new Error("not used")),
      describePiece: () => Promise.reject(new Error("not used")),
      runTriggerHook: () => Promise.reject(new Error("not used")),
      dispose() {
        this.disposed = true;
      },
      finish(output) {
        settle?.({ output, touched: [], tlsPoisoned: false });
      },
    };
    built.push(worker);
    return worker;
  };
  return { built, createWorker };
}

function runRequest(actionName: string) {
  return { bundleDir: "/nowhere", actionName, propsValue: {} };
}

// Lets the microtask queue drain, so a request that could have started has.
function settled() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("PieceWorkerPool", () => {
  it("runs as many sessions at once as it has slots", async () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 2, createWorker });

    const a = pool.session();
    const b = pool.session();
    const first = a.runAction(runRequest("a"));
    const second = b.runAction(runRequest("b"));
    await settled();

    // Two children, both mid-step: the shared worker managed one at a time.
    expect(built).toHaveLength(2);
    expect(built[0].started).toEqual(["a"]);
    expect(built[1].started).toEqual(["b"]);
    expect(pool.stats()).toEqual({ size: 2, active: 2, waiting: 0 });

    built[0].finish({ ok: "a" });
    built[1].finish({ ok: "b" });
    await expect(first).resolves.toMatchObject({ output: { ok: "a" } });
    await expect(second).resolves.toMatchObject({ output: { ok: "b" } });
  });

  it("holds a session back until a slot frees, then serves it", async () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    const a = pool.session();
    const b = pool.session();
    void a.runAction(runRequest("a"));
    const queued = b.runAction(runRequest("b"));
    await settled();

    expect(built).toHaveLength(1);
    expect(pool.stats()).toMatchObject({ active: 1, waiting: 1 });

    a.close();
    await settled();

    expect(built).toHaveLength(2);
    expect(built[1].started).toEqual(["b"]);
    built[1].finish({ ok: "b" });
    await expect(queued).resolves.toMatchObject({ output: { ok: "b" } });
  });

  it("gives each session its own child and kills it on close", async () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    const first = pool.session();
    const one = first.runAction(runRequest("a"));
    await settled();
    built[0].finish({});
    await one;
    first.close();

    const second = pool.session();
    void second.runAction(runRequest("b"));
    await settled();

    // A fresh child rather than the one the last run left behind: nothing it
    // loaded, cached or was handed carries into the next run.
    expect(built).toHaveLength(2);
    expect(built[0].disposed).toBe(true);
    expect(built[1].disposed).toBe(false);
  });

  it("keeps a session on one child for the whole run", async () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 2, createWorker });
    const session = pool.session();

    const first = session.runAction(runRequest("a"));
    await settled();
    built[0].finish({});
    await first;
    const second = session.runAction(runRequest("b"));
    await settled();

    expect(built).toHaveLength(1);
    expect(built[0].started).toEqual(["a", "b"]);
    built[0].finish({});
    await second;
  });

  it("takes no slot for a session that never runs a piece step", () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    const session = pool.session();
    session.close();

    expect(built).toHaveLength(0);
    expect(pool.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("refuses a request once the session is closed", async () => {
    const { createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    const session = pool.session();
    session.close();

    await expect(session.runAction(runRequest("a"))).rejects.toBeInstanceOf(
      PieceWorkerSessionClosedError,
    );
    expect(pool.stats()).toMatchObject({ active: 0 });
  });

  it("frees the slot when a queueing session closes before it is served", async () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    const holding = pool.session();
    void holding.runAction(runRequest("a"));
    await settled();
    const waiting = pool.session();
    // Asserted before the close that rejects it: an expectation attached
    // afterwards would let the rejection go unhandled first.
    const abandoned = expect(
      waiting.runAction(runRequest("b")),
    ).rejects.toBeInstanceOf(PieceWorkerSessionClosedError);
    await settled();

    waiting.close();
    holding.close();
    await abandoned;

    // The abandoned run forks nothing, and its slot is available again.
    expect(built).toHaveLength(1);
    expect(pool.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  // The window a shutdown lands in: the slot was granted, the child built, and
  // the request not yet sent. Dispatching then forks a child nothing tracks.
  it("refuses to dispatch to a session disposed while it waited", async () => {
    const { built, createWorker } = fakeWorkers();
    let pool: PieceWorkerPool;
    pool = new PieceWorkerPool({
      size: 1,
      createWorker: () => {
        // Runs between the slot being granted and the request going out.
        pool.dispose();
        return createWorker();
      },
    });

    await expect(
      pool.session().runAction(runRequest("a")),
    ).rejects.toBeInstanceOf(PieceWorkerSessionClosedError);
    expect(built[0].started).toEqual([]);
    expect(pool.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("fails fast past a queue depth an operator capped", async () => {
    const { createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({
      size: 1,
      maxQueueDepth: 1,
      createWorker,
    });

    void pool.session().runAction(runRequest("a"));
    await settled();
    void pool.session().runAction(runRequest("b"));
    await settled();

    await expect(
      pool.session().runAction(runRequest("c")),
    ).rejects.toBeInstanceOf(PieceWorkerPoolBusyError);
  });

  it("queues without limit by default", async () => {
    const { createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    void pool.session().runAction(runRequest("a"));
    for (const name of ["b", "c", "d"]) {
      void pool.session().runAction(runRequest(name));
    }
    await settled();

    expect(pool.stats()).toMatchObject({ active: 1, waiting: 3 });
  });

  it("kills live children and refuses queued sessions on dispose", async () => {
    const { built, createWorker } = fakeWorkers();
    const pool = new PieceWorkerPool({ size: 1, createWorker });

    const live = pool.session().runAction(runRequest("a"));
    await settled();
    const queued = expect(
      pool.session().runAction(runRequest("b")),
    ).rejects.toThrow("disposed");
    await settled();

    pool.dispose();

    expect(built[0].disposed).toBe(true);
    await queued;
    // The in-flight request is the child's to reject; a real one dies with it.
    built[0].finish({});
    await expect(live).resolves.toBeDefined();
    expect(() => pool.session()).toThrow("disposed");
  });
});

// The fakes above prove the bookkeeping; this proves the point of it, over
// real forked children running a real piece.
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
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves two sessions from two children at the same time", async () => {
    const pool = new PieceWorkerPool({ size: 2 });
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
        request(pool.session()),
        request(pool.session()),
      ]);

      for (const result of results) {
        expect(result.output).toMatchObject({ status: 200 });
      }
    } finally {
      pool.dispose();
    }
  }, 30_000);
});
