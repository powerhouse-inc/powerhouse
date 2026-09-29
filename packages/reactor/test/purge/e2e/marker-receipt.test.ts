import type { Operation } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { JobStatus } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";
import {
  buildNode,
  CaptureChannels,
  expectPurged,
  legacyDrive,
  PgDatabase,
  purge,
  storedOperations,
  succeeded,
  until,
  waitForJob,
  type Node,
} from "./harness.js";

const REMOTE = "b-capture";

async function copy(from: Node, to: Node, id: string): Promise<void> {
  const ops: Operation[] = await storedOperations(from, id);
  await succeeded(to.reactor, to.reactor.load(id, "main", ops));
}

describe("marker receipt bypasses reshuffle [Postgres]", () => {
  let dbA: PgDatabase;
  let dbB: PgDatabase;
  let a: Node | undefined;
  let b: Node | undefined;
  let capture: CaptureChannels;

  beforeEach(async () => {
    dbA = await PgDatabase.create("reactor_e2e_receipt_a");
    dbB = await PgDatabase.create("reactor_e2e_receipt_b");
    capture = new CaptureChannels();
    a = await buildNode({ name: "a", db: dbA });
    b = await buildNode({
      name: "b",
      db: dbB,
      channelFactory: capture.factory(),
      catchUpIntervalMs: 50,
    });
  });

  afterEach(async () => {
    try {
      await a?.module.reactor.kill().completed;
      await b?.module.reactor.kill().completed;
      await b?.module.syncModule?.syncManager.shutdown().completed;
    } finally {
      a = b = undefined;
      await dbA.destroy();
      await dbB.destroy();
    }
  });

  it("leaves a live receiver's later document-scope operation neither re-appended nor re-sent", async () => {
    const [nodeA, nodeB] = [a!, b!];
    await succeeded(nodeA.reactor, nodeA.reactor.create(legacyDrive("d")));
    await succeeded(
      nodeA.reactor,
      nodeA.reactor.create(createDocModelDocument({ id: "x" })),
    );
    await succeeded(
      nodeA.reactor,
      nodeA.reactor.execute("d", "main", [
        addRelationshipAction("d", "x", "child"),
      ]),
    );
    await copy(nodeA, nodeB, "x");
    await copy(nodeA, nodeB, "d");
    await capture.add(nodeB, REMOTE, "d");

    await succeeded(nodeA.reactor, nodeA.reactor.deleteDocument("x"));
    await purge(nodeA, "x");
    const { marker } = await expectPurged(nodeA.db, "x", {
      signerKey: nodeA.key.did,
    });

    // B never saw the delete; its own write sorts after the marker.
    await succeeded(
      nodeB.reactor,
      nodeB.reactor.create(createDocModelDocument({ id: "y" })),
    );
    await succeeded(
      nodeB.reactor,
      nodeB.reactor.execute("x", "main", [
        addRelationshipAction("x", "y", "ref"),
      ]),
    );
    const local = (await storedOperations(nodeB, "x")).at(-1)!;
    expect(local.action.type).toBe("ADD_RELATIONSHIP");
    expect(Date.parse(local.timestampUtcMs)).toBeGreaterThan(
      Date.parse(marker.timestampUtcMs),
    );
    await until("B serves its own write", () =>
      capture.sentOpIds(REMOTE).has(local.id),
    );
    const sentBefore = capture.operations(REMOTE).length;

    const load = await waitForJob(
      nodeB.reactor,
      (await nodeB.reactor.load("x", "main", [marker])).id,
    );
    expect(load.status, load.error?.message).toBe(JobStatus.READ_READY);

    const received = await expectPurged(nodeB.db, "x", {
      signerKey: nodeA.key.did,
    });
    expect(received.marker.id).toBe(marker.id);
    expect(received.marker.action).toEqual(marker.action);

    // The receipt carries no source remote, so B forwards the marker itself.
    await until("B serves the marker", () =>
      capture.sentOpIds(REMOTE).has(marker.id),
    );
    const sentAfter = capture
      .operations(REMOTE)
      .slice(sentBefore)
      .filter((op) => op.context.documentId === "x")
      .map((op) => op.operation.action.type);
    expect(
      sentAfter.filter((type) => type !== "PURGE_DOCUMENT"),
      "nothing but the marker is sent for x after receipt",
    ).toEqual([]);
  });
});
