import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { PropagationMode } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";
import {
  buildNode,
  CaptureChannels,
  expectPurged,
  legacyDrive,
  memberships,
  PgDatabase,
  purge,
  stopNode,
  succeeded,
  until,
  type Node,
} from "./harness.js";

const REMOTE = "drive-remote";

describe("a cascade-deleted child's marker [Postgres]", () => {
  let pg: PgDatabase;
  let node: Node | undefined;
  let capture: CaptureChannels;

  beforeEach(async () => {
    pg = await PgDatabase.create("reactor_e2e_cascade_marker");
    capture = new CaptureChannels();
    node = await buildNode({
      name: "a",
      db: pg,
      channelFactory: capture.factory(),
      catchUpIntervalMs: 50,
    });
  });

  afterEach(async () => {
    try {
      await stopNode(node);
    } finally {
      node = undefined;
      await pg.destroy();
    }
  });

  it("reaches the drive's remote after the child's membership closed", async () => {
    const a = node!;
    await succeeded(a.reactor, a.reactor.create(legacyDrive("d")));
    await succeeded(
      a.reactor,
      a.reactor.create(createDocModelDocument({ id: "x" })),
    );
    await succeeded(
      a.reactor,
      a.reactor.execute("d", "main", [
        addRelationshipAction("d", "x", "child"),
      ]),
    );
    await capture.add(a, REMOTE, "d");

    await a.client.deleteDocument("d", PropagationMode.Cascade);
    await until("the remote has x's delete", () =>
      capture
        .operations(REMOTE)
        .some(
          (op) =>
            op.context.documentId === "x" &&
            op.operation.action.type === "DELETE_DOCUMENT",
        ),
    );
    const closed = await memberships(a.db, "x");
    expect(
      closed.every((m) => m.left !== null),
      "x left the drive",
    ).toBe(true);

    const { ordinal } = await purge(a, "x");
    await purge(a, "d");

    const { marker } = await expectPurged(a.db, "x");
    expect(await memberships(a.db, "x")).toEqual(
      closed.map((m) => ({ ...m, joined: ordinal, left: null })),
    );
    await expectPurged(a.db, "d");
    await until("the drive's remote receives x's marker", () =>
      capture.sentOpIds(REMOTE).has(marker.id),
    );
  });
});
