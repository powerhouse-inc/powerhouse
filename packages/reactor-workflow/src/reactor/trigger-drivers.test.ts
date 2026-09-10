// Driver-level contract: which kind owns a binding, what row each one arms,
// and that a request-driven piece is fed its payload instead of being polled.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TriggerStateRow, WorkflowRunStore } from "./store.js";
import {
  deliveryKindFor,
  type PieceTriggerBinding,
  type ScheduleTriggerBinding,
} from "./trigger-binding.js";
import type { TriggerDriverContext } from "./trigger-driver.js";
import {
  piecePollDriver,
  pieceWebhookDriver,
  scheduleDriver,
} from "./trigger-drivers.js";

const WF = "wf-1";
const NOW = new Date("2026-09-07T12:00:00.000Z");

const piece = (
  overrides: Partial<PieceTriggerBinding> = {},
): PieceTriggerBinding => ({
  workflowId: WF,
  blockType: "@acme/piece-x@1.0.0#trigger:new_thing",
  packageName: "@acme/piece-x",
  version: "1.0.0",
  triggerName: "new_thing",
  config: {},
  connectionId: null,
  ...overrides,
});

const schedule = (): ScheduleTriggerBinding => ({
  kind: "schedule",
  workflowId: WF,
  blockType: "core#schedule",
  config: { mode: "interval", every: 5, unit: "minutes" },
});

const row = (overrides: Partial<TriggerStateRow> = {}): TriggerStateRow => ({
  workflow_id: WF,
  block_type: "@acme/piece-x@1.0.0#trigger:new_thing",
  config_hash: "abc",
  status: "ENABLED",
  store_state: "{}",
  interval_ms: 0,
  next_poll_at: null,
  last_poll_at: null,
  last_error: null,
  consecutive_failures: 0,
  lease_owner: null,
  lease_expires_at: null,
  updated_at: NOW.toISOString(),
  ...overrides,
});

describe("deliveryKindFor", () => {
  it("routes each binding to exactly one driver", () => {
    expect(deliveryKindFor(schedule())).toBe("schedule");
    expect(deliveryKindFor(piece())).toBe("piece-poll");
    expect(deliveryKindFor(piece({ delivery: "poll" }))).toBe("piece-poll");
    expect(deliveryKindFor(piece({ delivery: "webhook" }))).toBe(
      "piece-webhook",
    );
  });
});

describe("driver capabilities", () => {
  it("keeps only the request-driven kind out of the timer", () => {
    expect(scheduleDriver.scheduled).toBe(true);
    expect(piecePollDriver.scheduled).toBe(true);
    expect(pieceWebhookDriver.scheduled).toBe(false);
    // `scheduled` and the presence of onDue have to agree: the supervisor
    // reads one and calls the other.
    expect("onDue" in scheduleDriver).toBe(true);
    expect("onDue" in piecePollDriver).toBe(true);
    expect("onDue" in pieceWebhookDriver).toBe(false);
  });

  it("gives only the piece kinds something to release", () => {
    expect("release" in piecePollDriver).toBe(true);
    expect("release" in pieceWebhookDriver).toBe(true);
    expect("release" in scheduleDriver).toBe(false);
  });
});

