// Supervisor robustness over a real PGlite-backed store with a stub worker and
// an injected clock: onEnable retry/backoff, and the poll cursor guard.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import type { PieceWorker, PieceWorkerResult } from "../pieces/index.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactorConnectors from "../pieces/index.js";

// No bundle ever loads: the stub worker below answers for the piece.
vi.mock("../pieces/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactorConnectors>();
  return {
    ...actual,
    ensurePieceBundle: vi.fn(() =>
      Promise.resolve({
        dir: "/nonexistent",
        source: "cache",
        dependencies: {},
        installed: false,
      }),
    ),
  };
});

import { SCHEDULE_BLOCK } from "./schedule.js";
import { WorkflowRunStore } from "./store.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
  type TriggerSupervisorOptions,
} from "./trigger-supervisor.js";

const INTERVAL_MS = 60_000;

let clock = new Date("2026-09-04T09:00:00.000Z");
const setClock = (iso: string) => {
  clock = new Date(iso);
};
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

interface WorkerStub {
  strategy: string;
  enable: () => PieceWorkerResult;
  run: () => PieceWorkerResult;
}

const result = (over: Partial<PieceWorkerResult> = {}): PieceWorkerResult => ({
  output: [],
  touched: [],
  tlsPoisoned: false,
  ...over,
});

function binding(workflowId: string): PieceTriggerBinding {
  return {
    workflowId,
    blockType: "@acme/piece-x@1.0.0#trigger:new_thing",
    packageName: "@acme/piece-x",
    version: "1.0.0",
    triggerName: "new_thing",
    config: {},
    connectionId: null,
  };
}

