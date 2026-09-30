import {
  DOCUMENT_PURGE_PROTOCOL,
  isPurgeMarker,
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { SyncEventTypes } from "../../../src/sync/types.js";
import { purgeMarker, seedPurgedDocument } from "../../purge/helpers.js";
import {
  addFolder,
  create,
  Fleet,
  folders,
  manifestFor,
  NARROW,
  quiesce,
  settled,
  testProtocol,
  WIDE,
  type Node,
} from "./fleet.js";

const V1 = { "test-protocol": 1 };
const V2 = { "test-protocol": 2 };
const DRIVE = "drive";
const CHILD = "child";
const DRIVE_TYPE = "powerhouse/document-drive";
const WAIT = { timeout: 10_000, interval: 20 };

/** What a build from before erasure announces: no document-purge. */
const manifestWithoutPurge = (versions: number[]): PeerManifest =>
  localPeerManifest(
    mergePeerCapabilities(
      PEER_CAPABILITIES.filter(
        (capability) => capability.name !== DOCUMENT_PURGE_PROTOCOL,
      ),
      [testProtocol(versions)],
    ),
    {},
  );

async function driveWithChild(
  node: Node,
  childVersions: Record<string, number>,
): Promise<void> {
  await create(node, DRIVE, V1);
  await create(node, CHILD, childVersions);
  const info = await node.reactor.execute(DRIVE, "main", [
    addRelationshipAction(DRIVE, CHILD, "child"),
  ]);
  await settled(node.reactor, info.id);
}

/** The rows a purge of `documentId` leaves on `node`; returns the marker id. */
async function purge(node: Node, documentId: string): Promise<string> {
  const db = node.module.database as unknown as Kysely<Database>;
  for (const table of ["Operation", "operation_index_operations", "Keyframe"]) {
    await db
      .deleteFrom(table as "Operation")
      .where("documentId", "=", documentId)
      .execute();
  }
  await db
    .deleteFrom("sync_holds")
    .where("document_id", "=", documentId)
    .execute();
  await db
    .deleteFrom("sync_dead_letters")
    .where("document_id", "=", documentId)
    .execute();
  const marker = purgeMarker(documentId, { documentType: DRIVE_TYPE });
  await seedPurgedDocument(
    {
      db,
      store: node.module.operationStore,
      index: node.module.operationIndex,
    },
    marker,
    { reopenMemberships: db },
  );
  return marker.id;
}

function deliveredFor(fleet: Fleet, channel: string, documentId: string) {
  return (fleet.delivered.get(channel) ?? []).filter(
    (op) => op.context.documentId === documentId,
  );
}

/** Every operation id `node` holds for the child. */
async function childHistory(node: Node): Promise<string[]> {
  const page = await node.module.operationIndex.get(
    CHILD,
    { branch: "main" },
    { cursor: "0", limit: 1000 },
  );
  return page.results.map((entry) => entry.id);
}

async function quarantinedOn(node: Node): Promise<string[]> {
  return node.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
}

describe("a purged document's marker across peers [Postgres]", () => {
  const fleet = new Fleet({ postgres: true });

  afterEach(() => fleet.dispose());

  it.each([
    ["a silent peer", { silent: true }],
    [
      "a peer whose manifest lacks document-purge",
      { announce: () => manifestWithoutPurge(WIDE) },
    ],
  ])(
    "is held from %s without quarantine and released alone on upgrade",
    async (_label, options) => {
      const a = await fleet.node("a", WIDE);
      const b = await fleet.node("b", WIDE);
      const held = vi.fn();
      a.module.eventBus.subscribe(SyncEventTypes.SYNC_HELD, (_t, event) => {
        held(event);
      });
      await fleet.link(a, b, DRIVE, { b: options });
      await driveWithChild(a, V1);
      const history = await childHistory(a);
      await vi.waitFor(
        () =>
          expect(
            deliveredFor(fleet, "b->a", CHILD).map((op) => op.operation.id),
          ).toEqual(expect.arrayContaining(history)),
        WAIT,
      );
      await quiesce();
      const childOps = deliveredFor(fleet, "b->a", CHILD).length;

      const markerId = await purge(a, CHILD);
      await addFolder(a, DRIVE, "f1");
      await vi.waitFor(
        async () => expect(await folders(b, DRIVE)).toEqual(["f1"]),
        WAIT,
      );

      const reason = {
        protocol: "document-purge",
        version: 1,
        peerSupports: [],
      };
      await vi.waitFor(
        async () =>
          expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
            expect.objectContaining({
              documentId: CHILD,
              branch: "main",
              reason,
            }),
          ]),
        WAIT,
      );
      expect(held).toHaveBeenCalledWith({
        remoteName: "a->b",
        documentId: CHILD,
        branch: "main",
        reason,
      });
      await quiesce();
      expect(deliveredFor(fleet, "b->a", CHILD)).toHaveLength(childOps);
      expect(await quarantinedOn(a)).toEqual([]);
      expect(await quarantinedOn(b)).toEqual([]);
      expect(fleet.channels.get("a->b")!.deadLetter.items).toEqual([]);
      expect(fleet.channels.get("b->a")!.deadLetter.items).toEqual([]);

      const channel = fleet.channels.get("b->a")!;
      channel.options.silent = false;
      channel.options.announce = () => manifestFor(WIDE);
      channel.reannounce();

      await vi.waitFor(
        () =>
          expect(
            deliveredFor(fleet, "b->a", CHILD)
              .slice(childOps)
              .map((op) => op.operation.id),
          ).toEqual([markerId]),
        WAIT,
      );
      // The hold row goes after the resend, not before.
      await vi.waitFor(
        async () => expect(await a.sync.listHolds()).toEqual([]),
        WAIT,
      );
      // Applying it on b is the executor's receipt path (Track A).
    },
  );

  it("drops a hold the document earned before its purge and sends the marker", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", NARROW);
    await fleet.link(a, b, DRIVE);
    await driveWithChild(a, V2);
    await vi.waitFor(
      async () =>
        expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
          expect.objectContaining({ documentId: CHILD }),
        ]),
      WAIT,
    );
    expect(deliveredFor(fleet, "b->a", CHILD)).toEqual([]);

    const markerId = await purge(a, CHILD);
    await addFolder(a, DRIVE, "f1");

    await vi.waitFor(
      () =>
        expect(
          deliveredFor(fleet, "b->a", CHILD).map((op) => op.operation.id),
        ).toEqual([markerId]),
      WAIT,
    );
    expect(await a.sync.listHolds()).toEqual([]);
  });

  it("serves the marker alone to a remote added after the purge", async () => {
    const a = await fleet.node("a", WIDE);
    const c = await fleet.node("c", WIDE);
    await driveWithChild(a, V1);
    const markerId = await purge(a, CHILD);

    await fleet.link(a, c, DRIVE);

    // The seeded marker has no event: a's settled watermark alone releases it.
    await vi.waitFor(async () => {
      await a.module.catchUp.sweepNow();
      expect(
        deliveredFor(fleet, "c->a", CHILD).map((op) => op.operation.id),
      ).toEqual([markerId]);
    }, WAIT);
    await quiesce();
    expect(
      deliveredFor(fleet, "c->a", CHILD).filter((op) => isPurgeMarker(op)),
    ).toHaveLength(1);
    await vi.waitFor(
      () =>
        expect(deliveredFor(fleet, "c->a", DRIVE).length).toBeGreaterThan(0),
      WAIT,
    );
  });
});
