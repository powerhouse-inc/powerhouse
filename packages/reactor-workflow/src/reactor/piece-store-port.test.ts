// Which partition a scope maps to, over a real PGlite-backed journal. FLOW is
// the workflow; PROJECT is this reactor, which is what lets two workflows share.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createPieceStorePort, testPartitionKey } from "./piece-store-port.js";
import { WorkflowRunStore } from "./store.js";

describe("piece store partitions", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  const portFor = (workflowId: string | undefined) =>
    createPieceStorePort(store, () => workflowId);

  it("keeps two workflows' FLOW keys apart", async () => {
    await portFor("wf-a").put("cursor", 1, "FLOW");
    await portFor("wf-b").put("cursor", 2, "FLOW");

    expect(await portFor("wf-a").get("cursor", "FLOW")).toBe(1);
    expect(await portFor("wf-b").get("cursor", "FLOW")).toBe(2);
  });

  it("shares a PROJECT key across workflows", async () => {
    await portFor("wf-a").put("queue", ["first"], "PROJECT");

    // The case the Queue piece is written against: another workflow reads what
    // this one wrote, which FLOW scope would never allow.
    expect(await portFor("wf-b").get("queue", "PROJECT")).toEqual(["first"]);
  });

  it("does not let a PROJECT key collide with the same FLOW key", async () => {
    await portFor("wf-a").put("shared", "flow-value", "FLOW");
    await portFor("wf-a").put("shared", "project-value", "PROJECT");

    expect(await portFor("wf-a").get("shared", "FLOW")).toBe("flow-value");
    expect(await portFor("wf-a").get("shared", "PROJECT")).toBe(
      "project-value",
    );
  });

  it("deletes within one scope only", async () => {
    await portFor("wf-c").put("temp", "x", "FLOW");
    await portFor("wf-c").put("temp", "y", "PROJECT");
    await portFor("wf-c").delete("temp", "FLOW");

    expect(await portFor("wf-c").get("temp", "FLOW")).toBeNull();
    expect(await portFor("wf-c").get("temp", "PROJECT")).toBe("y");
  });

  it("keeps two samples' PROJECT keys apart", async () => {
    const samplePort = (workflowId: string) =>
      createPieceStorePort(store, () => workflowId, true);
    await samplePort("wf-s1").put("draft", "one", "PROJECT");
    await samplePort("wf-s2").put("draft", "two", "PROJECT");

    // A live PROJECT key is the reactor's, but two samples on one partition
    // would read each other's keys and delete them on the way out.
    expect(await samplePort("wf-s1").get("draft", "PROJECT")).toBe("one");
    expect(await samplePort("wf-s2").get("draft", "PROJECT")).toBe("two");

    // And the partition the supervisor drops afterwards is that same one.
    await store.deletePieceStore(
      "PROJECT",
      testPartitionKey("PROJECT", "wf-s1"),
    );
    expect(await samplePort("wf-s1").get("draft", "PROJECT")).toBeNull();
    expect(await samplePort("wf-s2").get("draft", "PROJECT")).toBe("two");
  });

  it("refuses a FLOW key when no workflow is in scope", async () => {
    await expect(portFor(undefined).get("cursor", "FLOW")).rejects.toThrow(
      "no workflow is in scope",
    );
  });

  it("serves a PROJECT key even with no workflow in scope", async () => {
    // PROJECT does not depend on the run scope, so it must not borrow its
    // failure: the partition is the reactor, which is always known.
    await portFor("wf-a").put("instance-wide", true, "PROJECT");

    expect(await portFor(undefined).get("instance-wide", "PROJECT")).toBe(true);
  });

  // The cursor guard moved here when the durable store stopped routing a
  // trigger's writes through the supervisor. Same key, same rule.

  // The last two hold either way today; they are here so a future guard
  // cannot start policing a cursor shape that was never ours.
  describe("the pollingHelper cursor", () => {
    const NOW = 1_700_000_000_000;
    const guarded = (workflowId: string) =>
      createPieceStorePort(
        store,
        () => workflowId,
        false,
        () => NOW,
      );

    it("rejects the null a serialised NaN cursor arrives as", async () => {
      const port = guarded("wf-nan");
      await port.put("lastPoll", NOW - 1000, "FLOW");
      // The worker JSON-serialises the write, so NaN reaches the host as null.
      await port.put("lastPoll", null, "FLOW");

      expect(await port.get("lastPoll", "FLOW")).toBe(NOW - 1000);
    });

    it("rejects a cursor further ahead than a provider's clock could skew", async () => {
      const port = guarded("wf-skew");
      await port.put("lastPoll", NOW - 1000, "FLOW");
      await port.put("lastPoll", NOW + 8 * 24 * 60 * 60_000, "FLOW");

      expect(await port.get("lastPoll", "FLOW")).toBe(NOW - 1000);
    });

    it("leaves a piece's own non-numeric lastPoll alone", async () => {
      const port = guarded("wf-own");
      await port.put("lastPoll", { id: "abc" }, "FLOW");

      expect(await port.get("lastPoll", "FLOW")).toEqual({ id: "abc" });
    });

    it("does not police any other key", async () => {
      const port = guarded("wf-other");
      await port.put("lastItem", null, "FLOW");

      expect(await port.get("lastItem", "FLOW")).toBeNull();
    });
  });
});
