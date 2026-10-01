import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  generateId,
  retract,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import {
  createTestOperationStore,
  createTestOperationStorePostgres,
} from "../../factories.js";

type Setup = {
  db: Kysely<Database>;
  store: KyselyOperationStore;
  cleanup: () => Promise<void>;
};

const backends: [string, () => Promise<Setup>][] = [
  [
    "PGlite",
    async () => {
      const setup = await createTestOperationStore();
      return {
        db: setup.db,
        store: setup.store,
        cleanup: async () => {
          await setup.db.destroy();
          await setup.cleanup();
        },
      };
    },
  ],
  ["Postgres", createTestOperationStorePostgres],
];

const documentType = "powerhouse/document-model";
const chunkSize = 32_767 - 3;

describe.each(backends)("findRetractionsOf on %s", (_name, create) => {
  let setup: Setup;
  let store: KyselyOperationStore;

  // Each test writes its own document, so one database serves the file.
  beforeAll(async () => {
    setup = await create();
    store = setup.store;
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  function toOperation(
    documentId: string,
    scope: string,
    branch: string,
    index: number,
    action: Action,
  ): Operation {
    return {
      id: deriveOperationId(documentId, scope, branch, action.id),
      index,
      skip: 0,
      hash: `hash-${index}`,
      timestampUtcMs: new Date().toISOString(),
      action,
    };
  }

  async function append(
    documentId: string,
    actions: Action[],
    scope = "global",
    branch = "main",
    target: KyselyOperationStore = store,
  ): Promise<void> {
    const { revision } = await target.getRevisions(documentId, branch);
    const from = revision[scope] ?? 0;
    await target.apply(documentId, documentType, scope, branch, from, (txn) => {
      txn.addOperations(
        ...actions.map((action, i) =>
          toOperation(documentId, scope, branch, from + i, action),
        ),
      );
    });
  }

  function content(scope = "global"): Action {
    return {
      id: generateId(),
      type: "SET_NAME",
      scope,
      timestampUtcMs: new Date().toISOString(),
      input: { name: "name" },
    };
  }

  it("returns the ids a RETRACT in the stream names", async () => {
    const documentId = generateId();
    const a = content();
    const b = content();
    const c = content();
    await append(documentId, [a, b, c, retract(a.id), retract(c.id)]);

    const found = await store.findRetractionsOf(documentId, "global", "main", [
      a.id,
      b.id,
      c.id,
    ]);

    expect(found).toEqual(new Set([a.id, c.id]));
  });

  it("names a retraction itself when a later RETRACT targets it", async () => {
    const documentId = generateId();
    const a = content();
    const undo = retract(a.id);
    await append(documentId, [a, undo, retract(undo.id)]);

    const found = await store.findRetractionsOf(documentId, "global", "main", [
      a.id,
      undo.id,
    ]);

    expect(found).toEqual(new Set([a.id, undo.id]));
  });

  it("ignores RETRACTs in another document, scope or branch", async () => {
    const documentId = generateId();
    const other = generateId();
    const a = content();
    await append(documentId, [a]);
    await append(other, [retract(a.id)]);
    await append(documentId, [retract(a.id, "local")], "local");
    await append(documentId, [retract(a.id)], "global", "draft");

    const found = await store.findRetractionsOf(documentId, "global", "main", [
      a.id,
    ]);

    expect(found.size).toBe(0);
  });

  it("ignores a row of another type with an input target", async () => {
    const documentId = generateId();
    const a = content();
    const lookalike: Action = {
      id: generateId(),
      type: "SET_TARGET",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: { target: a.id },
    };
    await append(documentId, [a, lookalike]);

    const found = await store.findRetractionsOf(documentId, "global", "main", [
      a.id,
    ]);

    expect(found.size).toBe(0);
  });

  it("returns an id named by two RETRACTs once", async () => {
    const documentId = generateId();
    const a = content();
    await append(documentId, [a, retract(a.id), retract(a.id)]);

    const found = await store.findRetractionsOf(documentId, "global", "main", [
      a.id,
    ]);

    expect([...found]).toEqual([a.id]);
  });

  it("returns an empty set for no ids", async () => {
    const documentId = generateId();
    const a = content();
    await append(documentId, [a, retract(a.id)]);

    const found = await store.findRetractionsOf(
      documentId,
      "global",
      "main",
      [],
    );

    expect(found.size).toBe(0);
  });

  it("finds targets across chunks of a list past the bind limit", async () => {
    const documentId = generateId();
    const ids = Array.from({ length: 70_000 }, () => generateId());
    const named = [0, chunkSize - 1, chunkSize, 2 * chunkSize, 69_999].map(
      (i) => ids[i],
    );
    await append(documentId, [
      content(),
      ...named.map((target) => retract(target)),
    ]);

    const found = await store.findRetractionsOf(
      documentId,
      "global",
      "main",
      ids,
    );

    expect(found).toEqual(new Set(named));
  }, 60_000);

  it("rejects when the signal is aborted", async () => {
    const documentId = generateId();
    const a = content();
    await append(documentId, [a, retract(a.id)]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      store.findRetractionsOf(
        documentId,
        "global",
        "main",
        [a.id],
        controller.signal,
      ),
    ).rejects.toThrow();
  });

  it("reads uncommitted rows inside the transaction", async () => {
    const documentId = generateId();
    const a = content();
    await append(documentId, [a]);

    const found = await setup.db.transaction().execute(async (trx) => {
      const scoped = store.withTransaction(trx);
      await append(documentId, [retract(a.id)], "global", "main", scoped);
      return scoped.findRetractionsOf(documentId, "global", "main", [a.id]);
    });

    expect(found).toEqual(new Set([a.id]));
  });
});
