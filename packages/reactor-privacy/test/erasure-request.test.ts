import {
  DEFAULT_MAX_PURGE_OPERATIONS,
  DocumentNotDeletedError,
  removeRelationshipAction,
} from "@powerhousedao/reactor";
import {
  initializeAuth,
  type Grant,
} from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN,
  audit,
  createDoc,
  createDrive,
  db,
  events,
  expectNoIdentifiers,
  remove,
  setup,
  teardown,
} from "./utils/erasure.js";
import { signedBy } from "./utils/p256-signer.js";
import { settled } from "./utils/reactor.js";

afterEach(teardown);

describe("erasure plan and request [Postgres]", () => {
  it("expands a drive to its ever-members and reports the cap and group referencers", async () => {
    const e = await setup();
    const kept = await createDoc(e);
    const left = await createDoc(e);
    const shared = await createDoc(e);
    const drive = await createDrive(e, [kept, left, shared]);
    await createDrive(e, [shared]);
    const job = await e.host.module.reactor.execute(drive, "main", [
      removeRelationshipAction(drive, left, "child"),
    ]);
    await settled(e.host.module, job.id);

    const referencer = await createDoc(e, e.signer.jwk);
    const grant = {
      id: "g-group",
      description: "the group executes global",
      effect: "allow",
      principal: { group: kept },
      capability: { can: "execute", scope: "global" },
    } as Grant;
    const init = await e.host.module.reactor.execute(referencer, "main", [
      await signedBy(
        e.signer,
        initializeAuth({ version: 1, grants: [grant] }),
        referencer,
      ),
    ]);
    await settled(e.host.module, init.id);

    const plan = await e.service.plan([drive]);
    expect(plan.maxPurgeOperations).toBe(DEFAULT_MAX_PURGE_OPERATIONS);
    expect(
      plan.items.map(({ documentId, expandedFrom }) => [
        documentId,
        expandedFrom,
      ]),
    ).toEqual([[drive, null], ...[kept, left].sort().map((id) => [id, drive])]);
    for (const planned of plan.items) {
      expect(planned.live).toBe(true);
      expect(planned.operationCount).toBeGreaterThan(0);
    }
    const byId = new Map(plan.items.map((i) => [i.documentId, i]));
    expect(byId.get(kept)!.groupReferencers).toEqual([referencer]);
    expect(byId.get(left)!.groupReferencers).toEqual([]);
  });

  it("refuses a live id, and a deleted drive's live member", async () => {
    const e = await setup();
    const live = await createDoc(e);
    await expect(
      e.service.request([live], { requestedBy: ADMIN }),
    ).rejects.toSatisfy(
      (error: Error) =>
        DocumentNotDeletedError.isError(error) && error.message.includes(live),
    );

    const child = await createDoc(e);
    const drive = await createDrive(e, [child]);
    await remove(e, drive);
    await expect(
      e.service.request([drive], { requestedBy: ADMIN }),
    ).rejects.toThrow(child);
    const requests = await db(e)
      .selectFrom("erasure_requests")
      .selectAll()
      .execute();
    expect(requests).toEqual([]);
  });

  it("refuses a document whose delete was denied", async () => {
    const e = await setup();
    const denied = await createDoc(e);
    await remove(e, denied);
    await db(e)
      .updateTable("Operation")
      .set({ deniedReason: "denied" })
      .where("documentId", "=", denied)
      .where(sql<boolean>`action->>'type' = 'DELETE_DOCUMENT'`)
      .execute();

    const plan = await e.service.plan([denied]);
    expect(plan.items.map((i) => i.live)).toEqual([true]);
    await expect(
      e.service.request([denied], { requestedBy: ADMIN }),
    ).rejects.toSatisfy((error: Error) =>
      DocumentNotDeletedError.isError(error),
    );
  });

  it("records the request with requestedBy hashed and the expansion audited", async () => {
    const e = await setup();
    const child = await createDoc(e);
    const drive = await createDrive(e, [child]);
    await remove(e, child);
    await remove(e, drive);

    const request = await e.service.request([drive], { requestedBy: ADMIN });
    expect(request.status).toBe("open");
    expect(request.requestedBy).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(request.items.map((i) => [i.documentId, i.status]).sort()).toEqual(
      [
        [child, "waiting"],
        [drive, "waiting"],
      ].sort(),
    );
    expect(await events(e, request.requestId, null)).toEqual(["requested"]);
    const expanded = (await audit(e, request.requestId)).find(
      (row) => row.event === "expanded",
    );
    expect(expanded).toMatchObject({
      documentId: drive,
      detail: { members: [child] },
    });
    await expectNoIdentifiers(e);
  });
});
