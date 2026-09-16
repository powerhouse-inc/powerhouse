// The trigger_state.store_state blob moving into piece_store.

// A WEBHOOK trigger keeps its registered endpoint id there, and a lost id
// leaks forever: onDisable can never delete an endpoint it cannot name.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { beforeAll, describe, expect, it } from "vitest";
import { WorkflowRunStore } from "./store.js";

const WF = "wf-legacy";

// What the snapshot protocol actually wrote: flow-scoped keys nested under the
// flow id, project keys bare, and a test run's leftovers beside them.
const LEGACY_BLOB = JSON.stringify({
  [`flow_${WF}/lastItem`]: "guid-42",
  [`flow_${WF}/_webhook_id`]: 7381,
  shared_account: "acct_1",
  [`testflow_${WF}/lastItem`]: "guid-sample",
  testimonials: ["a"],
});

function legacyRow(storeState: string) {
  return {
    workflow_id: WF,
    block_type: "@activepieces/piece-paperless-ngx@1.0.0#trigger:document",
    config_hash: "abc123",
    status: "ENABLED",
    store_state: storeState,
    interval_ms: 900_000,
    next_poll_at: null,
    last_poll_at: null,
    last_error: null,
    consecutive_failures: 0,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  };
}

describe("trigger store_state migration", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  // Re-running up() is how the migration reaches a journal written before it.
  const remigrate = async () => {
    return WorkflowRunStore.create(createTestRelationalDb());
  };

  it("moves a realistic blob into the partitions the hooks now read", async () => {
    await store.upsertTriggerState(legacyRow(LEGACY_BLOB));
    const migrated = await remigrate();

    expect(await migrated.getPieceStoreValue("FLOW", WF, "lastItem")).toBe(
      "guid-42",
    );
    // The registration id: the one key whose loss is unrecoverable.
    expect(await migrated.getPieceStoreValue("FLOW", WF, "_webhook_id")).toBe(
      7381,
    );
    // A bare key was project-wide, and this reactor is the project.
    expect(
      await migrated.getPieceStoreValue("PROJECT", "reactor", "shared_account"),
    ).toBe("acct_1");

    // Only the unambiguous test shape — testflow_<id>/… — is dropped.
    expect(await migrated.listPieceStore("FLOW", WF)).toEqual({
      lastItem: "guid-42",
      _webhook_id: 7381,
    });
    // A bare "test…" key may be the piece's own, so it is kept rather than
    // guessed away; dropping it would silently delete real state.
    expect(
      await migrated.getPieceStoreValue("PROJECT", "reactor", "testimonials"),
    ).toEqual(["a"]);
  });

  it("tolerates another reactor having inserted the same key first", async () => {
    const raced = "wf-legacy-race";
    await store.upsertTriggerState({
      ...legacyRow(JSON.stringify({ [`flow_${raced}/lastItem`]: "guid-1" })),
      workflow_id: raced,
    });

    // Two reactors starting against one journal both read no row, both insert.

    // A PK violation on the loser would reject up(), leaving that process with
    // no store at all — and so every trigger on it silent.
    const [a, b] = await Promise.all([remigrate(), remigrate()]);
    expect(await a.getPieceStoreValue("FLOW", raced, "lastItem")).toBe("guid-1");
    expect(await b.getPieceStoreValue("FLOW", raced, "lastItem")).toBe("guid-1");
  });

  it("blanks the blob so a later startup cannot replay it", async () => {
    const row = await store.getTriggerState(WF);
    expect(row?.store_state).toBe("{}");

    // The trigger has polled since; re-running up() must not rewind it.
    await store.setPieceStoreValue("FLOW", WF, "lastItem", "guid-99");
    await remigrate();
    expect(await store.getPieceStoreValue("FLOW", WF, "lastItem")).toBe(
      "guid-99",
    );
  });

  it("never overwrites a key the trigger already rewrote", async () => {
    const other = "wf-legacy-2";
    await store.setPieceStoreValue("FLOW", other, "lastItem", "fresh");
    await store.upsertTriggerState({
      ...legacyRow(JSON.stringify({ [`flow_${other}/lastItem`]: "stale" })),
      workflow_id: other,
    });
    const migrated = await remigrate();

    expect(await migrated.getPieceStoreValue("FLOW", other, "lastItem")).toBe(
      "fresh",
    );
  });

  it("leaves an unparseable blob alone rather than failing startup", async () => {
    const broken = "wf-legacy-3";
    await store.upsertTriggerState({
      ...legacyRow("not json"),
      workflow_id: broken,
    });
    const migrated = await remigrate();

    expect((await migrated.getTriggerState(broken))?.store_state).toBe(
      "not json",
    );
    expect(await migrated.listPieceStore("FLOW", broken)).toEqual({});
  });

  // The blob is the only copy of that state and nothing reads the column any
  // more, so polling the row would run the hook against an empty store.
  it("keeps a row whose blob never migrated out of the due list", async () => {
    const stuck = "wf-legacy-stuck";
    await store.upsertTriggerState({
      ...legacyRow("{ not json"),
      workflow_id: stuck,
      next_poll_at: "2000-01-01T00:00:00.000Z",
    });
    const migrated = await remigrate();

    expect(migrated.hasUnmigratedTriggerState(stuck)).toBe(true);
    const due = await migrated.listDueTriggerStates(new Date().toISOString());
    expect(due.map((row) => row.workflow_id)).not.toContain(stuck);

    // A re-enable rebuilds the state from scratch, which is what releases it.
    migrated.clearUnmigratedTriggerState(stuck);
    const after = await migrated.listDueTriggerStates(new Date().toISOString());
    expect(after.map((row) => row.workflow_id)).toContain(stuck);
  });

  // A bare project key lived in each workflow's own row, so the same key can
  // hold two values and only the last one written survives the move.
  it("keeps the project value from the most recently updated row", async () => {
    const key = "contested_account";
    await store.upsertTriggerState({
      ...legacyRow(JSON.stringify({ [key]: "older" })),
      workflow_id: "wf-legacy-old",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await store.upsertTriggerState({
      ...legacyRow(JSON.stringify({ [key]: "newer" })),
      workflow_id: "wf-legacy-new",
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    const migrated = await remigrate();

    // Whichever row the database happened to return first used to win.
    expect(await migrated.getPieceStoreValue("PROJECT", "reactor", key)).toBe(
      "newer",
    );
    expect((await migrated.getTriggerState("wf-legacy-old"))?.store_state).toBe(
      "{}",
    );
  });
});
