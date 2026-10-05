import { generateId } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { checkStoredProtocols } from "../../../src/core/stored-protocol-check.js";
import {
  countDocumentsCreatedWith,
  storedProtocolVersions,
} from "../../../src/storage/kysely/stored-protocol-versions.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import {
  createMockLogger,
  createTestOperationStorePostgres,
} from "../../factories.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";
import { createDocument, deleteOperations } from "./fixtures.js";

const NARROW = { "base-reducer": [1, 2] };

describe("stored protocol scan after a purge", () => {
  let baseDb: Kysely<Database>;
  let db: Kysely<Database>;
  let schema: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    baseDb = setup.baseDb;
    db = setup.db;
    schema = setup.schema;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  function check() {
    return checkStoredProtocols(
      baseDb,
      schema,
      NARROW,
      "refuse",
      createMockLogger(),
    );
  }

  it("counts a purged document neither as stored nor as refused after a restart", async () => {
    const store = new KyselyOperationStore(db);
    const documentId = generateId();
    await createDocument(store, documentId, { "base-reducer": 7 });
    await expect(check()).rejects.toMatchObject({ documents: 1 });
    const [refused] = await storedProtocolVersions(baseDb, schema);

    await deleteOperations(db, documentId);
    await seedPurgedDocument(
      { db, store, index: new KyselyOperationIndex(db) },
      purgeMarker(documentId),
    );

    // Fresh stores over the same database, as a restart builds them.
    const restarted = new KyselyOperationStore(db);
    await createDocument(restarted, generateId(), { "base-reducer": 2 });
    expect(await storedProtocolVersions(baseDb, schema)).toEqual([
      expect.objectContaining({ versions: { "base-reducer": 2 } }),
    ]);
    expect(
      await countDocumentsCreatedWith(baseDb, schema, [refused.hash]),
    ).toBe(0);
    await expect(check()).resolves.toBeUndefined();
  });

  it("never matches a marker at index 0, even one carrying protocolVersions", async () => {
    const store = new KyselyOperationStore(db);
    const documentId = generateId();
    const marker = purgeMarker(documentId);
    const forged = {
      ...marker,
      action: {
        ...marker.action,
        input: { ...marker.action.input, protocolVersions: { x: 99 } },
      },
    };
    await seedPurgedDocument(
      { db, store, index: new KyselyOperationIndex(db) },
      forged,
    );

    expect(await storedProtocolVersions(baseDb, schema)).toEqual([]);
    await expect(
      checkStoredProtocols(
        baseDb,
        schema,
        { x: [1] },
        "refuse",
        createMockLogger(),
      ),
    ).resolves.toBeUndefined();
  });
});
