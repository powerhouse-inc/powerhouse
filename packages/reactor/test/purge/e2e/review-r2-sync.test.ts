import {
  isPurgeMarker,
  setModelName,
  type ActionSigner,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SignatureTrustPolicy } from "../../../src/signer/types.js";
import { createDocModelDocument } from "../../factories.js";
import { purgeMarker } from "../helpers.js";
import {
  BindingTrustPolicy,
  buildNode,
  legacyDrive,
  Mesh,
  PgDatabase,
  purge,
  quiesce,
  servingGate,
  stopNode,
  syncState,
  tombstone,
  until,
  type Node,
} from "./harness.js";

const FLAGS = { documentDecisions: true, authEnforcement: true };
const PROBE_MS = 50;
const DOC_TYPE = "powerhouse/document-model";
const DRIVE = "d";

/** Unreachable for x while `down`, as a Renown outage for x's signer would be. */
class FlakyPolicy implements SignatureTrustPolicy {
  down = false;
  calls = 0;
  constructor(private readonly inner: SignatureTrustPolicy) {}
  authorizeSigner(
    signer: ActionSigner,
    key: string,
    documentId: string,
  ): Promise<boolean> {
    this.calls++;
    if (this.down && documentId === "x") {
      return Promise.reject(new Error("trust service unreachable"));
    }
    return this.inner.authorizeSigner(signer, key, documentId);
  }
}

async function holds(node: Node, id: string, type: string): Promise<boolean> {
  const row = await node.db
    .selectFrom("operation_index_operations")
    .select("opId")
    .where("documentId", "=", id)
    .where(sql<boolean>`action->>'type' = ${type}`)
    .executeTakeFirst();
  return row !== undefined;
}

async function quarantined(node: Node): Promise<string[]> {
  return node.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
}

async function outboxCursor(node: Node, remote: string): Promise<number> {
  const row = await node.db
    .selectFrom("sync_cursors")
    .select("cursor_ordinal")
    .where("remote_name", "=", remote)
    .where("cursor_type", "=", "outbox")
    .executeTakeFirst();
  return Number(row?.cursor_ordinal ?? 0);
}

function envelope(
  op: OperationWithContext["operation"],
  documentId: string,
  scope = "document",
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
          scope,
          branch: "main",
          ordinal: 0,
        },
      },
    ],
  };
}

