import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentPurgeService } from "../../../src/admin/document-purge-service.js";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../../src/core/types.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { JobStatus } from "../../../src/shared/types.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { REACTOR_SCHEMA } from "../../../src/storage/migrations/migrator.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import {
  createDocModelDocument,
  createTestChannelFactory,
} from "../../factories.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";
import {
  createScratchDatabase,
  deleteOperations,
  DOCUMENT_TYPE,
} from "./fixtures.js";

type VersionLookup = {
  protocolVersionsOf(
    documentId: string,
    branch: string,
  ): Promise<Record<string, number> | undefined>;
};

describe("reactor builder caches for a purged id", () => {
  let module: InProcessReactorModule;
  let db: Kysely<Database>;
  let drop: () => Promise<void>;

  beforeEach(async () => {
    const scratch = await createScratchDatabase("reactor_purge_builder");
    drop = scratch.drop;
    db = scratch.db.withSchema(REACTOR_SCHEMA) as unknown as Kysely<Database>;
    module = await new ReactorBuilder()
      .withKysely(scratch.db)
      .withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
      ])
      .withSync(
        new SyncBuilder().withChannelFactory(createTestChannelFactory()),
      )
      .buildModule();
  });

  afterEach(async () => {
    await module.syncModule?.syncManager.shutdown();
    await module.reactor.kill().completed;
    await drop();
  });

  it("evicts the host caches on a marker and derives the purged versions", async () => {
    const document = createDocModelDocument({ id: generateId() });
    const documentId = document.header.id;
    const job = await module.reactor.create(document);
    await vi.waitUntil(
      async () =>
        (await module.reactor.getJobStatus(job.id)).status ===
        JobStatus.READ_READY,
      { timeout: 10_000 },
    );
    const lookup = module.syncModule!.syncManager as unknown as VersionLookup;
    const created = await lookup.protocolVersionsOf(documentId, "main");
    expect(created).toBeDefined();
    expect(created).not.toHaveProperty("document-purge");
    const writeCache = module.writeCache as KyselyWriteCache;
    await writeCache.getState(documentId, "document", "main");

    await deleteOperations(db, documentId);
    const marker = purgeMarker(documentId);
    const ordinal = await seedPurgedDocument(
      {
        db,
        store: new KyselyOperationStore(db),
        index: new KyselyOperationIndex(db),
      },
      marker,
    );
    const item: OperationWithContext = {
      operation: marker,
      context: {
        documentId,
        documentType: DOCUMENT_TYPE,
        scope: "document",
        branch: "main",
        ordinal,
      },
    };
    await module.eventBus
      .emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: generateId(),
        operations: [item],
        jobMeta: { batchId: generateId(), batchJobIds: [] },
      })
      .catch(() => {});

    expect(
      writeCache.getStream(documentId, "document", "main"),
    ).toBeUndefined();
    expect(await lookup.protocolVersionsOf(documentId, "main")).toEqual({
      "document-purge": 1,
    });
  });

  it("stops evicting the host caches once the reactor is killed", async () => {
    const document = createDocModelDocument({ id: generateId() });
    const documentId = document.header.id;
    const job = await module.reactor.create(document);
    await vi.waitUntil(
      async () =>
        (await module.reactor.getJobStatus(job.id)).status ===
        JobStatus.READ_READY,
      { timeout: 10_000 },
    );
    const writeCache = module.writeCache as KyselyWriteCache;
    await writeCache.getState(documentId, "document", "main");
    await module.reactor.kill().completed;

    await module.eventBus
      .emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: generateId(),
        operations: [
          {
            operation: purgeMarker(documentId),
            context: {
              documentId,
              documentType: DOCUMENT_TYPE,
              scope: "document",
              branch: "main",
              ordinal: 1,
            },
          },
        ],
        jobMeta: { batchId: generateId(), batchJobIds: [] },
      })
      .catch(() => {});

    expect(writeCache.getStream(documentId, "document", "main")).toBeDefined();
  });

  it("exposes the purge service on the module", () => {
    expect(module.documentPurgeService).toBeInstanceOf(DocumentPurgeService);
  });
});
