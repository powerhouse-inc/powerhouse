// A supervisor stopped because its runtime shut down (the workflow singleton
// moved, or the host is stopping): the journal may already be the next
// owner's, so nothing queued on its lane may still poll, write or fire.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import type { PieceWorker, PieceWorkerResult } from "../pieces/index.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { coreTrigger } from "./core-blocks.js";
import { WorkflowRunStore } from "./store.js";
import {
  TriggerSupervisor,
  TriggerSupervisorStoppedError,
  type PieceTriggerBinding,
  type ScheduleTriggerBinding,
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
    supervisor = build(scoped());
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

  function build(handle: WorkflowRunStore): TriggerSupervisor {
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

  // The claim commits, and stop() lands before the item fires: the key goes
  // back, or the next owner's re-poll inside the TTL drops the item for good.
  describe("an item whose dedupe key is claimed as it stops", () => {
    function holdClaim() {
      const claimed = gate();
      const release = gate();
      const handle = scoped();
      handle.claimDedupe = async (...args) => {
        const result = await store.claimDedupe(...args);
        claimed.open();
        await release.opened;
        return result;
      };
      supervisor = build(handle);
      return { claimed: claimed.opened, release: release.open };
    }

    async function nextOwnerFires(workflowId: string) {
      const next = build(scoped());
      await next.upsert(piece(workflowId));
      await due(workflowId);
      await next.tick();
      next.stop();
      expect(fired).toEqual([
        {
          workflowId,
          payload: { from: workflowId, _dedupe_key: `item-${workflowId}` },
        },
      ]);
    }

    it("fires on the next owner's poll after a refused poll fire", async () => {
      const a = `${prefix}-a`;
      const { claimed, release } = holdClaim();
      await supervisor.upsert(piece(a));
      await due(a);
      const tick = supervisor.tick().catch(() => undefined);
      await claimed;

      supervisor.stop();
      release();
      await tick;

      expect(fired).toEqual([]);
      await nextOwnerFires(a);
    });

    it("fires on the next owner's poll after a refused webhook delivery", async () => {
      const a = `${prefix}-a`;
      const { claimed, release } = holdClaim();
      await supervisor.upsert(piece(a));
      const delivered = supervisor
        .deliverWebhook(a, { body: "x" })
        .catch((error: unknown) => error);
      await claimed;

      supervisor.stop();
      release();

      expect(await delivered).toBeInstanceOf(TriggerSupervisorStoppedError);
      expect(fired).toEqual([]);
      await nextOwnerFires(a);
    });
  });
});
