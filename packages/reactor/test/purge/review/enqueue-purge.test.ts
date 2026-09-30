import { generateId } from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus } from "../../../src/shared/types.js";
import { PURGE_NS } from "../../../src/storage/kysely/document-purges.js";
import { createDocModelDocument } from "../../factories.js";
import {
  createTestDatabase,
  expectPurged,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

describe("DocumentPurgeService.enqueuePurge [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_review_enqueue_purge");
    host = await startReactor(database);
  });

  afterAll(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  it("resolves once queued, while the purge job still waits", async () => {
    const document = createDocModelDocument({ id: generateId() });
    const documentId = document.header.id;
    await succeeded(host.reactor, (await host.reactor.create(document)).id);
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(documentId)).id,
    );

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding!: () => void;
    const held = new Promise<void>((resolve) => (holding = resolve));
    const holder = database.base.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock_shared(${sql.lit(PURGE_NS)}, hashtext(${documentId}) & 1023)`.execute(
        trx,
      );
      holding();
      await released;
    });
    await held;

    let infos;
    try {
      infos = await Promise.race([
        host.service.enqueuePurge([documentId], "req-queued"),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("enqueuePurge waited on the job")),
            5_000,
          ),
        ),
      ]);
      const status = (await host.reactor.getJobStatus(infos[0].id)).status;
      expect([JobStatus.PENDING, JobStatus.RUNNING]).toContain(status);
    } finally {
      release();
      await holder;
    }

    await succeeded(host.reactor, infos[0].id);
    await expectPurged(host.db, documentId);
    const info = await settled(host.reactor, infos[0].id);
    expect(info.status).toBe(JobStatus.READ_READY);
  }, 60_000);
});
