import { MemoryStorage, driveDocumentModelModule } from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IReactorClient } from "../../../src/client/types.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { IDocumentIndexer } from "../../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../../factories.js";

type Database = StorageDatabase & DocumentViewDatabase;

/**
 * These tests verify that the ConsistencyAwareLegacyStorage wrapper
 * correctly handles read-after-write consistency when using legacy storage mode.
 *
 * The ConsistencyAwareLegacyStorage wrapper ensures that reads wait for
 * operations to be fully processed before delegating to the inner storage.
 * This prevents race conditions where reads are attempted before writes complete.
 */
describe("ReactorClient with Legacy Storage (consistency-aware)", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let documentIndexer: IDocumentIndexer;
  let db: Kysely<Database>;

  beforeEach(async () => {
    const storage = new MemoryStorage();

    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    const operationStore = setup.store;

    const eventBus = new EventBus();

    const documentIndexerConsistencyTracker = new ConsistencyTracker();
    documentIndexer = new KyselyDocumentIndexer(
      db as any,
      operationStore,
      documentIndexerConsistencyTracker,
    );
    await documentIndexer.init();

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as any,
        documentModelDocumentModelModule,
      ])
      .withLegacyStorage(storage)
      .withReadModel(documentIndexer)
      .withEventBus(eventBus)
      .withFeatures({ legacyStorageEnabled: true });

    client = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .build();

    reactor = (client as any).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  describe("createEmpty with legacy storage", () => {
    it("should create empty document successfully", async () => {
      const document = await client.createEmpty("powerhouse/document-model");
      expect(document).toBeDefined();
      expect(document.header.documentType).toBe("powerhouse/document-model");
    });

    it("should create and retrieve multiple documents", async () => {
      const doc1 = await client.createEmpty("powerhouse/document-model");
      const doc2 = await client.createEmpty("powerhouse/document-model");

      expect(doc1.header.id).not.toBe(doc2.header.id);
      expect(doc1.header.documentType).toBe("powerhouse/document-model");
      expect(doc2.header.documentType).toBe("powerhouse/document-model");
    });
  });
});
