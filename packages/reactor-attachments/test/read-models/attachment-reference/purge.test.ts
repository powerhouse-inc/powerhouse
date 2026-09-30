import {
  ConsistencyTracker,
  JobStatus,
  ReactorBuilder,
  supportsLiveReadModelRegistration,
  type AttachmentRef,
  type DocumentViewDatabase,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentSchemaCompiler } from "../../../src/reference-index/attachment-schema-compiler.js";
import { AttachmentReferenceReadModel } from "../../../src/read-models/attachment-reference/attachment-reference-read-model.js";
import { AttachmentReferenceIndexBuilder } from "../../../src/read-models/attachment-reference/index-builder.js";
import { ATTACHMENT_REFERENCE_SCHEMA } from "../../../src/read-models/attachment-reference/storage/migrations/migrator.js";
import type {
  IAttachmentReferenceReader,
  IAttachmentReferenceWriter,
} from "../../../src/read-models/attachment-reference/types.js";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";
const DATABASE = "reactor_attachments_purge";
const REF_A = `attachment://v1:${"a".repeat(64)}` as AttachmentRef;
const REF_B = `attachment://v1:${"b".repeat(64)}` as AttachmentRef;

describe("AttachmentReferenceReadModel on PURGE_DOCUMENT [Postgres]", () => {
  let admin: Pool;
  let base: Kysely<unknown>;
  let module: InProcessReactorModule;
  let store: IAttachmentReferenceReader & IAttachmentReferenceWriter;

  beforeEach(async () => {
    admin = new Pool({ connectionString: PG_TEST_URL });
    await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DATABASE}"`);
    const url = new URL(PG_TEST_URL);
    url.pathname = `/${DATABASE}`;
    const pool = new Pool({ connectionString: url.toString(), max: 10 });
    pool.on("error", (error: Error & { code?: string }) => {
      if (error.code !== "57P01") throw error;
    });
    base = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
    module = await new ReactorBuilder()
      .withKysely(base as never)
      .withDocumentModelSources([driveDocumentModelModule as never])
      .buildModule();
    ({ store } = await new AttachmentReferenceIndexBuilder(base).build());
  });

  afterEach(async () => {
    try {
      await module.reactor.kill().completed;
      await base.destroy();
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
      await admin.end();
    }
  });

  function makeModel(): AttachmentReferenceReadModel {
    const model = new AttachmentReferenceReadModel(
      module.database as unknown as Kysely<DocumentViewDatabase>,
      module.operationIndex,
      module.writeCache,
      new ConsistencyTracker(),
      module.documentModelRegistry,
      new AttachmentSchemaCompiler(),
      store,
    );
    model.attachCatchUp(module.settledWatermark, 100_000);
    return model;
  }

  async function settle(jobId: string): Promise<void> {
    let status: JobStatus | undefined;
    let error: string | undefined;
    await vi.waitUntil(
      async () => {
        const info = await module.reactor.getJobStatus(jobId);
        status = info.status;
        error = info.error?.message;
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 20_000, interval: 20 },
    );
    expect({ status, error }).toEqual({
      status: JobStatus.READ_READY,
      error: undefined,
    });
  }

  async function createDrive(name: string): Promise<string> {
    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: generateId() },
    );
    await settle((await module.reactor.create(drive)).id);
    await settle(
      (
        await module.reactor.execute(drive.header.id, "main", [
          setDriveName({ name }),
        ])
      ).id,
    );
    return drive.header.id;
  }

  async function purge(documentId: string): Promise<number> {
    await settle((await module.reactor.deleteDocument(documentId)).id);
    const [info] = await module.documentPurgeService.enqueuePurge(
      [documentId],
      "request-1",
    );
    await settle(info.id);
    const row = await (module.database as unknown as Kysely<any>)
      .selectFrom("document_purges")
      .select("ordinal")
      .where("documentId", "=", documentId)
      .executeTakeFirstOrThrow();
    return Number(row.ordinal);
  }

  async function seed(documentId: string, ref: AttachmentRef, ordinal = 1) {
    await store.addReferences([
      {
        documentId,
        ref,
        operationId: `operation-${documentId}`,
        branch: "main",
        scope: "global",
        ordinal,
      },
    ]);
  }

  async function referenceCount(documentId: string): Promise<number> {
    const result = await sql<{ count: string }>`
      select count(*) as count
      from ${sql.id(ATTACHMENT_REFERENCE_SCHEMA, "attachment_reference")}
      where document_id = ${documentId}
    `.execute(base);
    return Number(result.rows[0].count);
  }

  async function sweepToHead(model: AttachmentReferenceReadModel) {
    const present = await module.operationIndex.getOrdinalsInRange(
      0,
      2 ** 31 - 1,
      100_000,
    );
    const head = Math.max(0, ...present);
    return model.sweep(
      head,
      present.filter((ordinal) => ordinal > model.appliedThrough),
    );
  }

  it("deletes the purged document's references on the live marker", async () => {
    const purged = await createDrive("purged");
    const kept = await createDrive("kept");
    const model = makeModel();
    await model.init();
    const coordinator = module.readModelCoordinator;
    if (!supportsLiveReadModelRegistration(coordinator)) {
      throw new Error("coordinator cannot register a live read model");
    }
    coordinator.addReadModel(model, "pre_ready");
    await seed(purged, REF_A);
    await seed(purged, REF_B);
    await seed(kept, REF_A);

    await purge(purged);

    expect(await referenceCount(purged)).toBe(0);
    expect(await referenceCount(kept)).toBe(1);
    expect(await store.hasReference(kept, REF_A)).toBe(true);
  });

  it("deletes them when the marker arrives only through a sweep, idempotently", async () => {
    const purged = await createDrive("purged");
    const kept = await createDrive("kept");
    const model = makeModel();
    await model.init();
    await seed(purged, REF_A);
    await seed(kept, REF_B);

    const markerOrdinal = await purge(purged);
    expect(await referenceCount(purged)).toBe(1);

    const result = await sweepToHead(model);
    expect(result.blockedAt).toBeUndefined();
    expect(model.appliedThrough).toBe(markerOrdinal);
    expect(await referenceCount(purged)).toBe(0);
    expect(await referenceCount(kept)).toBe(1);

    await seed(purged, REF_A);
    await (module.database as unknown as Kysely<any>)
      .updateTable("ViewState")
      .set({ lastOrdinal: markerOrdinal - 1 })
      .where("readModelId", "=", model.consumerId)
      .execute();
    const rebooted = makeModel();
    await rebooted.init();
    expect(await referenceCount(purged)).toBe(0);
    await sweepToHead(rebooted);
    expect(rebooted.appliedThrough).toBe(markerOrdinal);
    expect(await referenceCount(purged)).toBe(0);
  });

  it("sweeps past a purged range and applies the marker", async () => {
    const model = makeModel();
    await model.init();
    const from = model.appliedThrough;
    const purged = await createDrive("purged");
    const kept = await createDrive("kept");
    await seed(purged, REF_A);
    await seed(kept, REF_B);

    const markerOrdinal = await purge(purged);
    const present = await module.operationIndex.getOrdinalsInRange(
      from + 1,
      markerOrdinal,
      100_000,
    );
    const range = Array.from(
      { length: markerOrdinal - from },
      (_, index) => from + 1 + index,
    );
    expect(present.length).toBeLessThan(range.length);

    const result = await sweepToHead(model);

    expect(result.blockedAt).toBeUndefined();
    expect(model.appliedThrough).toBe(markerOrdinal);
    expect(await referenceCount(purged)).toBe(0);
    expect(await referenceCount(kept)).toBe(1);
  });
});
