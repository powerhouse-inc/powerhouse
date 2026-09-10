import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  expectedActionHashes,
  generateId,
  hashActionV2,
  SIGNATURE_SCHEME_V2,
} from "@powerhousedao/shared/document-model";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import { createTestOperationStore, testFsBackends } from "../../factories.js";

const DOCUMENT_TYPE = "test/todo";
const SCOPE = "global";
const BRANCH = "main";
const DOCUMENT_ID = "test/todo-1";

/**
 * A CREATE_DOCUMENT-shaped input. The top-level keys are declared in a
 * deliberately non-canonical order (`model` first) so that Postgres' jsonb
 * key normalization reorders them on storage — the exact round-trip that
 * used to break the binding between a signature's action hash and the
 * action it is attached to (#2894).
 */
const roundTripInput = {
  model: "test/todo",
  name: "Test Todo",
  slug: "test-todo",
  meta: {
    name: "todo",
    slug: "todo",
    version: 1,
  },
  branch: BRANCH,
  signing: {
    did: "ph:123",
  },
  version: 1,
  documentId: DOCUMENT_ID,
  protocolVersions: {
    v1: 0,
  },
};

function createRoundTripAction(): Action {
  return {
    id: generateId(),
    scope: SCOPE,
    type: "CREATE_DOCUMENT",
    timestampUtcMs: new Date(1_700_000_000_000).toISOString(),
    input: roundTripInput,
  };
}

/**
 * Writes the action through the real KyselyOperationStore (PGlite-backed)
 * and reads it back. The store stores the action as jsonb and parses the
 * stored text on read, so the returned action's key order is Postgres'
 * normalized order, not the in-memory insertion order.
 */
async function storeAndReadBack(
  store: KyselyOperationStore,
  action: Action,
): Promise<Action> {
  const operation: Operation = {
    id: action.id,
    index: 0,
    timestampUtcMs: action.timestampUtcMs,
    hash: "",
    skip: 0,
    action,
  };
  await store.apply(DOCUMENT_ID, DOCUMENT_TYPE, SCOPE, BRANCH, 0, (txn) => {
    txn.addOperations(operation);
  });
  const paged = await store.getSince(DOCUMENT_ID, SCOPE, BRANCH, -1);
  expect(paged.results).toHaveLength(1);
  return paged.results[0].action;
}

describe.each(testFsBackends)(
  "signature action-hash binding across the KyselyOperationStore [$name]",
  ({ backend }) => {
    let db: Kysely<DatabaseSchema>;
    let store: KyselyOperationStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const setup = await createTestOperationStore(backend);
      db = setup.db;
      store = setup.store;
      cleanup = setup.cleanup;
    });

    afterEach(async () => {
      await db.destroy();
      await cleanup();
    });

    it("jsonb storage normalizes the stored action's key order", async () => {
      const action = createRoundTripAction();
      const stored = await storeAndReadBack(store, action);

      // The content survives the round-trip intact...
      expect(JSON.parse(JSON.stringify(stored))).toEqual(action);
      // ...but the key order changes, which is what defeated
      // insertion-order JSON preimages (#2894).
      expect(JSON.stringify(stored)).not.toEqual(JSON.stringify(action));
    });

    it("a signing-time action hash still matches after the jsonb round-trip", async () => {
      const action = createRoundTripAction();
      const signingHash = await hashActionV2(DOCUMENT_ID, action);

      const stored = await storeAndReadBack(store, action);

      // A verifier that recomputes the expected hashes from the round-tripped
      // action must find the hash the signer produced — in any key order.
      const expected = await expectedActionHashes(
        SIGNATURE_SCHEME_V2,
        DOCUMENT_ID,
        stored,
      );
      expect(expected).toContain(signingHash);
    });

    it("a signature over different content does not match the round-tripped action", async () => {
      const action = createRoundTripAction();
      const stored = await storeAndReadBack(store, action);

      const tampered: Action = {
        ...action,
        input: {
          ...roundTripInput,
          name: "tampered",
        },
      };
      const tamperedHash = await hashActionV2(DOCUMENT_ID, tampered);

      const expected = await expectedActionHashes(
        SIGNATURE_SCHEME_V2,
        DOCUMENT_ID,
        stored,
      );
      expect(expected).not.toContain(tamperedHash);
    });
  },
);