describe("TriggerSupervisor robustness", () => {
  let store: WorkflowRunStore;
  let handle: WorkflowRunStore;
  let dbBroken: boolean;
  let supervisor: TriggerSupervisor;
  let stub: WorkerStub;
  let fired: unknown[];
  let calls: { hook: string; isRepublish?: boolean }[];

  const worker = {
    describePiece: () =>
      Promise.resolve(
        result({
          output: {
            triggers: [{ name: "new_thing", strategy: stub.strategy }],
          },
        }),
      ),
    runTriggerHook: (request: { hook: string; isRepublish?: boolean }) => {
      calls.push({ hook: request.hook, isRepublish: request.isRepublish });
      return Promise.resolve(
        request.hook === "onEnable" ? stub.enable() : stub.run(),
      );
    },
    dispose: () => undefined,
  } as unknown as PieceWorker;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
    // The supervisor's view of the store, with one read the tests can break.
    handle = Object.create(store) as WorkflowRunStore;
    handle.getTriggerState = (workflowId: string) =>
      dbBroken
        ? Promise.reject(new Error("db unreachable"))
        : store.getTriggerState(workflowId);
  });

  const newSupervisor = (extra: Partial<TriggerSupervisorOptions> = {}) =>
    new TriggerSupervisor({
      store: () => Promise.resolve(handle),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (_workflowId, payload) => {
        fired.push(payload);
      },
      cacheDir: "/nonexistent",
      worker,
      defaultIntervalMs: INTERVAL_MS,
      now: () => clock,
      ...extra,
    });

  beforeEach(() => {
    fired = [];
    calls = [];
    dbBroken = false;
    setClock("2026-09-04T09:00:00.000Z");
    stub = {
      strategy: "POLLING",
      enable: () => result(),
      run: () => result(),
    };
    supervisor = newSupervisor();
  });

  it("retries a failed onEnable with backoff instead of parking it", async () => {
    const wf = "wf-retry-ok";
    stub.enable = () => {
      throw new Error("ECONNRESET");
    };
    await supervisor.upsert(binding(wf));

    let row = await store.getTriggerState(wf);
    expect(row?.status).toBe("ERROR");
    expect(row?.consecutive_failures).toBe(1);
    // First retry is one doubling of the interval out, as a failed poll is.
    expect(row?.next_poll_at).toBe("2026-09-04T09:02:00.000Z");

    // Nothing happens before the retry falls due.
    advance(60_000);
    stub.enable = () => result({ storeState: { [`flow_${wf}/lastPoll`]: 1 } });
    await supervisor.tick();
    expect((await store.getTriggerState(wf))?.status).toBe("ERROR");

    advance(60_001);
    await supervisor.tick();
    row = await store.getTriggerState(wf);
    expect(row?.status).toBe("ENABLED");
    expect(row?.consecutive_failures).toBe(0);
    expect(row?.last_error).toBeNull();
  });

  it("keeps repeated failures visible and caps the retry gap", async () => {
    const wf = "wf-retry-visible";
    stub.enable = () => {
      throw new Error("the provider is down");
    };
    await supervisor.upsert(binding(wf));

    for (let attempt = 2; attempt <= 12; attempt += 1) {
      const before = await store.getTriggerState(wf);
      setClock(before!.next_poll_at!);
      await supervisor.tick();
      const row = await store.getTriggerState(wf);
      expect(row?.status).toBe("ERROR");
      expect(row?.consecutive_failures).toBe(attempt);
      expect(row?.last_error).toBe("the provider is down");
      const gap = Date.parse(row!.next_poll_at!) - clock.getTime();
      expect(gap).toBe(Math.min(INTERVAL_MS * 2 ** attempt, 30 * 60_000));
    }
  });

  it("parks a trigger whose failure no retry can fix", async () => {
    const wf = "wf-park";
    stub.strategy = "WEBHOOK";
    await supervisor.upsert(binding(wf));

    const row = await store.getTriggerState(wf);
    expect(row?.status).toBe("ERROR");
    expect(row?.next_poll_at).toBeNull();
    expect(row?.last_error).toContain("webhook endpoint");

    advance(60 * 60_000);
    await supervisor.tick();
    expect((await store.getTriggerState(wf))?.consecutive_failures).toBe(1);
  });

  it("keeps the trigger queued when the retry itself throws", async () => {
    const wf = "wf-retry-throws";
    stub.enable = () => {
      throw new Error("the provider is down");
    };
    await supervisor.upsert(binding(wf));

    // The store read at the top of enable fails: the attempt writes no outcome.
    dbBroken = true;
    setClock("2026-09-04T09:02:00.000Z");
    await supervisor.tick();
    expect((await store.getTriggerState(wf))?.consecutive_failures).toBe(1);

    dbBroken = false;
    stub.enable = () => result();
    setClock("2026-09-04T09:30:00.000Z");
    await supervisor.tick();
    expect((await store.getTriggerState(wf))?.status).toBe("ENABLED");
  });

  it("does not let a broken retry starve the due rows", async () => {
    const polling = "wf-poll-on";
    const stuck = "wf-retry-broken";
    stub.run = () => result({ output: [{ id: "item-1" }] });
    await supervisor.upsert(binding(polling));
    stub.enable = () => {
      throw new Error("the provider is down");
    };
    await supervisor.upsert(binding(stuck));

    dbBroken = true;
    setClock("2026-09-04T09:05:00.000Z");
    await supervisor.tick();

    expect(fired).toEqual([{ id: "item-1" }]);
  });

  it("re-registers on retry rather than claiming a republish", async () => {
    const wf = "wf-republish";
    stub.enable = () => {
      throw new Error("timed out");
    };
    await supervisor.upsert(binding(wf));
    expect(calls).toEqual([{ hook: "onEnable", isRepublish: false }]);

    calls = [];
    stub.enable = () => result();
    setClock("2026-09-04T09:02:00.000Z");
    await supervisor.tick();
    // The failed attempt may have subscribed, so the retry releases first, and
    // it registers again instead of telling the piece nothing changed.
    expect(calls).toEqual([
      { hook: "onDisable", isRepublish: undefined },
      { hook: "onEnable", isRepublish: false },
    ]);
    expect((await store.getTriggerState(wf))?.status).toBe("ENABLED");
  });

  it("retries when the webhook endpoint is not minted yet", async () => {
    const wf = "wf-webhook-race";
    // Minted only later in the test, which is the race being exercised.
    const endpoint: { url?: string } = {};
    stub.strategy = "WEBHOOK";
    supervisor = newSupervisor({
      webhookUrlFor: () => Promise.resolve(endpoint.url),
    });
    await supervisor.upsert(binding(wf));

    let row = await store.getTriggerState(wf);
    expect(row?.status).toBe("ERROR");
    expect(row?.next_poll_at).not.toBeNull();

    endpoint.url = `https://reactor.example/v1/webhooks/${wf}`;
    setClock("2026-09-04T09:02:00.000Z");
    await supervisor.tick();
    row = await store.getTriggerState(wf);
    expect(row?.status).toBe("ENABLED");
  });

  it("resumes the stored backoff after a restart instead of retrying at once", async () => {
    const wf = "wf-restart";
    stub.enable = () => {
      throw new Error("the provider is down");
    };
    await supervisor.upsert(binding(wf));
    const retryAt = (await store.getTriggerState(wf))!.next_poll_at;

    calls = [];
    const restarted = newSupervisor();
    await restarted.upsert(binding(wf));
    expect(calls).toEqual([]);
    const row = await store.getTriggerState(wf);
    expect(row?.consecutive_failures).toBe(1);
    expect(row?.next_poll_at).toBe(retryAt);
    restarted.stop();
  });

  it("takes the retry with it when the trigger becomes a schedule", async () => {
    const wf = "wf-kind-change";
    const other = "wf-kind-other";
    stub.enable = () => {
      throw new Error("the provider is down");
    };
    await supervisor.upsert(binding(wf));
    await supervisor.upsert(binding(other));

    calls = [];
    await supervisor.upsert({
      kind: "schedule",
      workflowId: wf,
      blockType: SCHEDULE_BLOCK,
      config: { mode: "interval", every: 5, unit: "minutes" },
    });
    // The piece binding it replaced is what names the registration to release.
    expect(calls).toEqual([{ hook: "onDisable", isRepublish: undefined }]);
    expect((await store.getTriggerState(wf))?.status).toBe("ENABLED");

    // The stranded entry would have taken the one retry slot on every tick.
    calls = [];
    setClock("2026-09-04T09:02:00.000Z");
    await supervisor.tick();
    expect(calls.map((call) => call.hook)).toEqual(["onDisable", "onEnable"]);
  });

  it("holds the interval floor when the retry itself throws", async () => {
    const wf = "wf-retry-floor";
    supervisor = newSupervisor({ defaultIntervalMs: 10_000 });
    stub.enable = () => {
      throw new Error("the provider is down");
    };
    await supervisor.upsert(binding(wf));

    dbBroken = true;
    setClock("2026-09-04T09:02:00.000Z");
    await supervisor.tick();

    dbBroken = false;
    stub.enable = () => result();
    // Four floored minutes out, not four times the sub-floor default.
    setClock("2026-09-04T09:02:40.000Z");
    await supervisor.tick();
    expect((await store.getTriggerState(wf))?.status).toBe("ERROR");

    setClock("2026-09-04T09:06:00.000Z");
    await supervisor.tick();
    expect((await store.getTriggerState(wf))?.status).toBe("ENABLED");
  });
});