describe("r2 review: sync/peers [Postgres]", () => {
  const mesh = new Mesh();
  let dbs: PgDatabase[];
  let a: Node;
  let b: Node;
  let policy: FlakyPolicy;

  async function receivedOn(node: Node, id: string, type: string) {
    await until(
      `${node.name} holds ${id}'s ${type}`,
      () => holds(node, id, type),
      undefined,
      () => syncState([a, b], mesh),
    );
  }

  async function child(id: string): Promise<void> {
    await a.client.create(createDocModelDocument({ id }), DRIVE);
    await receivedOn(b, id, "CREATE_DOCUMENT");
  }

  const buildB = () =>
    buildNode({
      name: "b",
      db: dbs[1]!,
      mesh,
      featureFlags: FLAGS,
      catchUpIntervalMs: PROBE_MS,
      trustPolicy: policy,
    });

  /** x created, edited and deleted on A and B, then purged on A while B's policy is down. */
  async function purgeDuringOutage(): Promise<number> {
    await child("x");
    await a.client.execute("x", "main", [setModelName({ name: "x-personal" })]);
    await receivedOn(b, "x", "SET_MODEL_NAME");
    await a.client.deleteDocument("x");
    await receivedOn(b, "x", "DELETE_DOCUMENT");
    await mesh.settle();

    policy.down = true;
    const before = policy.calls;
    const { ordinal } = await purge(a, "x");
    // Two failed jobs: the first load and at least one retry of it.
    await until(
      "B fails x's marker load twice",
      () => policy.calls >= before + 8,
      30_000,
    );
    // B applies what follows the marker; its ack must not pass the marker.
    await child("y");
    await quiesce(500);
    return ordinal;
  }

  async function purgedOnB(): Promise<void> {
    await until(
      "B purges x",
      async () => (await tombstone(b.db, "x")) !== undefined,
      30_000,
    );
    const rows = await b.db
      .selectFrom("Operation")
      .select((eb) => eb.fn.countAll().as("n"))
      .where("documentId", "=", "x")
      .where(sql<boolean>`action->>'type' != 'PURGE_DOCUMENT'`)
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(0);
    expect(await quarantined(b)).toEqual([]);
  }

  beforeEach(async () => {
    dbs = [
      await PgDatabase.create("reactor_r2_a"),
      await PgDatabase.create("reactor_r2_b"),
    ];
    a = await buildNode({
      name: "a",
      db: dbs[0]!,
      mesh,
      featureFlags: FLAGS,
      catchUpIntervalMs: PROBE_MS,
      trustPolicy: new BindingTrustPolicy(),
    });
    const aKey = a.key.did;
    policy = new FlakyPolicy(new BindingTrustPolicy().bind(a.address, aKey));
    b = await buildB();
    await a.client.create(legacyDrive(DRIVE));
    await mesh.link(a, b, DRIVE, {
      a: { acked: true },
      servingA: servingGate(a, { address: b.address }),
      servingB: servingGate(b, { address: a.address }),
    });
    await receivedOn(b, DRIVE, "CREATE_DOCUMENT");
  });

  afterEach(async () => {
    try {
      await stopNode(a);
      await stopNode(b);
    } finally {
      mesh.clear();
      for (const db of dbs) await db.destroy();
    }
  });

  it("retries a marker whose load failed on a trust-policy outage, then purges", async () => {
    const ordinal = await purgeDuringOutage();

    const inbound = mesh.channels.get("b->a")!;
    expect(inbound.deadLetter.items.map((i) => i.documentId)).not.toContain(
      "x",
    );
    expect(inbound.inbox.items.some((i) => i.documentId === "x")).toBe(true);
    expect(await quarantined(b)).not.toContain("x");
    expect(await tombstone(b.db, "x")).toBeUndefined();

    expect(inbound.inbox.ackOrdinal).toBeLessThan(ordinal);
    expect(await outboxCursor(a, "a->b")).toBeLessThan(ordinal);
    expect(
      mesh.channels
        .get("a->b")!
        .outbox.items.some((item) =>
          item.operations.some((op) => isPurgeMarker(op)),
        ),
    ).toBe(true);

    policy.down = false;
    await purgedOnB();
    expect(inbound.deadLetter.items).toEqual([]);
    await until(
      "A's cursor passes the marker",
      async () => (await outboxCursor(a, "a->b")) >= ordinal,
    );
  });

  it("re-receives the marker after B restarts mid-outage, then purges", async () => {
    const ordinal = await purgeDuringOutage();
    await stopNode(b);
    b = await buildB();
    const calls = policy.calls;
    await until(
      "the restarted B loads x's marker again",
      () => policy.calls > calls,
      30_000,
    );
    expect(await tombstone(b.db, "x")).toBeUndefined();
    expect(await outboxCursor(a, "a->b")).toBeLessThan(ordinal);

    policy.down = false;
    await purgedOnB();
  });

  it("dead-letters an unsigned marker for a live document without quarantine", async () => {
    await child("z");
    await mesh.settle();
    const inbound = mesh.channels.get("b->a")!;
    inbound.receive(
      envelope(purgeMarker("z", { documentType: DOC_TYPE }), "z"),
    );
    await until("B dead-letters the forged marker", () =>
      inbound.deadLetter.items.some((i) => i.documentId === "z"),
    );
    const letter = inbound.deadLetter.items.find((i) => i.documentId === "z")!;
    expect(letter.error?.errorType).toBe("MARKER_REFUSED");
    expect(letter.operations.every((op) => isPurgeMarker(op))).toBe(true);
    await quiesce();

    await a.client.execute("z", "main", [setModelName({ name: "later" })]);
    await receivedOn(b, "z", "SET_MODEL_NAME");
    expect(await quarantined(b)).not.toContain("z");
    expect(await quarantined(a)).not.toContain("z");
    expect(await tombstone(b.db, "z")).toBeUndefined();
  });

  it("still quarantines a live document on a peer's malformed ordinary op", async () => {
    await child("w");
    await mesh.settle();
    const inbound = mesh.channels.get("b->a")!;
    const action = setModelName({ name: "junk" });
    const bad = [
      {
        id: "junk-1",
        index: 1,
        skip: 0,
        hash: "",
        timestampUtcMs: "not-a-time",
        action: { ...action, timestampUtcMs: "not-a-time" },
      },
      {
        id: "junk-2",
        index: 0,
        skip: 0,
        hash: "junk",
        timestampUtcMs: new Date().toISOString(),
        action: { ...action, id: "junk-2-action", scope: "global" },
      },
    ];
    for (const op of bad) {
      inbound.receive(envelope(op as never, "w", "global"));
    }
    await until("B quarantines w", async () =>
      (await quarantined(b)).includes("w"),
    );
  });
});
