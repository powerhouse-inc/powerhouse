// A supervisor stopped because its runtime shut down (the workflow singleton
// moved, or the host is stopping): the journal may already be the next
// owner's, so nothing queued on its lane may still poll, write or fire.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import {
  PieceWorkerExitError,
  type PieceWorker,
  type PieceWorkerResult,
} from "../pieces/index.js";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { coreTrigger } from "./core-blocks.js";
import { WorkflowRunStore, type WorkflowRuntimeDB } from "./store.js";
import {
  isShutdownRefusal,
  TriggerSupervisor,
  TriggerSupervisorStoppedError,
  type PieceTriggerBinding,
  type ScheduleTriggerBinding,
  type TriggerSupervisorOptions,
} from "./trigger-supervisor.js";

const PAST = "2000-01-01T00:00:00.000Z";

const result = (over: Partial<PieceWorkerResult> = {}): PieceWorkerResult => ({
  output: [],
  touched: [],
  tlsPoisoned: false,
  ...over,
});

function piece(workflowId: string): PieceTriggerBinding {
  return {
    workflowId,
    block: {
      pieceName: "@acme/piece-x",
      pieceVersion: "1.0.0",
      kind: "trigger" as const,
      name: "new_thing",
    },
    packageName: "@acme/piece-x",
    version: "1.0.0",
    triggerName: "new_thing",
    config: {},
    connectionId: null,
  };
}

