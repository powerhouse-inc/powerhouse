import {
  setModelName,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelError } from "../../../src/sync/errors.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { ChannelErrorSource } from "../../../src/sync/types.js";
import { syncOperationErrorType } from "../../../src/sync/utils.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { purgeMarker, signedPurgeMarker } from "../helpers.js";
import {
  BindingTrustPolicy,
  buildNode,
  expectNoRowsFor,
  expectPurged,
  legacyDrive,
  Mesh,
  PgDatabase,
  purge,
  quiesce,
  servingGate,
  stopNode,
  tombstone,
  until,
  waitForTombstone,
  type Node,
  type ReactorDb,
} from "./harness.js";

const FLAGS = { documentDecisions: true, authEnforcement: true };
const PROBE_MS = 50;
const DOC_TYPE = "powerhouse/document-model";
const DRIVE = "d";

async function holds(node: Node, id: string, type: string): Promise<boolean> {
  const row = await node.db
    .selectFrom("operation_index_operations")
    .select("opId")
    .where("documentId", "=", id)
    .where(sql<boolean>`action->>'type' = ${type}`)
    .executeTakeFirst();
  return row !== undefined;
}

async function headOrdinal(db: ReactorDb): Promise<number> {
  const row = await db
    .selectFrom("operation_index_operations")
    .select((eb) => eb.fn.max("ordinal").as("head"))
    .executeTakeFirst();
  return Number(row?.head ?? 0);
}

async function deadLetters(db: ReactorDb, id?: string) {
  let query = db.selectFrom("sync_dead_letters").selectAll();
  if (id) query = query.where("document_id", "=", id);
  return query.execute();
}

async function quarantined(node: Node): Promise<string[]> {
  return node.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
}

function forgedEnvelope(
  op: OperationWithContext["operation"],
  documentId: string,
) {
  return {
    type: "operations" as const,
    channelMeta: { id: "forged" },
    operations: [
      {
        operation: op,
        context: {
          documentId,
          documentType: DOC_TYPE,
          scope: "document",
          branch: "main",
          ordinal: 0,
        },
      },
    ],
  };
}

