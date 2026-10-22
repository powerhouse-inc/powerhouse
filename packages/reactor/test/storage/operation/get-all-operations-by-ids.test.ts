import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_BIND_PARAMETERS } from "../../../src/storage/kysely/bind-parameters.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import {
  createTestOperationStore,
  createTestOperationStorePostgres,
} from "../../factories.js";

type Setup = { store: KyselyOperationStore; cleanup: () => Promise<void> };

const backends: [string, () => Promise<Setup>][] = [
  [
    "PGlite",
    async () => {
      const setup = await createTestOperationStore();
      return {
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

describe.each(backends)("getAllOperationsByIds on %s", (_name, create) => {
  let setup: Setup;

  beforeAll(async () => {
    setup = await create();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  function content(id = generateId(), scope = "global"): Action {
    return {
      id,
      type: "SET_NAME",
      scope,
      timestampUtcMs: new Date().toISOString(),
      input: { name: "name" },
    };
  }

  async function append(
    documentId: string,
    rows: { action: Action; skip?: number }[],
    scope = "global",
    branch = "main",
  ): Promise<string[]> {
    const { revision } = await setup.store.getRevisions(documentId, branch);
    const from = revision[scope] ?? 0;
    const operations: Operation[] = rows.map(({ action, skip }, i) => ({
      id: deriveOperationId(documentId, scope, branch, action.id),
      index: from + i,
      skip: skip ?? 0,
      hash: `hash-${from + i}`,
      timestampUtcMs: new Date().toISOString(),
      action,
    }));
    await setup.store.apply(
      documentId,
      documentType,
      scope,
      branch,
      from,
      (txn) => {
        txn.addOperations(...operations);
      },
    );
    return operations.map((operation) => operation.id);
  }

  const shape = (operations: Operation[]) =>
    operations.map((operation) => [operation.id, operation.index]);

  it("returns every row of each op id in index order, rewound rows included", async () => {
    const documentId = generateId();
    const repeated = content();
    const [once, first] = await append(documentId, [
      { action: content() },
      { action: repeated },
      { action: content() },
    ]);
    await append(documentId, [{ action: repeated, skip: 2 }]);

    expect(
      shape(
        await setup.store.getAllOperationsByIds(documentId, "global", "main", [
          first,
          once,
          "absent",
        ]),
      ),
    ).toEqual([
      [once, 0],
      [first, 1],
      [first, 3],
    ]);
  });

  it("returns only rows of the same document, scope and branch", async () => {
    const documentId = generateId();
    const action = content();
    const [opId] = await append(documentId, [{ action }]);
    await append(generateId(), [{ action }]);
    await append(
      documentId,
      [{ action: content(action.id, "local") }],
      "local",
    );
    await append(documentId, [{ action }], "global", "draft");

    expect(
      shape(
        await setup.store.getAllOperationsByIds(documentId, "global", "main", [
          opId,
        ]),
      ),
    ).toEqual([[opId, 0]]);
  });

  it("answers past one statement's bind limit, still in index order", async () => {
    const documentId = generateId();
    const [a, b] = await append(documentId, [
      { action: content() },
      { action: content() },
    ]);
    const queried = [
      b,
      ...Array.from({ length: MAX_BIND_PARAMETERS }, () => generateId()),
      a,
    ];

    expect(
      shape(
        await setup.store.getAllOperationsByIds(
          documentId,
          "global",
          "main",
          queried,
        ),
      ),
    ).toEqual([
      [a, 0],
      [b, 1],
    ]);
  });

  it("returns nothing for no ids", async () => {
    expect(
      await setup.store.getAllOperationsByIds(
        generateId(),
        "global",
        "main",
        [],
      ),
    ).toEqual([]);
  });
});
