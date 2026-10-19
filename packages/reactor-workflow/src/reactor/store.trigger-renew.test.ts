// trigger_state's renewal columns: when a webhook trigger's onRenew is next
// due, and its failure streak, kept apart from the poll's.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createFreshRelationalDb,
  createTestRelationalDb,
} from "../../test/helpers/pglite.js";
import { WorkflowRunStore, type TriggerStateInput } from "./store.js";

const NOW = "2026-09-29T12:00:00.000Z";
const EARLIER = "2026-09-29T11:00:00.000Z";
const LATER = "2026-09-29T13:00:00.000Z";

function row(workflowId: string, overrides: Partial<TriggerStateInput> = {}) {
  return {
    workflow_id: workflowId,
    piece_name: "@acme/piece-hooks",
    trigger_name: "event",
    config_hash: "abc",
    status: "ENABLED",
    store_state: "{}",
    interval_ms: 900_000,
    next_poll_at: LATER,
    last_poll_at: null,
    last_error: null,
    consecutive_failures: 0,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: NOW,
    ...overrides,
  };
}

describe("trigger renewal columns", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  it("defaults to no renewal when a row is written without one", async () => {
    await store.upsertTriggerState(row("wf-plain"));
    const state = await store.getTriggerState("wf-plain");
    expect(state?.next_renew_at).toBeNull();
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
  });

  it("lists only ENABLED rows whose renewal is due", async () => {
    await store.upsertTriggerState(row("wf-due", { next_renew_at: EARLIER }));
    await store.upsertTriggerState(row("wf-now", { next_renew_at: NOW }));
    await store.upsertTriggerState(row("wf-later", { next_renew_at: LATER }));
    await store.upsertTriggerState(
      row("wf-error", { status: "ERROR", next_renew_at: EARLIER }),
    );
    const due = await store.listDueTriggerRenewals(NOW);
    expect(due.map((r) => r.workflow_id).sort()).toEqual(["wf-due", "wf-now"]);
  });

  it("sets the renewal time, and clears it with its failure", async () => {
    await store.setTriggerRenewAt("wf-later", EARLIER);
    expect((await store.getTriggerState("wf-later"))?.next_renew_at).toBe(
      EARLIER,
    );
    await store.recordRenewFailure("wf-later", "expired", NOW, LATER, 1);
    await store.setTriggerRenewAt("wf-later", null);
    const state = await store.getTriggerState("wf-later");
    expect(state?.next_renew_at).toBeNull();
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
  });

  it("drops the renewal of a trigger that stops being ENABLED", async () => {
    await store.recordRenewFailure("wf-due", "expired", NOW, LATER, 3);
    await store.setTriggerStatus("wf-due", "DISABLED");
    const state = await store.getTriggerState("wf-due");
    expect(state?.next_renew_at).toBeNull();
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
  });

  it("records a renewal failure apart from the poll's, and clears it on renewal", async () => {
    await store.upsertTriggerState(row("wf-renew", { next_renew_at: EARLIER }));
    await store.recordPollFailure("wf-renew", "feed down", NOW, LATER, 2);
    await store.recordRenewFailure("wf-renew", "expired", NOW, LATER, 1);
    let state = await store.getTriggerState("wf-renew");
    expect(state?.renew_error).toBe("expired");
    expect(state?.renew_failures).toBe(1);
    expect(state?.next_renew_at).toBe(LATER);
    expect(state?.last_error).toBe("feed down");
    expect(state?.consecutive_failures).toBe(2);
    expect(state?.status).toBe("ENABLED");

    await store.recordPollSuccess("wf-renew", "{}", NOW, LATER);
    state = await store.getTriggerState("wf-renew");
    expect(state?.last_error).toBeNull();
    expect(state?.consecutive_failures).toBe(0);
    expect(state?.renew_error).toBe("expired");
    expect(state?.renew_failures).toBe(1);

    await store.recordPollFailure("wf-renew", "feed down", NOW, LATER, 1);
    await store.recordRenewSuccess("wf-renew", NOW, LATER);
    state = await store.getTriggerState("wf-renew");
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
    expect(state?.last_error).toBe("feed down");
    expect(state?.consecutive_failures).toBe(1);
  });

  it("keeps a parked trigger's renewal, due again once the park lifts", async () => {
    await store.upsertTriggerState(
      row("wf-parked", { next_renew_at: EARLIER }),
    );
    await store.recordRenewFailure("wf-parked", "expired", NOW, EARLIER, 2);
    expect(await store.parkWorkflow("wf-parked", 1, "failed")).toBe(true);
    let state = await store.getTriggerState("wf-parked");
    expect(state?.next_renew_at).toBe(EARLIER);
    expect(state?.renew_failures).toBe(2);
    let due = await store.listDueTriggerRenewals(NOW);
    expect(due.map((r) => r.workflow_id)).not.toContain("wf-parked");

    await store.liftPark("wf-parked", true);
    state = await store.getTriggerState("wf-parked");
    expect(state?.status).toBe("ENABLED");
    expect(state?.renew_error).toBe("expired");
    expect(state?.renew_failures).toBe(2);
    due = await store.listDueTriggerRenewals(NOW);
    expect(due.map((r) => r.workflow_id)).toContain("wf-parked");
  });

  it("drops a parked trigger's renewal when a disable clears the park", async () => {
    await store.upsertTriggerState(
      row("wf-parked-off", { next_renew_at: EARLIER }),
    );
    await store.parkWorkflow("wf-parked-off", 1, "failed");
    await store.clearParkOnDisable("wf-parked-off");
    const state = await store.getTriggerState("wf-parked-off");
    expect(state?.status).toBe("DISABLED");
    expect(state?.next_renew_at).toBeNull();
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
  });
});

