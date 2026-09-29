import type { AuthSubject } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import type { IReadGate } from "../../src/decision/read-gate.js";
import { SyncScopeGate } from "../../src/decision/sync-scope-gate.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { DocumentNotFoundError } from "../../src/shared/errors.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../factories.js";

const SUBJECT: AuthSubject = { address: "0xreader" };

function writeCache(): IWriteCache {
  return {
    getState: vi.fn().mockResolvedValue({}),
    putState: vi.fn(),
    putRun: vi.fn(),
    invalidate: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  } as unknown as IWriteCache;
}

describe("an id the document view does not hold [Postgres]", () => {
  let view: KyselyDocumentView;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    cleanup = setup.cleanup;
    view = new KyselyDocumentView(
      setup.db as unknown as Kysely<StorageDatabase & DocumentViewDatabase>,
      setup.store,
      new KyselyOperationIndex(setup.db),
      writeCache(),
      new ConsistencyTracker(),
      DeletedDocumentRead.NotFound,
    );
  });

  afterEach(async () => {
    await cleanup();
  });

  it("reads as DocumentNotFoundError from every single-document read", async () => {
    const id = generateId();

    for (const read of [
      () => view.get(id),
      () => view.getByIdOrSlug(id),
      () => view.resolveIdOrSlug(id),
    ]) {
      const error = await read().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(DocumentNotFoundError.isError(error)).toBe(true);
      expect((error as DocumentNotFoundError).documentId).toBe(id);
      expect((error as Error).message).toBe(`Document not found: ${id}`);
    }
  });

  it("is served its metadata scopes only by the sync scope gate", async () => {
    const gate: IReadGate & { scopePredicate: ReturnType<typeof vi.fn> } = {
      scopePredicate: vi.fn().mockResolvedValue(() => true),
    };

    const readable = await new SyncScopeGate(gate, view).scopePredicateById(
      generateId(),
      SUBJECT,
      "main",
    );

    expect(readable("auth")).toBe(true);
    expect(readable("document")).toBe(true);
    expect(readable("global")).toBe(false);
    expect(gate.scopePredicate).not.toHaveBeenCalled();
  });
});