describe("driver arming", () => {
  let ctx: TriggerDriverContext;
  let runHook: ReturnType<typeof vi.fn>;
  let store: Record<string, ReturnType<typeof vi.fn>>;
  let fired: { payload: unknown; kind: string }[];

  beforeEach(() => {
    fired = [];
    runHook = vi.fn(() =>
      Promise.resolve({
        output: [],
        touched: [],
        tlsPoisoned: false,
        storeState: { cursor: "c1" },
        schedules: undefined,
      }),
    );
    store = {
      getTriggerState: vi.fn(() => Promise.resolve(row())),
      recordPollSuccess: vi.fn(() => Promise.resolve()),
      recordPollFailure: vi.fn(() => Promise.resolve()),
      setTriggerStatus: vi.fn(() => Promise.resolve()),
      claimDedupe: vi.fn(() => Promise.resolve(true)),
    };
    ctx = {
      store: store as unknown as WorkflowRunStore,
      now: () => NOW,
      fire: (_workflowId, payload, kind) => fired.push({ payload, kind }),
      defaultIntervalMs: 300_000,
      runHook: runHook as unknown as TriggerDriverContext["runHook"],
      markUnhealthy: vi.fn(),
    };
  });

  it("arms a poll binding with a cadence and a next slot", async () => {
    const state = await piecePollDriver.arm(
      piece(),
      { existing: undefined, isRepublish: false },
      ctx,
    );
    expect(state).toEqual({
      storeState: '{"cursor":"c1"}',
      intervalMs: 300_000,
      nextPollAt: "2026-09-07T12:05:00.000Z",
      lastPollAt: null,
      cadence: "every 300000ms",
    });
    expect(runHook).toHaveBeenCalledWith(
      expect.anything(),
      "onEnable",
      {},
      {
        isRepublish: false,
      },
    );
  });

  it("arms a webhook binding unscheduled", async () => {
    const state = await pieceWebhookDriver.arm(
      piece({ delivery: "webhook" }),
      { existing: undefined, isRepublish: false },
      ctx,
    );
    expect(state).toEqual({
      storeState: '{"cursor":"c1"}',
      intervalMs: 0,
      // Null is what keeps it out of listDueTriggerStates.
      nextPollAt: null,
      lastPollAt: null,
      cadence: "webhook",
    });
  });

  it("carries a piece cursor into onEnable only on an unchanged re-register", async () => {
    const existing = row({ store_state: '{"cursor":"c0"}' });
    await piecePollDriver.arm(piece(), { existing, isRepublish: true }, ctx);
    expect(runHook).toHaveBeenLastCalledWith(
      expect.anything(),
      "onEnable",
      { cursor: "c0" },
      { isRepublish: true },
    );

    await piecePollDriver.arm(piece(), { existing, isRepublish: false }, ctx);
    expect(runHook).toHaveBeenLastCalledWith(
      expect.anything(),
      "onEnable",
      {},
      { isRepublish: false },
    );
  });

  it("arms a schedule without touching the piece worker", async () => {
    const state = await scheduleDriver.arm(
      schedule(),
      { existing: undefined, isRepublish: false },
      ctx,
    );
    expect(state.intervalMs).toBe(300_000);
    expect(state.nextPollAt).toBe("2026-09-07T12:05:00.000Z");
    expect(state.cadence).toContain("next fire");
    expect(runHook).not.toHaveBeenCalled();
  });

  it("keeps an unchanged schedule's next fire time across a restart", async () => {
    const existing = row({
      status: "ENABLED",
      next_poll_at: "2026-09-07T12:03:00.000Z",
    });
    const state = await scheduleDriver.arm(
      schedule(),
      { existing, isRepublish: true },
      ctx,
    );
    expect(state.nextPollAt).toBe("2026-09-07T12:03:00.000Z");
    expect(state.cadence).toContain("carried over");
  });

  it("keeps the piece cursor on the ERROR row so a re-enable resumes", () => {
    const existing = row({ store_state: '{"cursor":"c0"}' });
    expect(
      piecePollDriver.failedState(
        piece(),
        { existing, isRepublish: true },
        ctx,
      ),
    ).toEqual({
      storeState: '{"cursor":"c0"}',
      intervalMs: 300_000,
      lastPollAt: null,
    });
  });
});

