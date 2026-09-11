// Which partition a scope maps to, over a real PGlite-backed journal. FLOW is
// the workflow; PROJECT is this reactor, which is what lets two workflows share.
import { getDbClient } from "@powerhousedao/reactor-api";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { beforeAll, describe, expect, it } from "vitest";
import { createPieceStorePort } from "./piece-store-port.js";
import { WorkflowRunStore } from "./store.js";

describe("piece store partitions", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
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
});
