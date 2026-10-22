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

describe.each(backends)("findRepeatedOperationIds on %s", (_name, create) => {
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

  it("returns the op ids stored at more than one row of the stream", async () => {
    const documentId = generateId();
    const repeated = content();
    const [once, first] = await append(documentId, [
      { action: content() },
      { action: repeated },
    ]);
    const [again] = await append(documentId, [{ action: repeated, skip: 1 }]);

    expect(again).toBe(first);
    expect(
      await setup.store.findRepeatedOperationIds(documentId, "global", "main", [
        once,
        first,
        "absent",
      ]),
    ).toEqual(new Set([first]));
  });

  it("counts only rows of the same document, scope and branch", async () => {
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
      await setup.store.findRepeatedOperationIds(documentId, "global", "main", [
        opId,
      ]),
    ).toEqual(new Set());
  });

  it("answers past one statement's bind limit", async () => {
    const documentId = generateId();
    const repeated = content();
    const [opId] = await append(documentId, [{ action: repeated }]);
    await append(documentId, [{ action: repeated, skip: 1 }]);
    const queried = [
      ...Array.from({ length: MAX_BIND_PARAMETERS }, () => generateId()),
      opId,
    ];

    expect(
      await setup.store.findRepeatedOperationIds(
        documentId,
        "global",
        "main",
        queried,
      ),
    ).toEqual(new Set([opId]));
  });

  it("returns nothing for no ids", async () => {
    expect(
      await setup.store.findRepeatedOperationIds(
        generateId(),
        "global",
        "main",
        [],
      ),
    ).toEqual(new Set());
  });
});
