import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe } from "vitest";
import type {
  ISyncCursorStorage,
  OperationContext,
} from "../../../../src/storage/interfaces.js";
import type { KyselySyncRemoteStorage } from "../../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../../src/storage/kysely/types.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type { RemoteRecord } from "../../../../src/sync/types.js";
import { createTestSyncStorage } from "../../../factories.js";

describe("GqlResponseChannel Integration", () => {
  let db: Kysely<Database>;
  let cursorStorage: ISyncCursorStorage;
  let remoteStorage: KyselySyncRemoteStorage;

  const createMockOperationContext = (
    ordinal: number = 0,
  ): OperationContext => ({
    documentId: "doc-1",
    documentType: "test/document",
    scope: "public",
    branch: "main",
    ordinal,
  });

  const createMockSyncOperation = (
    id: string,
    remoteName: string,
    ordinal: number,
  ): SyncOperation => {
    return new SyncOperation(
      id,
      "",
      [],
      remoteName,
      "doc-1",
      ["public"],
      "main",
      [
        {
          operation: {
            index: 0,
            skip: 0,
            id: `op-${ordinal}`,
            timestampUtcMs: new Date().toISOString(),
            hash: `hash-${ordinal}`,
            action: {
              type: "TEST_OP",
              id: `action-${ordinal}`,
              scope: "public",
              timestampUtcMs: new Date().toISOString(),
              input: {},
            },
          },
          context: createMockOperationContext(ordinal),
        },
      ],
    );
  };

  const createTestRemote = async (name: string): Promise<void> => {
    const remote: RemoteRecord = {
      id: "channel-1",
      name,
      collectionId: "collection-1",
      channelConfig: {
        type: "polling",
        parameters: {},
      },
      filter: {
        documentId: [],
        scope: [],
        branch: "main",
      },
      options: { sinceTimestampUtcMs: "0" },
      status: {
        push: { state: "idle", failureCount: 0 },
        pull: { state: "idle", failureCount: 0 },
      },
    };
    await remoteStorage.upsert(remote);
  };

  beforeEach(async () => {
    const setup = await createTestSyncStorage();
    db = setup.db;
    cursorStorage = setup.syncCursorStorage;
    remoteStorage = setup.syncRemoteStorage;
  });

  afterEach(async () => {
    await db.destroy();
  });
});