function schedule(workflowId: string): ScheduleTriggerBinding {
  return {
    kind: "schedule",
    workflowId,
    block: coreTrigger("schedule"),
    config: { mode: "interval", every: 1, unit: "minutes" },
  };
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe("TriggerSupervisor after stop()", () => {
  let store: WorkflowRunStore;
  let supervisor: TriggerSupervisor;
  let fired: { workflowId: string; payload: unknown }[];
  let hooks: { workflowId: string; hook: string }[];
  // The first `run` hook of the named workflow advances its cursor, then
  // waits here: the poll stop() lands in.
  let held: { workflowId: string; started: () => void; release: Promise<void> };
  let prefix: string;
  // Runs ahead of the fake's own handling; undefined falls through to it.
  let intercept:
    | ((request: {
        hook: string;
        identity: { flowId: string };
      }) => Promise<PieceWorkerResult | undefined>)
    | undefined;

  const worker = {
    describePiece: () =>
      Promise.resolve(
        result({
          output: { triggers: [{ name: "new_thing", strategy: "POLLING" }] },
        }),
      ),
    runTriggerHook: async (request: {
      hook: string;
      identity: { flowId: string };
    }) => {
      const workflowId = request.identity.flowId;
      hooks.push({ workflowId, hook: request.hook });
      const intercepted = await intercept?.(request);
      if (intercepted) return intercepted;
      if (request.hook === "run" && workflowId === held.workflowId) {
        await store.setPieceStoreValue("FLOW", workflowId, "cursor", "after");
        held.started();
        await held.release;
      }
      return result({
        output:
          request.hook === "run"
            ? [{ from: workflowId, _dedupe_key: `item-${workflowId}` }]
            : undefined,
      });
    },
    dispose: () => undefined,
  } as unknown as PieceWorker;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  let seq = 0;
  beforeEach(() => {
    seq += 1;
    prefix = `wf-stop-${seq}`;
    fired = [];
    hooks = [];
    held = {
      workflowId: "",
      started: () => undefined,
      release: Promise.resolve(),
    };
    intercept = undefined;
    supervisor = build(scoped());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Due rows in a known order, so the held poll is the first one.
  function scoped(): WorkflowRunStore {
    const handle = Object.create(store) as WorkflowRunStore;
    handle.listDueTriggerStates = async (now: string) =>
      (await store.listDueTriggerStates(now))
        .filter((row) => row.workflow_id.startsWith(prefix))
        .sort((a, b) => a.workflow_id.localeCompare(b.workflow_id));
    return handle;
  }

  function build(
    handle: WorkflowRunStore,
    over: Partial<TriggerSupervisorOptions> = {},
  ): TriggerSupervisor {
    return new TriggerSupervisor({
      store: () => Promise.resolve(handle),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (workflowId, payload) => {
        fired.push({ workflowId, payload });
      },
      cacheDir: "/nonexistent",
      resolver: {
        resolve: (target) =>
          Promise.resolve({
            ...target,
            bundleDir: "/nonexistent",
            local: false,
          }),
      },
      worker,
      ...over,
    });
  }

  const due = async (workflowId: string) => {
    const row = await store.getTriggerState(workflowId);
    await store.upsertTriggerState({ ...row!, next_poll_at: PAST });
  };

  // Enables each, makes them all due, and starts a tick held in the first.
  async function holdTick(
    bindings: (PieceTriggerBinding | ScheduleTriggerBinding)[],
  ) {
    for (const binding of bindings) await supervisor.upsert(binding);
    for (const binding of bindings) {
      expect((await store.getTriggerState(binding.workflowId))?.status).toBe(
        "ENABLED",
      );
      await due(binding.workflowId);
    }
    const first = bindings[0]!.workflowId;
    await store.setPieceStoreValue("FLOW", first, "cursor", "before");
    const release = gate();
    const started = gate();
    held = {
      workflowId: first,
      started: started.open,
      release: release.opened,
    };
    hooks = [];
    const tick = supervisor.tick().catch(() => undefined);
    await started.opened;
    return { release: release.open, tick };
  }

  it("polls no further row, and moves no cursor or poll time, once stopped mid-poll", async () => {
    const [a, b, c] = [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`];
    const { release, tick } = await holdTick([piece(a), piece(b), schedule(c)]);

    supervisor.stop();
    release();
    await tick;

    expect(fired).toEqual([]);
    expect(hooks).toEqual([{ workflowId: a, hook: "run" }]);
    expect(await store.getPieceStoreValue("FLOW", a, "cursor")).toBe("before");
    for (const workflowId of [a, b, c]) {
      const row = await store.getTriggerState(workflowId);
      expect(row?.next_poll_at).toBe(PAST);
      expect(row?.consecutive_failures).toBe(0);
    }
  });

  it("writes no park or enable that was queued behind the lane when it stopped", async () => {
    const a = `${prefix}-a`;
    const { release, tick } = await holdTick([piece(a)]);
    const parked = supervisor
      .park(`${prefix}-parked`, 1, "failed")
      .catch((error: unknown) => error);
    const enabled = supervisor
      .upsert(piece(`${prefix}-enabled`))
      .catch((error: unknown) => error);

    supervisor.stop();
    release();
    await tick;

    const refused = [await parked, await enabled];
    expect(await store.getWorkflowPark(`${prefix}-parked`)).toBeUndefined();
    expect(await store.getTriggerState(`${prefix}-enabled`)).toBeUndefined();
    expect(hooks).toEqual([{ workflowId: a, hook: "run" }]);
    for (const error of refused) expect(error).toBeInstanceOf(Error);
  });

  it("refuses lane work asked for after it stopped", async () => {
    supervisor.stop();

    const refused = [
      await supervisor
        .park(`${prefix}-late`, 1, "failed")
        .catch((error: unknown) => error),
      await supervisor
        .upsert(piece(`${prefix}-late`))
        .catch((error: unknown) => error),
    ];
    await supervisor.tick();

    expect(await store.getWorkflowPark(`${prefix}-late`)).toBeUndefined();
    expect(await store.getTriggerState(`${prefix}-late`)).toBeUndefined();
    expect(hooks).toEqual([]);
    for (const error of refused) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("stopped");
    }
  });

  it("re-arms no enable retry that the stop refused", async () => {
    const a = `${prefix}-a`;
    const started = gate();
    const release = gate();
    let enables = 0;
    intercept = async (request) => {
      if (request.hook !== "onEnable" || request.identity.flowId !== a) {
        return undefined;
      }
      enables += 1;
      if (enables === 1) throw new Error("provider down");
      started.open();
      await release.opened;
      return undefined;
    };
    await supervisor.upsert(piece(a));
    const retries = (
      supervisor as unknown as {
        enableRetries: Map<string, { at: number; failures: number }>;
      }
    ).enableRetries;
    retries.get(a)!.at = 0;
    const before = { ...retries.get(a)! };

    const tick = supervisor.tick().catch(() => undefined);
    await started.opened;
    supervisor.stop();
    release.open();
    await tick;

    expect(retries.get(a)).toEqual(before);
  });

  // stop() disposes the worker it built, which kills a hook in flight.
  describe("a hook the stop killed in flight", () => {
    function killable(workflowId: string) {
      const started = gate();
      let kill: (error: Error) => void = () => undefined;
      const owned = build(scoped(), { worker: undefined, tickMs: 5 });
      (owned as unknown as { worker: PieceWorker }).worker = {
        ...worker,
        runTriggerHook: async (request: {
          hook: string;
          identity: { flowId: string };
        }) => {
          if (
            request.hook !== "run" ||
            request.identity.flowId !== workflowId
          ) {
            return worker.runTriggerHook(request as never);
          }
          await store.setPieceStoreValue("FLOW", workflowId, "cursor", "after");
          started.open();
          return new Promise<PieceWorkerResult>((_, reject) => {
            kill = reject;
          });
        },
        dispose: () => kill(new PieceWorkerExitError(null, "SIGTERM")),
      } as unknown as PieceWorker;
      return { owned, started: started.opened };
    }

    it("logs the tick it cut short below error level, and still rewinds the cursor", async () => {
      const a = `${prefix}-a`;
      const errors = vi.spyOn(console, "error");
      const { owned, started } = killable(a);
      await owned.upsert(piece(a));
      await due(a);
      await store.setPieceStoreValue("FLOW", a, "cursor", "before");

      owned.start();
      await started;
      owned.stop();
      await vi.waitFor(() =>
        expect((owned as unknown as { ticking: boolean }).ticking).toBe(false),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(await store.getPieceStoreValue("FLOW", a, "cursor")).toBe(
        "before",
      );
      const logged = errors.mock.calls.map((call) => String(call[0]));
      expect(logged.filter((line) => line.includes("Trigger tick"))).toEqual(
        [],
      );
    });

    it("rejects a webhook delivery it cut short as its refusal, cursor rewound", async () => {
      const a = `${prefix}-a`;
      const { owned, started } = killable(a);
      await owned.upsert(piece(a));
      await store.setPieceStoreValue("FLOW", a, "cursor", "before");

      const delivered = owned
        .deliverWebhook(a, { body: "x" })
        .catch((error: unknown) => error);
      await started;
      owned.stop();

      const error = await delivered;
      expect(isShutdownRefusal(error)).toBe(true);
      expect((error as Error).cause).toBeInstanceOf(PieceWorkerExitError);
      expect(await store.getPieceStoreValue("FLOW", a, "cursor")).toBe(
        "before",
      );
    });
  });

  it("journals an item with no dedupe key before firing it", async () => {
    const a = `${prefix}-a`;
    const runIds: (string | undefined)[] = [];
    supervisor = build(scoped(), {
      fire: (_workflowId, _payload, _kind, runId) => {
        runIds.push(runId);
      },
    });
    intercept = (request) =>
      Promise.resolve(
        request.hook === "run" ? result({ output: [{ from: a }] }) : undefined,
      );
    await supervisor.upsert(piece(a));
    await due(a);

    await supervisor.tick();

    expect(runIds).toHaveLength(1);
    const run = await store.getRun(runIds[0]!);
    expect(run?.status).toBe("PENDING");
    expect(JSON.parse(run!.trigger_payload!)).toEqual({ from: a });
  });

  // stop() lands while the batch's journal write is in flight.
  describe("a batch journaled as it stops", () => {
    function holdJournal(handle = scoped()) {
      const journaled = gate();
      const release = gate();
      handle.journalTriggerItems = async (...args) => {
        const runIds = await store.journalTriggerItems(...args);
        journaled.open();
        await release.opened;
        return runIds;
      };
      supervisor = build(handle);
      return { journaled: journaled.opened, release: release.open };
    }

    const items = (workflowId: string) => [
      { from: workflowId, n: 1 },
      { from: workflowId, _dedupe_key: `item-${workflowId}` },
    ];

    // The hook checkpoints past both items, a keyless one and a keyed one.
    async function armBatch(workflowId: string) {
      intercept = async (request) => {
        if (request.hook !== "run") return undefined;
        await store.setPieceStoreValue("FLOW", workflowId, "cursor", "after");
        return result({ output: items(workflowId) });
      };
      await supervisor.upsert(piece(workflowId));
      await store.setPieceStoreValue("FLOW", workflowId, "cursor", "before");
    }

    // Recorded once: CANCELLED, never left FAILED to rerun beside the redelivery.
    async function redelivered(workflowId: string) {
      const runs = await store.listRuns(workflowId);
      expect(runs).toHaveLength(2);
      for (const run of runs) {
        expect(run.status).toBe("CANCELLED");
        expect(run.error).toContain("Redelivered");
      }
      expect(
        runs.map((run) => JSON.parse(run.trigger_payload!) as unknown),
      ).toEqual(expect.arrayContaining(items(workflowId)));
      expect(await store.getPieceStoreValue("FLOW", workflowId, "cursor")).toBe(
        "before",
      );
    }

    // Inside the TTL too: the claim went with the cancelled run.
    async function nextOwnerFires(workflowId: string) {
      const next = build(scoped());
      await next.upsert(piece(workflowId));
      await due(workflowId);
      await next.tick();
      next.stop();
      expect(fired.map(({ payload }) => payload)).toEqual(items(workflowId));
    }

    it("cancels a refused poll batch as redelivered, and the next poll fires it", async () => {
      const a = `${prefix}-a`;
      const { journaled, release } = holdJournal();
      await armBatch(a);
      await due(a);
      const tick = supervisor.tick().catch(() => undefined);
      await journaled;

      supervisor.stop();
      release();
      await tick;

      expect(fired).toEqual([]);
      await redelivered(a);
      await nextOwnerFires(a);
    });

    it("cancels a refused webhook batch as redelivered, and the next poll fires it", async () => {
      const a = `${prefix}-a`;
      const { journaled, release } = holdJournal();
      await armBatch(a);
      const delivered = supervisor
        .deliverWebhook(a, { body: "x" })
        .catch((error: unknown) => error);
      await journaled;

      supervisor.stop();
      release();

      expect(await delivered).toBeInstanceOf(TriggerSupervisorStoppedError);
      expect(fired).toEqual([]);
      await redelivered(a);
      await nextOwnerFires(a);
    });

    // A next owner's poll seeing this state absorbs the keyed item.
    it("never shows the rewound cursor with the batch's claim still held", async () => {
      const a = `${prefix}-a`;
      const db =
        await createTestRelationalDb().createNamespace<WorkflowRuntimeDB>(
          "workflow_runtime",
        );
      const seen: { cursor: unknown; claims: number }[] = [];
      const observe = async () => {
        const claims = await db
          .selectFrom("trigger_dedupe")
          .select("run_id")
          .where("workflow_id", "=", a)
          .where("run_id", "is not", null)
          .execute();
        seen.push({
          cursor: await store.getPieceStoreValue("FLOW", a, "cursor"),
          claims: claims.length,
        });
      };
      const handle = scoped();
      const { journaled, release } = holdJournal(handle);
      const observed = new Proxy(handle, {
        get(target, key) {
          const value: unknown = Reflect.get(target, key);
          if (typeof value !== "function") return value;
          return async (...args: unknown[]) => {
            const out: unknown = await (
              value as (...a: unknown[]) => unknown
            ).apply(target, args);
            await observe();
            return out;
          };
        },
      });
      supervisor = build(observed);
      await armBatch(a);
      await due(a);
      const tick = supervisor.tick().catch(() => undefined);
      await journaled;

      supervisor.stop();
      release();
      await tick;

      expect(seen.some(({ cursor }) => cursor === "before")).toBe(true);
      expect(
        seen.filter(({ cursor, claims }) => claims > 0 && cursor !== "after"),
      ).toEqual([]);
      await redelivered(a);
      await nextOwnerFires(a);
    });

    // The cursor is past the items, so the runs are their only record.
    it("fails the refused batch to rerun when the cursor cannot be put back", async () => {
      const a = `${prefix}-a`;
      const handle = scoped();
      const { journaled, release } = holdJournal(handle);
      await armBatch(a);
      handle.rewindPieceStore = () => Promise.reject(new Error("db gone"));
      await due(a);
      const tick = supervisor.tick().catch(() => undefined);
      await journaled;

      supervisor.stop();
      release();
      await tick;

      const runs = await store.listRuns(a);
      expect(runs).toHaveLength(2);
      for (const run of runs) {
        expect(run).toMatchObject({
          status: "FAILED",
          error_name: "TriggerSupervisorStoppedError",
        });
      }
    });
  });

  // The slot and its run are one write, so a stop leaves both or neither.
  it("fails the run of a schedule slot whose fire the stop refused", async () => {
    const c = `${prefix}-c`;
    const journaled = gate();
    const release = gate();
    const handle = scoped();
    handle.recordScheduleFire = async (...args) => {
      const runId = await store.recordScheduleFire(...args);
      journaled.open();
      await release.opened;
      return runId;
    };
    supervisor = build(handle);
    await supervisor.upsert(schedule(c));
    await due(c);
    const tick = supervisor.tick().catch(() => undefined);
    await journaled.opened;

    supervisor.stop();
    release.open();
    await tick;

    expect(fired).toEqual([]);
    const runs = await store.listRuns(c);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "FAILED",
      error_name: "TriggerSupervisorStoppedError",
      trigger_kind: "schedule",
    });
    expect(JSON.parse(runs[0]!.trigger_payload!)).toMatchObject({
      everyMs: 60_000,
    });
    expect((await store.getTriggerState(c))?.next_poll_at).not.toBe(PAST);
  });
});