describe("two reactors on Postgres under authEnforcement", () => {
  const mesh = new Mesh();
  let dbs: PgDatabase[];
  let a: Node;
  let b: Node;
  let extra: Node | undefined;

  // B holds the child before anything else happens to it.
  async function child(id: string): Promise<void> {
    await a.client.create(createDocModelDocument({ id }), DRIVE);
    await receivedOn(b, id, "CREATE_DOCUMENT");
  }

  async function edit(id: string): Promise<void> {
    await a.client.execute(id, "main", [
      setModelName({ name: `${id}-edited` }),
    ]);
  }

  async function receivedOn(node: Node, id: string, type: string) {
    await until(`${node.name} holds ${id}'s ${type}`, () =>
      holds(node, id, type),
    );
  }

  function trusting(host: Node): BindingTrustPolicy {
    return new BindingTrustPolicy().bind(host.address, host.key.did);
  }

  beforeEach(async () => {
    dbs = [
      await PgDatabase.create("reactor_e2e_pair_a"),
      await PgDatabase.create("reactor_e2e_pair_b"),
    ];
    a = await buildNode({
      name: "a",
      db: dbs[0]!,
      mesh,
      featureFlags: FLAGS,
      catchUpIntervalMs: PROBE_MS,
      trustPolicy: new BindingTrustPolicy(),
    });
    b = await buildNode({
      name: "b",
      db: dbs[1]!,
      mesh,
      featureFlags: FLAGS,
      catchUpIntervalMs: PROBE_MS,
      trustPolicy: trusting(a),
    });
    await a.client.create(legacyDrive(DRIVE));
    await mesh.link(a, b, DRIVE, {
      servingA: servingGate(a, { address: b.address }),
      servingB: servingGate(b, { address: a.address }),
    });
    await receivedOn(b, DRIVE, "CREATE_DOCUMENT");
  });

  afterEach(async () => {
    try {
      await stopNode(a);
      await stopNode(b);
      await stopNode(extra);
    } finally {
      extra = undefined;
      mesh.clear();
      for (const db of dbs) await db.destroy();
    }
  });

  function expectNoGateErrors(): void {
    for (const [name, wire] of mesh.wires) {
      expect(wire.gateErrors, `serving gate errors on ${name}`).toEqual([]);
    }
  }

  it("B receives the marker and purges; both hold the same marker and tombstone", async () => {
    await child("x");
    await edit("x");
    await a.client.deleteDocument("x");
    await receivedOn(b, "x", "DELETE_DOCUMENT");

    await purge(a, "x", { requestId: "req-x" });
    const onA = await expectPurged(a.db, "x", {
      documentType: DOC_TYPE,
      signerKey: a.key.did,
      requestId: "req-x",
    });
    await waitForTombstone(b.db, "x");
    const onB = await expectPurged(b.db, "x", {
      documentType: DOC_TYPE,
      signerKey: a.key.did,
      requestId: "req-x",
    });

    expect(onB.marker).toEqual(onA.marker);
    for (const state of [onA, onB]) {
      expect(new Date(state.tombstone.purgedAtUtc).toISOString()).toBe(
        onA.marker.action.input.purgedAtUtcIso,
      );
    }
    expect(await deadLetters(a.db)).toEqual([]);
    expect(await deadLetters(b.db)).toEqual([]);
    expectNoGateErrors();
  });

  it("re-serving B from ordinal 0 after the purge stores nothing, dead-letters nothing, and does not fail the serving gate", async () => {
    await child("x");
    await a.client.deleteDocument("x");
    await receivedOn(b, "x", "DELETE_DOCUMENT");
    await purge(a, "x");
    await waitForTombstone(b.db, "x");
    const { marker } = await expectPurged(b.db, "x");
    await mesh.settle();
    const headA = await headOrdinal(a.db);
    const headB = await headOrdinal(b.db);

    // A fresh remote pair is B's cursor reset to 0.
    const [toB] = await mesh.link(a, b, DRIVE, {
      tag: "reset",
      servingA: servingGate(a, { address: b.address }),
      servingB: servingGate(b, { address: a.address }),
    });
    await until("A re-serves the marker from 0", () =>
      mesh.deliveredOperations(toB).some((op) => op.operation.id === marker.id),
    );
    await quiesce();
    await mesh.settle();

    expect(await headOrdinal(a.db), "A stores nothing").toBe(headA);
    expect(await headOrdinal(b.db), "B stores nothing").toBe(headB);
    expect(await deadLetters(a.db)).toEqual([]);
    expect(await deadLetters(b.db)).toEqual([]);
    for (const channel of mesh.channels.values()) {
      expect(channel.deadLetter.items).toEqual([]);
    }
    expectNoGateErrors();
    await expectPurged(a.db, "x");
    await expectPurged(b.db, "x");
  });

  it("a reactor added after the purge receives the marker only", async () => {
    await child("x");
    await edit("x");
    await a.client.deleteDocument("x");
    await purge(a, "x");

    dbs.push(await PgDatabase.create("reactor_e2e_pair_c"));
    extra = await buildNode({
      name: "c",
      db: dbs[2]!,
      mesh,
      featureFlags: FLAGS,
      catchUpIntervalMs: PROBE_MS,
      trustPolicy: trusting(a),
    });
    const [toC] = await mesh.link(a, extra, DRIVE, {
      servingA: servingGate(a, { address: extra.address }),
    });

    await waitForTombstone(extra.db, "x");
    await expectPurged(extra.db, "x", {
      documentType: DOC_TYPE,
      signerKey: a.key.did,
    });
    const servedForX = mesh
      .deliveredOperations(toC)
      .filter((op) => op.context.documentId === "x")
      .map((op) => op.operation.action.type);
    expect(servedForX).toEqual(["PURGE_DOCUMENT"]);
    await expectPurged(a.db, "x");
    expectNoGateErrors();
  });

  it("B applies delete-then-purge for a document whose delete it never received", async () => {
    await child("w");
    await edit("w");
    await receivedOn(b, "w", "SET_MODEL_NAME");

    await mesh.unlink(a, b);
    await a.client.deleteDocument("w");
    await purge(a, "w");
    const [toB] = await mesh.link(a, b, DRIVE, {
      tag: "after",
      servingA: servingGate(a, { address: b.address }),
    });

    await waitForTombstone(b.db, "w");
    await expectPurged(b.db, "w", {
      documentType: DOC_TYPE,
      signerKey: a.key.did,
    });
    const deletesServed = [...mesh.wires.keys()]
      .filter((name) => name.startsWith("a->b"))
      .flatMap((name) => mesh.deliveredOperations(name))
      .filter(
        (op) =>
          op.context.documentId === "w" &&
          op.operation.action.type === "DELETE_DOCUMENT",
      );
    expect(deletesServed, "B never received w's delete").toEqual([]);
    await expectPurged(a.db, "w");
    expect(mesh.deliveredOperations(toB).length).toBeGreaterThan(0);
    await expect(b.module.documentView.get("w")).rejects.toThrow();
  });

  it("a document quarantined on B before the purge still receives its marker", async () => {
    await child("q");
    await receivedOn(b, "q", "CREATE_DOCUMENT");

    const refused = new SyncOperation(
      "dl-q",
      "job-q",
      [],
      "b->a",
      "q",
      ["global"],
      "main",
      [],
    );
    refused.failed(
      new ChannelError(ChannelErrorSource.Inbox, new Error("unclassified")),
    );
    mesh.channels.get("b->a")!.deadLetter.add(refused);
    await until("B quarantines q", async () =>
      (await quarantined(b)).includes("q"),
    );

    await a.client.deleteDocument("q");
    await purge(a, "q");

    await expectPurged(a.db, "q");
    await waitForTombstone(b.db, "q");
    await expectPurged(b.db, "q", {
      documentType: DOC_TYPE,
      signerKey: a.key.did,
    });
  });

  it("an unsigned marker and an untrusted one fail B's load terminally with only the marker dead-lettered, and B's refusal does not quarantine A", async () => {
    await child("u");
    await a.client.deleteDocument("u");
    await receivedOn(b, "u", "DELETE_DOCUMENT");
    await mesh.settle();

    mesh.pause("a->b");
    await purge(a, "u");

    const untrusted = await TestP256Signer.create();
    const forged = [
      purgeMarker("u", { documentType: DOC_TYPE }),
      await signedPurgeMarker(untrusted.asISigner(), "u", {
        documentType: DOC_TYPE,
      }),
    ];
    const inbound = mesh.channels.get("b->a")!;
    for (const marker of forged) {
      inbound.receive(forgedEnvelope(marker, "u"));
    }

    await until(
      "B dead-letters both forged markers",
      async () => (await deadLetters(b.db, "u")).length >= forged.length,
    );
    const letters = await deadLetters(b.db, "u");
    for (const letter of letters) {
      const operations = letter.operations as OperationWithContext[];
      expect(
        operations.map((op) => op.operation.action.type),
        "a dead letter holds the marker only",
      ).toEqual(["PURGE_DOCUMENT"]);
    }
    expect(
      inbound.deadLetter.items
        .filter((item) => item.documentId === "u")
        .map((item) => syncOperationErrorType(item.error)),
    ).toEqual(forged.map(() => "SIGNATURE_INVALID"));
    expect(await tombstone(b.db, "u"), "B did not purge").toBeUndefined();

    const reported = mesh.reportDeadLetters("b->a", "u");
    expect(reported.length).toBe(forged.length);
    await quiesce();
    expect(await quarantined(a)).not.toContain("u");

    mesh.resume("a->b");
    await waitForTombstone(b.db, "u");
    await expectPurged(b.db, "u", {
      documentType: DOC_TYPE,
      signerKey: a.key.did,
    });
    await expectNoRowsFor(a.db, "u");
  });
});