describe("the renewal columns migration", () => {
  function freshDb(): IRelationalDb {
    return createFreshRelationalDb();
  }

  it("adds the columns to a journal written before them, and re-runs cleanly", async () => {
    const relational = freshDb();
    const legacy = (await relational.createNamespace(
      "workflow_runtime",
    )) as IRelationalDb<Record<string, Record<string, unknown>>>;
    await legacy.schema
      .createTable("trigger_state")
      .addColumn("workflow_id", "text", (col) => col.primaryKey())
      .addColumn("piece_name", "text", (col) => col.notNull())
      .addColumn("trigger_name", "text", (col) => col.notNull())
      .addColumn("config_hash", "text", (col) => col.notNull())
      .addColumn("status", "text", (col) => col.notNull())
      .addColumn("store_state", "text", (col) => col.notNull())
      .addColumn("interval_ms", "integer", (col) => col.notNull())
      .addColumn("next_poll_at", "text")
      .addColumn("last_poll_at", "text")
      .addColumn("last_error", "text")
      .addColumn("consecutive_failures", "integer", (col) => col.notNull())
      .addColumn("lease_owner", "text")
      .addColumn("lease_expires_at", "text")
      .addColumn("updated_at", "text", (col) => col.notNull())
      .execute();
    await legacy.insertInto("trigger_state").values(row("wf-legacy")).execute();

    const store = await WorkflowRunStore.create(relational);
    const migrated = await store.getTriggerState("wf-legacy");
    expect(migrated?.next_renew_at).toBeNull();
    expect(migrated?.renew_error).toBeNull();
    expect(migrated?.renew_failures).toBe(0);

    await store.upsertTriggerState(row("wf-old", { next_renew_at: EARLIER }));
    await store.recordRenewFailure("wf-old", "expired", NOW, EARLIER, 1);
    const again = await WorkflowRunStore.create(relational);
    const due = await again.listDueTriggerRenewals(NOW);
    expect(due.map((r) => r.workflow_id)).toEqual(["wf-old"]);
    expect(due[0].renew_failures).toBe(1);
  });
});
