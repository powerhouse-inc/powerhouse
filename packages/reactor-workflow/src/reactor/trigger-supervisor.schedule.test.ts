// core#schedule through the supervisor over a real PGlite-backed store, with
// an injected clock: enable, due fires, restart carry-over, errors, disable.
import { getDbClient } from "@powerhousedao/reactor-api";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SCHEDULE_BLOCK, type SchedulePayload } from "./schedule.js";
import { WorkflowRunStore } from "./store.js";
import {
  TriggerSupervisor,
  type ScheduleTriggerBinding,
} from "./trigger-supervisor.js";

interface Fired {
  workflowId: string;
  payload: SchedulePayload;
  kind: string;
}

let clock = new Date("2026-09-04T09:58:00.000Z");
const setClock = (iso: string) => {
  clock = new Date(iso);
};

function scheduleBinding(
  workflowId: string,
  config: Record<string, unknown>,
): ScheduleTriggerBinding {
  return { kind: "schedule", workflowId, blockType: SCHEDULE_BLOCK, config };
}

describe("TriggerSupervisor core#schedule", () => {
  let store: WorkflowRunStore;
  let supervisor: TriggerSupervisor;
  let fired: Fired[];

  const newSupervisor = () =>
    new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (workflowId, payload, kind) => {
        fired.push({ workflowId, payload: payload as SchedulePayload, kind });
      },
      cacheDir: "/nonexistent",
      now: () => clock,
    });

  beforeAll(async () => {
    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
  });

  beforeEach(() => {
    fired = [];
    setClock("2026-09-04T09:58:00.000Z");
    supervisor = newSupervisor();
  });

  afterEach(() => {
    supervisor.stop();
  });

  it("enables a cron schedule with the next slot as next_poll_at", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-cron", { mode: "cron", cron: "0 * * * *" }),
    );
    const row = await store.getTriggerState("wf-cron");
    expect(row?.status).toBe("ENABLED");
    expect(row?.block_type).toBe(SCHEDULE_BLOCK);
    expect(row?.next_poll_at).toBe("2026-09-04T10:00:00.000Z");
    expect(row?.last_error).toBeNull();
  });

  it("does not fire before the slot, then fires once with the payload", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-cron", { mode: "cron", cron: "0 * * * *" }),
    );
    setClock("2026-09-04T09:59:59.000Z");
    await supervisor.tick();
    expect(fired).toEqual([]);

    setClock("2026-09-04T10:00:07.000Z");
    await supervisor.tick();
    expect(fired).toHaveLength(1);
    expect(fired[0]).toEqual({
      workflowId: "wf-cron",
      kind: "schedule",
      payload: {
        scheduledFor: "2026-09-04T10:00:00.000Z",
        firedAt: "2026-09-04T10:00:07.000Z",
        timezone: "UTC",
        cron: "0 * * * *",
      },
    });

    const row = await store.getTriggerState("wf-cron");
    expect(row?.next_poll_at).toBe("2026-09-04T11:00:00.000Z");
    expect(row?.last_poll_at).toBe("2026-09-04T10:00:07.000Z");
    expect(row?.consecutive_failures).toBe(0);

    // The same tick again is not due.
    await supervisor.tick();
    expect(fired).toHaveLength(1);
  });

  it("carries the next fire time across a restart and fires an overdue slot once", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-restart", { mode: "cron", cron: "*/10 * * * *" }),
    );
    expect((await store.getTriggerState("wf-restart"))?.next_poll_at).toBe(
      "2026-09-04T10:00:00.000Z",
    );

    // "Restart": a fresh supervisor re-registers the unchanged binding.
    supervisor.stop();
    supervisor = newSupervisor();
    setClock("2026-09-04T09:59:00.000Z");
    await supervisor.upsert(
      scheduleBinding("wf-restart", { mode: "cron", cron: "*/10 * * * *" }),
    );
    expect((await store.getTriggerState("wf-restart"))?.next_poll_at).toBe(
      "2026-09-04T10:00:00.000Z",
    );

    // Down for ~47 minutes past the slot: four slots were missed.
    setClock("2026-09-04T10:47:30.000Z");
    await supervisor.tick();
    await supervisor.tick();
    expect(fired).toHaveLength(1);
    expect(fired[0].payload.scheduledFor).toBe("2026-09-04T10:00:00.000Z");
    expect(fired[0].payload.firedAt).toBe("2026-09-04T10:47:30.000Z");
    expect((await store.getTriggerState("wf-restart"))?.next_poll_at).toBe(
      "2026-09-04T10:50:00.000Z",
    );
  });

  it("runs interval mode on a fixed phase and rebases when overdue", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-interval", { mode: "interval", every: 15 }),
    );
    let row = await store.getTriggerState("wf-interval");
    expect(row?.interval_ms).toBe(900_000);
    expect(row?.next_poll_at).toBe("2026-09-04T10:13:00.000Z");

    setClock("2026-09-04T10:13:04.000Z");
    await supervisor.tick();
    expect(fired).toHaveLength(1);
    expect(fired[0].payload).toEqual({
      scheduledFor: "2026-09-04T10:13:00.000Z",
      firedAt: "2026-09-04T10:13:04.000Z",
      timezone: "UTC",
      everyMs: 900_000,
    });
    row = await store.getTriggerState("wf-interval");
    expect(row?.next_poll_at).toBe("2026-09-04T10:28:00.000Z");

    setClock("2026-09-04T12:00:00.000Z");
    await supervisor.tick();
    expect(fired).toHaveLength(2);
    row = await store.getTriggerState("wf-interval");
    expect(row?.next_poll_at).toBe("2026-09-04T12:15:00.000Z");
  });

  it("honours the timezone when computing slots", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-tz", {
        mode: "cron",
        cron: "0 9 * * *",
        timezone: "America/New_York",
      }),
    );
    // 09:00 EDT is 13:00Z.
    expect((await store.getTriggerState("wf-tz"))?.next_poll_at).toBe(
      "2026-09-04T13:00:00.000Z",
    );
  });

  it("records ERROR with the reason for invalid config and never fires", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-bad-cron", { mode: "cron", cron: "every tuesday" }),
    );
    let row = await store.getTriggerState("wf-bad-cron");
    expect(row?.status).toBe("ERROR");
    expect(row?.next_poll_at).toBeNull();
    expect(row?.last_error).toMatch(/exactly five fields/);

    await supervisor.upsert(
      scheduleBinding("wf-bad-tz", {
        mode: "cron",
        cron: "0 9 * * *",
        timezone: "Mars/Olympus",
      }),
    );
    row = await store.getTriggerState("wf-bad-tz");
    expect(row?.status).toBe("ERROR");
    expect(row?.last_error).toMatch(/unknown timezone/);

    await supervisor.upsert(
      scheduleBinding("wf-too-fast", { mode: "interval", everyMs: 5_000 }),
    );
    row = await store.getTriggerState("wf-too-fast");
    expect(row?.status).toBe("ERROR");
    expect(row?.last_error).toMatch(/at least 60s/);

    setClock("2026-09-05T00:00:00.000Z");
    await supervisor.tick();
    expect(fired).toEqual([]);
  });

  it("recovers from ERROR once the config is fixed", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-fix", { mode: "cron", cron: "nope" }),
    );
    expect((await store.getTriggerState("wf-fix"))?.status).toBe("ERROR");
    await supervisor.upsert(
      scheduleBinding("wf-fix", { mode: "cron", cron: "30 10 * * *" }),
    );
    const row = await store.getTriggerState("wf-fix");
    expect(row?.status).toBe("ENABLED");
    expect(row?.last_error).toBeNull();
    expect(row?.consecutive_failures).toBe(0);
    expect(row?.next_poll_at).toBe("2026-09-04T10:30:00.000Z");
  });

  it("recomputes the slot when the config changes", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-edit", { mode: "cron", cron: "0 * * * *" }),
    );
    expect((await store.getTriggerState("wf-edit"))?.next_poll_at).toBe(
      "2026-09-04T10:00:00.000Z",
    );
    await supervisor.upsert(
      scheduleBinding("wf-edit", { mode: "cron", cron: "45 * * * *" }),
    );
    expect((await store.getTriggerState("wf-edit"))?.next_poll_at).toBe(
      "2026-09-04T10:45:00.000Z",
    );
  });

  it("disables on remove and rebases on re-enable instead of firing a stale slot", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-toggle", { mode: "cron", cron: "0 * * * *" }),
    );
    await supervisor.remove("wf-toggle");
    expect((await store.getTriggerState("wf-toggle"))?.status).toBe("DISABLED");

    setClock("2026-09-04T10:30:00.000Z");
    await supervisor.tick();
    expect(fired).toEqual([]);

    await supervisor.upsert(
      scheduleBinding("wf-toggle", { mode: "cron", cron: "0 * * * *" }),
    );
    const row = await store.getTriggerState("wf-toggle");
    expect(row?.status).toBe("ENABLED");
    expect(row?.next_poll_at).toBe("2026-09-04T11:00:00.000Z");
    await supervisor.tick();
    expect(fired).toEqual([]);
  });

  it("disables a schedule row whose workflow left the registry", async () => {
    await supervisor.upsert(
      scheduleBinding("wf-zombie", { mode: "cron", cron: "0 * * * *" }),
    );
    const orphaned = newSupervisor();
    setClock("2026-09-04T10:00:30.000Z");
    await orphaned.tick();
    expect((await store.getTriggerState("wf-zombie"))?.status).toBe("DISABLED");
    expect(fired).toEqual([]);
    orphaned.stop();
  });

  it("journals a fired schedule as a run with triggerKind schedule", async () => {
    const journaling = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (workflowId, payload, kind) => {
        void store.startRun({
          workflowId,
          workflowName: "Nightly",
          workflowVersion: 1,
          triggerKind: kind,
          triggerPayload: payload,
        });
      },
      cacheDir: "/nonexistent",
      now: () => clock,
    });
    await journaling.upsert(
      scheduleBinding("wf-journal", { mode: "cron", cron: "0 * * * *" }),
    );
    setClock("2026-09-04T10:00:02.000Z");
    await journaling.tick();
    const [run] = await store.listRuns("wf-journal");
    expect(run.trigger_kind).toBe("schedule");
    expect(JSON.parse(run.trigger_payload!)).toEqual({
      scheduledFor: "2026-09-04T10:00:00.000Z",
      firedAt: "2026-09-04T10:00:02.000Z",
      timezone: "UTC",
      cron: "0 * * * *",
    });
    journaling.stop();
  });
});