describe("pieceWebhookDriver.deliver", () => {
  let ctx: TriggerDriverContext;
  let runHook: ReturnType<typeof vi.fn>;
  let store: Record<string, ReturnType<typeof vi.fn>>;
  let fired: { payload: unknown; kind: string }[];
  let current: TriggerStateRow | undefined;

  const withOutput = (output: unknown) =>
    vi.fn(() =>
      Promise.resolve({
        output,
        touched: [],
        tlsPoisoned: false,
        storeState: { seen: 1 },
        schedules: undefined,
      }),
    );

  beforeEach(() => {
    fired = [];
    current = row();
    runHook = withOutput([{ id: "evt_1" }]);
    store = {
      getTriggerState: vi.fn(() => Promise.resolve(current)),
      recordPollSuccess: vi.fn(() => Promise.resolve()),
      claimDedupe: vi.fn(() => Promise.resolve(true)),
    };
    ctx = {
      store: store as unknown as WorkflowRunStore,
      now: () => NOW,
      fire: (_workflowId, payload, kind) => fired.push({ payload, kind }),
      defaultIntervalMs: 300_000,
      runHook: runHook as unknown as TriggerDriverContext["runHook"],
      markUnhealthy: vi.fn(),
    };
  });

  const binding = piece({ delivery: "webhook" });
  const payload = { method: "POST", body: { id: "evt_1" } };

  it("feeds the payload to the run hook and fires each item", async () => {
    const count = await pieceWebhookDriver.deliver(binding, payload, ctx);
    expect(count).toBe(1);
    expect(runHook).toHaveBeenCalledWith(
      expect.anything(),
      "run",
      {},
      { payload },
    );
    expect(fired).toEqual([
      {
        payload: { id: "evt_1" },
        kind: "piece:@acme/piece-x@1.0.0#trigger:new_thing",
      },
    ]);
  });

  it("persists the piece's cursor without scheduling a poll", async () => {
    await pieceWebhookDriver.deliver(binding, payload, ctx);
    expect(store.recordPollSuccess).toHaveBeenCalledWith(
      WF,
      '{"seen":1}',
      NOW.toISOString(),
      // A delivery is not a poll: next_poll_at stays null.
      null,
    );
  });

  it("fires once per item, or not at all for an empty batch", async () => {
    ctx.runHook = withOutput([
      { id: "a" },
      { id: "b" },
    ]) as unknown as TriggerDriverContext["runHook"];
    expect(await pieceWebhookDriver.deliver(binding, payload, ctx)).toBe(2);
    expect(fired).toHaveLength(2);

    fired.length = 0;
    ctx.runHook = withOutput([]) as unknown as TriggerDriverContext["runHook"];
    expect(await pieceWebhookDriver.deliver(binding, payload, ctx)).toBe(0);
    expect(fired).toHaveLength(0);
  });

  it("suppresses an item whose dedupe key was already claimed", async () => {
    ctx.runHook = withOutput([
      { _dedupe_key: "k1" },
    ]) as unknown as TriggerDriverContext["runHook"];
    store.claimDedupe.mockResolvedValue(false);
    expect(await pieceWebhookDriver.deliver(binding, payload, ctx)).toBe(1);
    expect(fired).toHaveLength(0);
  });

  it("refuses a delivery to a trigger that is not enabled", async () => {
    current = row({ status: "DISABLED" });
    await expect(
      pieceWebhookDriver.deliver(binding, payload, ctx),
    ).rejects.toThrow(/is not enabled/);
    current = undefined;
    await expect(
      pieceWebhookDriver.deliver(binding, payload, ctx),
    ).rejects.toThrow(/is not enabled/);
  });

  it("rejects a run hook that did not return a list", async () => {
    ctx.runHook = withOutput({
      not: "an array",
    }) as unknown as TriggerDriverContext["runHook"];
    await expect(
      pieceWebhookDriver.deliver(binding, payload, ctx),
    ).rejects.toThrow(/expected an array/);
    expect(store.recordPollSuccess).not.toHaveBeenCalled();
  });
});

describe("driver preconditions", () => {
  const ctx = {} as TriggerDriverContext;

  it("names the mismatch when a binding reaches the wrong driver", async () => {
    await expect(
      scheduleDriver.arm(
        piece(),
        { existing: undefined, isRepublish: false },
        ctx,
      ),
    ).rejects.toThrow(/Expected a schedule binding/);
    await expect(
      piecePollDriver.arm(
        schedule(),
        { existing: undefined, isRepublish: false },
        ctx,
      ),
    ).rejects.toThrow(/Expected a piece binding/);
  });
});
