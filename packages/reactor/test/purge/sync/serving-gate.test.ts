import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import type { IReadGate } from "../../../src/decision/read-gate.js";
import { SyncScopeGate } from "../../../src/decision/sync-scope-gate.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import {
  DocumentNotFoundError,
  DocumentPurgedError,
} from "../../../src/shared/errors.js";
import type { IDocumentView } from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";

const SUBJECT: AuthSubject = { address: "0xreader" };
const DOC = "purged-doc";

function readGate(): IReadGate & {
  scopePredicate: ReturnType<typeof vi.fn>;
} {
  return { scopePredicate: vi.fn().mockResolvedValue(() => true) };
}

function expectMetaOnly(readable: (scope: string) => boolean): void {
  expect(readable("auth")).toBe(true);
  expect(readable("document")).toBe(true);
  expect(readable("global")).toBe(false);
}

describe("serving a purged id through the sync scope gate [Postgres]", () => {
  let view: KyselyDocumentView;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    cleanup = setup.cleanup;
    const db = setup.db as unknown as Kysely<Database>;
    const index = new KyselyOperationIndex(db);
    view = new KyselyDocumentView(
      setup.db as unknown as Kysely<Database & DocumentViewDatabase>,
      setup.store,
      index,
      {
        getState: vi.fn().mockRejectedValue(new DocumentPurgedError(DOC)),
      } as unknown as IWriteCache,
      new ConsistencyTracker(),
      DeletedDocumentRead.NotFound,
    );
    await seedPurgedDocument(
      { db, store: setup.store, index },
      purgeMarker(DOC),
    );
  });

  afterEach(async () => {
    await cleanup();
  });

  it("reads the purged id as absent and serves its document scope, without throwing", async () => {
    const error = await view.get(DOC).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(DocumentNotFoundError.isError(error)).toBe(true);

    const gate = readGate();
    const readable = await new SyncScopeGate(gate, view).scopePredicateById(
      DOC,
      SUBJECT,
      "main",
    );

    expectMetaOnly(readable);
    expect(gate.scopePredicate).not.toHaveBeenCalled();
  });

  it("treats a view that reports the id as purged the same way", async () => {
    const purgedView = {
      get: vi.fn().mockRejectedValue(new DocumentPurgedError(DOC)),
    } as unknown as IDocumentView;
    const gate = readGate();

    const readable = await new SyncScopeGate(
      gate,
      purgedView,
    ).scopePredicateById(DOC, SUBJECT, "main");

    expectMetaOnly(readable);
    expect(gate.scopePredicate).not.toHaveBeenCalled();
  });
});
