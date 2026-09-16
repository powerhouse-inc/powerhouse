// Every run gets a worker of its own, for the length of that run: the wiring
// between the pool and the block executor is the run scope, not the executor.
import { PieceWorkerPool } from "../pieces/index.js";
import { describe, expect, it } from "vitest";
import { currentPieceWorker } from "./run-scope.js";
import { WorkflowRuntimeService } from "./service.js";

const WORKFLOW_ID = "wf-workers";

function settled() {
  return new Promise((resolve) => setImmediate(resolve));
}

function workflowDocument() {
  return {
    header: { documentType: "powerhouse/workflow" },
    state: {
      global: {
        name: "Two steps",
        status: "ENABLED",
        version: 1,
        trigger: { id: "t1", blockType: "core#manual", config: {} },
        steps: [
          { id: "a", key: "first", blockType: "fake#ok", config: {} },
          { id: "b", key: "second", blockType: "fake#ok", config: {} },
        ],
        edges: [
          { id: "e1", from: "t1", to: "a", port: "next" },
          { id: "e2", from: "a", to: "b", port: "next" },
        ],
        variables: [],
      },
    },
  };
}

// The pool hands out sessions; the fake worker underneath each one only has to
// be identifiable, since no step here reaches a real piece.
function serviceWithPool(
  pool: PieceWorkerPool,
  onStep: (worker: unknown) => void,
): WorkflowRuntimeService {
  const service = new WorkflowRuntimeService();
  const internals = service as unknown as Record<string, unknown>;
  internals.subgraph = {
    reactorClient: { get: () => Promise.resolve(workflowDocument()) },
  };
  internals.pieceWorkers = pool;
  internals.executor = {
    // What a piece block would do: ask the scope which child is this run's.
    execute: () => {
      onStep(currentPieceWorker());
      return Promise.resolve({ output: {} });
    },
  };
  return service;
}

function fakePool() {
  const disposed: number[] = [];
  let built = 0;
  const pool = new PieceWorkerPool({
    size: 2,
    createWorker: () => {
      const id = ++built;
      return {
        runAction: () => Promise.reject(new Error("not used")),
        resolveOptions: () => Promise.reject(new Error("not used")),
        checkConnection: () => Promise.reject(new Error("not used")),
        describePiece: () => Promise.reject(new Error("not used")),
        runTriggerHook: () => Promise.reject(new Error("not used")),
        dispose: () => disposed.push(id),
      };
    },
  });
  return { pool, disposed };
}

describe("fire() and the worker pool", () => {
  it("keeps one session for the whole run", async () => {
    const { pool } = fakePool();
    const seen: unknown[] = [];

    await serviceWithPool(pool, (worker) => seen.push(worker)).fire(
      WORKFLOW_ID,
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    // Both steps of a run talk to the same child: a piece loaded by the first
    // is still loaded for the second.
    expect(seen[1]).toBe(seen[0]);
  });

  it("gives concurrent runs different sessions", async () => {
    const { pool } = fakePool();
    const seen: unknown[] = [];
    const service = serviceWithPool(pool, (worker) => seen.push(worker));

    await Promise.all([service.fire(WORKFLOW_ID), service.fire(WORKFLOW_ID)]);

    expect(new Set(seen).size).toBe(2);
  });

  it("closes the run's session however the run ends", async () => {
    const { pool, disposed } = fakePool();
    const service = new WorkflowRuntimeService();
    const internals = service as unknown as Record<string, unknown>;
    internals.subgraph = {
      reactorClient: { get: () => Promise.resolve(workflowDocument()) },
    };
    internals.pieceWorkers = pool;
    internals.executor = {
      // Takes the slot before failing. A step that fails without ever asking
      // for a worker would release a slot it never held, and pass either way.
      execute: async () => {
        await currentPieceWorker()!.runAction({
          bundleDir: "/nowhere",
          actionName: "boom",
          propsValue: {},
        });
      },
    };

    const result = await service.fire(WORKFLOW_ID);

    // A failed run is still a finished run: the child is killed and the slot
    // handed back, or the next run waits on a run that is already over.
    expect(result.status).toBe("FAILED");
    expect(disposed).toEqual([1]);
    expect(pool.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("takes the design worker with it on shutdown", () => {
    const { pool } = fakePool();
    const service = new WorkflowRuntimeService();
    const internals = service as unknown as Record<string, unknown>;
    internals.pieceWorkers = pool;
    let disposedDesign = false;
    internals.designWorker = {
      dispose: () => {
        disposedDesign = true;
      },
    };

    service.shutdown();

    // Forked on the editor's first request and never replaced, so a reload
    // leaves it running unless shutdown ends it too.
    expect(disposedDesign).toBe(true);
    expect(internals.designWorker).toBeUndefined();
  });

  it("refuses a run that reaches the pool after shutdown", async () => {
    const { pool, disposed } = fakePool();
    const service = new WorkflowRuntimeService();
    const internals = service as unknown as Record<string, unknown>;
    let release: (() => void) | undefined;
    internals.subgraph = {
      reactorClient: {
        // Holds the run between its first await and the pool, which is where
        // a teardown lands on a reactor that is still serving.
        get: () =>
          new Promise((resolve) => {
            release = () => resolve(workflowDocument());
          }),
      },
    };
    internals.pieceWorkers = pool;
    internals.executor = { execute: () => Promise.resolve({ output: {} }) };

    const run = service.fire(WORKFLOW_ID);
    await settled();
    service.shutdown();
    release?.();

    // The disposed pool is kept rather than cleared, so the run fails instead
    // of quietly building a second pool and forking into it.
    await expect(run).rejects.toThrow("disposed");
    expect(disposed).toEqual([]);
  });

  it("takes no slot for a run that never reaches a piece step", async () => {
    const { pool, disposed } = fakePool();

    await serviceWithPool(pool, () => undefined).fire(WORKFLOW_ID);

    // The steps above never called through to the worker, so no child was
    // forked for them — the session cost the run nothing.
    expect(disposed).toEqual([]);
    expect(pool.stats()).toMatchObject({ active: 0, waiting: 0 });
  });
});
