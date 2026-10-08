// Driver-level contract: which kind owns a binding, what row each one arms,
// and that a request-driven piece is fed its payload instead of being polled.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { PieceWorker } from "../pieces/activepieces/worker/host.js";
import { WorkflowRunStore, type TriggerStateRow } from "./store.js";
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
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const WF = "wf-1";
const NOW = new Date("2026-09-07T12:00:00.000Z");

const piece = (
  overrides: Partial<PieceTriggerBinding> = {},
): PieceTriggerBinding => ({
  workflowId: WF,
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
  ...overrides,
});

const schedule = (): ScheduleTriggerBinding => ({
  kind: "schedule",
  workflowId: WF,
  block: {
    pieceName: "@powerhousedao/piece-core",
    pieceVersion: CORE_PIECE_VERSION,
    kind: "trigger" as const,
    name: "schedule",
  },
  config: { mode: "interval", every: 5, unit: "minutes" },
});

const row = (overrides: Partial<TriggerStateRow> = {}): TriggerStateRow => ({
  workflow_id: WF,
  piece_name: "@acme/piece-x",
  trigger_name: "new_thing",
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
  piece_version: null,
  piece_source: null,
  version_match: null,
  version_note: null,
  next_renew_at: null,
  renew_error: null,
  renew_failures: 0,
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

// A real store and a fixture webhook piece in a forked worker.
describe("pieceWebhookDriver.deliver", () => {
  const HOOK_FIXTURE = `
const app = {
  displayName: "Hook Fixture",
  actions: {},
  triggers: {
    new_thing: {
      name: "new_thing",
      displayName: "New thing",
      type: "WEBHOOK",
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async (ctx) => {
        await ctx.store.put("seen", ((await ctx.store.get("seen")) ?? 0) + 1);
        return ctx.payload.body.items ?? "not a list";
      },
    },
  },
};
module.exports = { app };
`;

  let root = "";
  let bundleDir = "";
  let worker: PieceWorker;
  let store: WorkflowRunStore;
  let ctx: TriggerDriverContext;
  let fired: { workflowId: string; payload: unknown; kind: string }[];
  let next = 0;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "trigger-drivers-"));
    bundleDir = join(root, "hook");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      join(bundleDir, "package.json"),
      JSON.stringify({
        name: "@acme/piece-x",
        version: "1.0.0",
        main: "index.js",
      }),
    );
    await writeFile(join(bundleDir, "index.js"), HOOK_FIXTURE);
    worker = new PieceWorker();
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  afterAll(async () => {
    worker.dispose();
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    fired = [];
    ctx = {
      store,
      now: () => NOW,
      fire: (workflowId, payload, kind) =>
        fired.push({ workflowId, payload, kind }),
      defaultIntervalMs: 300_000,
      runHook: (binding, hook, storeState, options = {}) =>
        worker.runTriggerHook({
          bundleDir,
          triggerName: binding.triggerName,
          hook,
          propsValue: binding.config,
          storeState,
          payload: options.payload,
          isRepublish: options.isRepublish,
        }),
      markUnhealthy: () => undefined,
    };
  });

  // An armed row of its own, so dedupe keys and cursors never cross tests.
  async function armed(status = "ENABLED"): Promise<PieceTriggerBinding> {
    next += 1;
    const workflowId = `wf-deliver-${next}`;
    await store.upsertTriggerState(
      row({ workflow_id: workflowId, status, store_state: "{}" }),
    );
    return piece({ workflowId, delivery: "webhook" });
  }

  const delivery = (items?: unknown) => ({
    method: "POST",
    body: items === undefined ? {} : { items },
  });

  it("feeds the payload to the run hook and fires each item", async () => {
    const binding = await armed();

    const count = await pieceWebhookDriver.deliver(
      binding,
      delivery([{ id: "evt_1" }]),
      ctx,
    );

    expect(count).toBe(1);
    expect(fired).toEqual([
      {
        workflowId: binding.workflowId,
        payload: { id: "evt_1" },
        kind: "piece:@acme/piece-x:new_thing",
      },
    ]);
  });

  it("persists the piece's cursor without scheduling a poll", async () => {
    const binding = await armed();

    await pieceWebhookDriver.deliver(binding, delivery([]), ctx);
    await pieceWebhookDriver.deliver(binding, delivery([]), ctx);

    const stored = await store.getTriggerState(binding.workflowId);
    expect(stored).toMatchObject({
      last_poll_at: NOW.toISOString(),
      // A delivery is not a poll: next_poll_at stays null.
      next_poll_at: null,
    });
    // The second run read the first one's cursor back off the row.
    const cursor = JSON.parse(stored!.store_state) as Record<string, unknown>;
    expect(Object.values(cursor)).toEqual([2]);
  });

  it("fires once per item, or not at all for an empty batch", async () => {
    const binding = await armed();

    expect(
      await pieceWebhookDriver.deliver(
        binding,
        delivery([{ id: "a" }, { id: "b" }]),
        ctx,
      ),
    ).toBe(2);
    expect(fired.map(({ payload }) => payload)).toEqual([
      { id: "a" },
      { id: "b" },
    ]);

    fired.length = 0;
    expect(await pieceWebhookDriver.deliver(binding, delivery([]), ctx)).toBe(
      0,
    );
    expect(fired).toHaveLength(0);
  });

  it("suppresses an item whose dedupe key was already claimed", async () => {
    const binding = await armed();
    const repeated = delivery([{ _dedupe_key: "k1" }]);

    expect(await pieceWebhookDriver.deliver(binding, repeated, ctx)).toBe(1);
    expect(await pieceWebhookDriver.deliver(binding, repeated, ctx)).toBe(1);

    expect(fired).toHaveLength(1);
  });

  it("refuses a delivery to a trigger that is not enabled", async () => {
    const disabled = await armed("DISABLED");
    await expect(
      pieceWebhookDriver.deliver(disabled, delivery([{ id: "a" }]), ctx),
    ).rejects.toThrow(/is not enabled/);

    const absent = piece({
      workflowId: "wf-deliver-none",
      delivery: "webhook",
    });
    await expect(
      pieceWebhookDriver.deliver(absent, delivery([{ id: "a" }]), ctx),
    ).rejects.toThrow(/is not enabled/);
    expect(fired).toHaveLength(0);
  });

  it("rejects a run hook that did not return a list", async () => {
    const binding = await armed();

    await expect(
      pieceWebhookDriver.deliver(binding, delivery(), ctx),
    ).rejects.toThrow(/expected an array/);
    expect(await store.getTriggerState(binding.workflowId)).toMatchObject({
      store_state: "{}",
      last_poll_at: null,
    });
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
