import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { SyncEventTypes } from "../../../src/sync/types.js";
import { createDocModelDocument } from "../../factories.js";
import {
  buildNode,
  expectPurged,
  fullManifest,
  legacyDrive,
  manifestWithout,
  Mesh,
  PgDatabase,
  purge,
  quiesce,
  stopNode,
  succeeded,
  tombstone,
  until,
  waitForTombstone,
  type Node,
} from "./harness.js";

const PROBE_MS = 50;
const HELD = { protocol: "document-purge", version: 1 };

async function quarantined(node: Node): Promise<string[]> {
  return node.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
}

describe("peers without erasure [Postgres]", () => {
  const mesh = new Mesh();
  let dbs: PgDatabase[];
  let host: Node;
  let silent: Node;
  let narrow: Node;
  let held: Array<{ remoteName: string; documentId: string }>;

  beforeEach(async () => {
    dbs = [
      await PgDatabase.create("reactor_e2e_peers_host"),
      await PgDatabase.create("reactor_e2e_peers_silent"),
      await PgDatabase.create("reactor_e2e_peers_narrow"),
    ];
    host = await buildNode({
      name: "a",
      db: dbs[0]!,
      mesh,
      catchUpIntervalMs: PROBE_MS,
    });
    silent = await buildNode({
      name: "s",
      db: dbs[1]!,
      mesh,
      catchUpIntervalMs: PROBE_MS,
    });
    narrow = await buildNode({
      name: "n",
      db: dbs[2]!,
      mesh,
      catchUpIntervalMs: PROBE_MS,
    });
    held = [];
    host.module.eventBus.subscribe(SyncEventTypes.SYNC_HELD, (_type, event) => {
      held.push(event as { remoteName: string; documentId: string });
    });

    await succeeded(host.reactor, host.reactor.create(legacyDrive("d")));
    await mesh.link(host, silent, "d", { b: { silent: true } });
    await mesh.link(host, narrow, "d", {
      b: { announce: () => manifestWithout("document-purge") },
    });
  });

  afterEach(async () => {
    try {
      await stopNode(host);
      await stopNode(silent);
      await stopNode(narrow);
    } finally {
      mesh.clear();
      for (const db of dbs) await db.destroy();
    }
  });

  it("holds the marker for a silent peer and one lacking document-purge, and each receives it alone on upgrade", async () => {
    await succeeded(
      host.reactor,
      host.reactor.create(createDocModelDocument({ id: "x" })),
    );
    await succeeded(
      host.reactor,
      host.reactor.execute("d", "main", [
        addRelationshipAction("d", "x", "child"),
      ]),
    );
    await succeeded(host.reactor, host.reactor.deleteDocument("x"));
    for (const peer of [silent, narrow]) {
      await until(`${peer.name} holds x's delete`, async () =>
        (await peer.module.operationIndex.get("x")).results.some(
          (op) => op.action.type === "DELETE_DOCUMENT",
        ),
      );
    }

    const { ordinal } = await purge(host, "x");
    for (const remoteName of ["a->s", "a->n"]) {
      await until(
        `the host holds x for ${remoteName}`,
        async () =>
          (await host.sync!.listHolds({ remoteName, documentId: "x" })).length >
          0,
      );
      expect(
        await host.sync!.listHolds({ remoteName, documentId: "x" }),
      ).toEqual([
        expect.objectContaining({
          documentId: "x",
          branch: "main",
          reason: expect.objectContaining(HELD),
        }),
      ]);
    }
    expect(
      held.filter((event) => event.documentId === "x").map((e) => e.remoteName),
    ).toEqual(expect.arrayContaining(["a->s", "a->n"]));

    await quiesce();
    for (const peer of [silent, narrow]) {
      expect(
        await tombstone(peer.db, "x"),
        `${peer.name} not purged`,
      ).toBeUndefined();
    }
    for (const node of [host, silent, narrow]) {
      expect(await quarantined(node), `${node.name} quarantine`).not.toContain(
        "x",
      );
    }
    const deliveredBefore = {
      s: mesh.deliveredOperations("a->s").length,
      n: mesh.deliveredOperations("a->n").length,
    };

    const silentChannel = mesh.channels.get("s->a")!;
    silentChannel.options.silent = false;
    silentChannel.reannounce();
    const narrowChannel = mesh.channels.get("n->a")!;
    narrowChannel.options.announce = () => fullManifest(1);
    narrowChannel.reannounce();

    for (const [peer, remoteName] of [
      [silent, "a->s"],
      [narrow, "a->n"],
    ] as const) {
      await waitForTombstone(peer.db, "x");
      await expectPurged(peer.db, "x", { signerKey: host.key.did });
      const released = mesh
        .deliveredOperations(remoteName)
        .slice(deliveredBefore[peer.name as "s" | "n"])
        .filter((op) => op.context.documentId === "x");
      expect(
        released.map((op) => [op.operation.action.type, op.context.ordinal]),
        `${peer.name} receives the marker alone`,
      ).toEqual([["PURGE_DOCUMENT", ordinal]]);
      expect(
        await host.sync!.listHolds({ remoteName, documentId: "x" }),
      ).toEqual([]);
    }
    for (const node of [host, silent, narrow]) {
      expect(await quarantined(node)).not.toContain("x");
    }
  });
});
