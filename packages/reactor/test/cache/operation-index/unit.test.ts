import { describe, it, expect, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { OperationIndexEntry } from "../../../src/cache/operation-index-types.js";

function createMockKysely() {
  const mockExecute = vi.fn();
  const mockExecuteTakeFirst = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockWhereRef = vi.fn();
  const mockSelect = vi.fn();
  const mockSelectAll = vi.fn();
  const mockInnerJoin = vi.fn();
  const mockSelectFrom = vi.fn();
  const mockReturning = vi.fn();
  const mockSet = vi.fn();
  const mockUpdateTable = vi.fn();
  const mockDoUpdateSet = vi.fn();

  const chainable = {
    innerJoin: mockInnerJoin,
    selectAll: mockSelectAll,
    select: mockSelect,
    where: mockWhere,
    whereRef: mockWhereRef,
    orderBy: mockOrderBy,
    limit: mockLimit,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    set: mockSet,
  };

  mockSelectFrom.mockReturnValue(chainable);
  mockInnerJoin.mockReturnValue(chainable);
  mockSelectAll.mockReturnValue(chainable);
  mockSelect.mockReturnValue(chainable);
  mockWhere.mockReturnValue(chainable);
  mockWhereRef.mockReturnValue(chainable);
  mockOrderBy.mockReturnValue(chainable);
  mockLimit.mockReturnValue(chainable);
  mockSet.mockReturnValue(chainable);
  mockUpdateTable.mockReturnValue(chainable);

  const mockOnConflict = vi.fn((cb) => {
    const conflictChain = {
      doNothing: vi.fn(() => ({ execute: mockExecute })),
      columns: vi.fn(() => ({
        doUpdateSet: mockDoUpdateSet,
      })),
    };
    if (cb) {
      return cb(conflictChain);
    }
    return conflictChain;
  });

  const mockValues = vi.fn(() => ({
    onConflict: mockOnConflict,
    returning: mockReturning,
    execute: mockExecute,
  }));

  mockReturning.mockReturnValue({ execute: mockExecute });
  mockDoUpdateSet.mockReturnValue({ execute: mockExecute });

  const mockInsertInto = vi.fn(() => ({
    values: mockValues,
    execute: mockExecute,
  }));

  const mockTransactionExecute = vi.fn();
  const mockTransaction = vi.fn(() => ({
    execute: mockTransactionExecute,
  }));

  const db = {
    selectFrom: mockSelectFrom,
    insertInto: mockInsertInto,
    updateTable: mockUpdateTable,
    transaction: mockTransaction,
  } as any;

  return {
    db,
    mocks: {
      selectFrom: mockSelectFrom,
      innerJoin: mockInnerJoin,
      selectAll: mockSelectAll,
      select: mockSelect,
      where: mockWhere,
      whereRef: mockWhereRef,
      orderBy: mockOrderBy,
      limit: mockLimit,
      execute: mockExecute,
      executeTakeFirst: mockExecuteTakeFirst,
      insertInto: mockInsertInto,
      updateTable: mockUpdateTable,
      values: mockValues,
      onConflict: mockOnConflict,
      doUpdateSet: mockDoUpdateSet,
      returning: mockReturning,
      set: mockSet,
      transaction: mockTransaction,
      transactionExecute: mockTransactionExecute,
    },
  };
}

describe("KyselyOperationIndexTxn", () => {
  it("queues collection creation", () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    txn.createCollection("collection.doc-123");

    expect((txn as any).collections).toEqual(["collection.doc-123"]);
  });

  it("queues collection membership", () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    const operation: OperationIndexEntry = {
      documentId: "doc-456",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 0,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
      hash: "hash-001",
      skip: 0,
      action: {
        id: "action-1",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        scope: "document",
      },
      id: "op-1",
    };

    txn.write([operation]);
    txn.addToCollection("collection.doc-123", "doc-456");

    expect((txn as any).collectionMemberships).toEqual([
      {
        collectionId: "collection.doc-123",
        documentId: "doc-456",
        operationIndex: 0,
      },
    ]);
  });

  it("queues operations", () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    const operation: OperationIndexEntry = {
      ordinal: 1,
      documentId: "doc-1",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 0,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
      hash: "hash-001",
      skip: 0,
      action: {
        id: "action-1",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        scope: "document",
      },
      id: "op-1",
    };

    txn.write([operation]);

    expect((txn as any).operations).toEqual([operation]);
  });

  it("accumulates multiple calls", () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    const op1: OperationIndexEntry = {
      documentId: "doc-789",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 0,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
      hash: "hash-001",
      skip: 0,
      action: {
        id: "action-1",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        scope: "document",
      },
      id: "op-1",
    };

    const op2: OperationIndexEntry = {
      documentId: "doc-012",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 1,
      timestampUtcMs: "2021-01-01T00:00:00.001Z",
      hash: "hash-002",
      skip: 0,
      action: {
        id: "action-2",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.001Z",
        scope: "document",
      },
      id: "op-2",
    };

    txn.createCollection("collection.doc-123");
    txn.createCollection("collection.doc-456");
    txn.write([op1]);
    txn.addToCollection("collection.doc-123", "doc-789");
    txn.write([op2]);
    txn.addToCollection("collection.doc-123", "doc-012");

    expect((txn as any).collections).toEqual([
      "collection.doc-123",
      "collection.doc-456",
    ]);
    expect((txn as any).collectionMemberships).toEqual([
      {
        collectionId: "collection.doc-123",
        documentId: "doc-789",
        operationIndex: 0,
      },
      {
        collectionId: "collection.doc-123",
        documentId: "doc-012",
        operationIndex: 1,
      },
    ]);
  });
});

describe("KyselyOperationIndex.start()", () => {
  it("returns new transaction instance", () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const txn1 = index.start();
    const txn2 = index.start();

    expect(txn1).not.toBe(txn2);
  });

  it("each call returns fresh transaction", () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const txn1 = index.start();
    txn1.createCollection("collection.doc-123");

    const txn2 = index.start();
    expect((txn2 as any).collections).toEqual([]);
  });
});

describe("KyselyOperationIndex.commit()", () => {
  it("executes Kysely transaction", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    mocks.transactionExecute.mockImplementation(async (fn) => {
      const mockTrx = {
        insertInto: mocks.insertInto,
      };
      return await fn(mockTrx);
    });

    await index.commit(txn);

    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.transactionExecute).toHaveBeenCalled();
  });

  it("inserts collections with ON CONFLICT DO NOTHING", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    txn.createCollection("collection.doc-123");

    mocks.transactionExecute.mockImplementation(async (fn) => {
      const mockTrx = {
        insertInto: mocks.insertInto,
      };
      return await fn(mockTrx);
    });

    await index.commit(txn);

    expect(mocks.insertInto).toHaveBeenCalledWith("document_collections");
    expect(mocks.values).toHaveBeenCalledWith([
      {
        documentId: "collection.doc-123",
        collectionId: "collection.doc-123",
        joinedOrdinal: BigInt(0),
        leftOrdinal: null,
      },
    ]);
    expect(mocks.onConflict).toHaveBeenCalled();
  });

  it("inserts collection memberships after operations", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    const operation: OperationIndexEntry = {
      documentId: "doc-456",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 0,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
      hash: "hash-001",
      skip: 0,
      action: {
        id: "action-1",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        scope: "document",
      },
      id: "op-1",
    };

    txn.write([operation]);
    txn.addToCollection("collection.doc-123", "doc-456");

    mocks.transactionExecute.mockImplementation(async (fn) => {
      const mockTrx = {
        insertInto: mocks.insertInto,
      };
      mocks.execute.mockResolvedValueOnce([{ ordinal: 1 }]);
      return await fn(mockTrx);
    });

    await index.commit(txn);

    expect(mocks.insertInto).toHaveBeenCalledWith("operation_index_operations");
    expect(mocks.returning).toHaveBeenCalledWith("ordinal");
  });

  it("inserts all operations with returning", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    const operation: OperationIndexEntry = {
      ordinal: 1,
      documentId: "doc-1",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 0,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
      hash: "hash-001",
      skip: 0,
      action: {
        id: "action-1",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        scope: "document",
      },
      id: "op-1",
    };

    txn.write([operation]);

    mocks.transactionExecute.mockImplementation(async (fn) => {
      const mockTrx = {
        insertInto: mocks.insertInto,
      };
      mocks.execute.mockResolvedValueOnce([{ ordinal: 1 }]);
      return await fn(mockTrx);
    });

    await index.commit(txn);

    expect(mocks.insertInto).toHaveBeenCalledWith("operation_index_operations");
    expect(mocks.values).toHaveBeenCalledWith([
      {
        opId: "op-1",
        documentId: "doc-1",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        index: 0,
        skip: 0,
        hash: "hash-001",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
        sourceRemote: "",
      },
    ]);
  });

  it("respects abort signal before transaction starts", async () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    const signal = new AbortController();
    signal.abort();

    await expect(index.commit(txn, signal.signal)).rejects.toThrow(
      "Operation aborted",
    );
  });

  it("handles empty transaction", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    mocks.transactionExecute.mockImplementation(async (fn) => {
      const mockTrx = {
        insertInto: mocks.insertInto,
      };
      return await fn(mockTrx);
    });

    await index.commit(txn);

    expect(mocks.insertInto).not.toHaveBeenCalled();
  });

  it("handles duplicate collection creation idempotently", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const txn = index.start();

    txn.createCollection("collection.doc-123");
    txn.createCollection("collection.doc-123");

    mocks.transactionExecute.mockImplementation(async (fn) => {
      const mockTrx = {
        insertInto: mocks.insertInto,
      };
      return await fn(mockTrx);
    });

    await index.commit(txn);

    expect(mocks.values).toHaveBeenCalledWith([
      {
        documentId: "collection.doc-123",
        collectionId: "collection.doc-123",
        joinedOrdinal: BigInt(0),
        leftOrdinal: null,
      },
      {
        documentId: "collection.doc-123",
        collectionId: "collection.doc-123",
        joinedOrdinal: BigInt(0),
        leftOrdinal: null,
      },
    ]);
  });
});

describe("KyselyOperationIndex.find()", () => {
  it("builds correct JOIN query between tables", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123");

    expect(mocks.selectFrom).toHaveBeenCalledWith(
      "operation_index_operations as oi",
    );
    expect(mocks.innerJoin).toHaveBeenCalledWith(
      "document_collections as dc",
      "oi.documentId",
      "dc.documentId",
    );
  });

  it("filters by collectionId", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123");

    expect(mocks.where).toHaveBeenCalledWith(
      "dc.collectionId",
      "=",
      "collection.doc-123",
    );
  });

  it("applies branch filter from ViewFilter", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123", undefined, { branch: "main" });

    expect(mocks.where).toHaveBeenCalledWith("oi.branch", "=", "main");
  });

  it("applies scopes filter from ViewFilter", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123", undefined, {
      scopes: ["document", "global"],
    });

    expect(mocks.where).toHaveBeenCalledWith("oi.scope", "in", [
      "document",
      "global",
    ]);
  });

  it("handles cursor-based pagination", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123", 10);

    expect(mocks.where).toHaveBeenCalledWith("oi.ordinal", ">", 10);
  });

  it("applies limit correctly", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123", undefined, undefined, {
      cursor: "0",
      limit: 100,
    });

    expect(mocks.limit).toHaveBeenCalledWith(101);
  });

  it("orders by ordinal ASC", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123");

    expect(mocks.orderBy).toHaveBeenCalledWith("oi.ordinal", "asc");
  });

  it("returns hasMore=true when results exceed limit", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const mockRows = [
      {
        ordinal: 1,
        opId: "op-1",
        documentId: "doc-1",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        index: 0,
        skip: 0,
        hash: "hash-001",
        sourceRemote: "",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
      },
      {
        ordinal: 2,
        opId: "op-2",
        documentId: "doc-2",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.001Z",
        index: 0,
        skip: 0,
        hash: "hash-002",
        sourceRemote: "",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
      },
    ];

    mocks.execute.mockResolvedValue(mockRows);

    const result = await index.find(
      "collection.doc-123",
      undefined,
      undefined,
      { cursor: "0", limit: 1 },
    );

    expect(result.nextCursor).toBeDefined();
    expect(result.results).toHaveLength(1);
  });

  it("returns no nextCursor when results within limit", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const mockRows = [
      {
        ordinal: 1,
        opId: "op-1",
        documentId: "doc-1",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        index: 0,
        skip: 0,
        hash: "hash-001",
        sourceRemote: "",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
      },
    ];

    mocks.execute.mockResolvedValue(mockRows);

    const result = await index.find(
      "collection.doc-123",
      undefined,
      undefined,
      { cursor: "0", limit: 10 },
    );

    expect(result.nextCursor).toBeUndefined();
    expect(result.results).toHaveLength(1);
  });

  it("generates correct nextCursor from last item", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const mockRows = [
      {
        ordinal: 1,
        opId: "op-1",
        documentId: "doc-1",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        index: 0,
        skip: 0,
        hash: "hash-001",
        sourceRemote: "",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
      },
      {
        ordinal: 2,
        opId: "op-2",
        documentId: "doc-2",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.001Z",
        index: 0,
        skip: 0,
        hash: "hash-002",
        sourceRemote: "",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
      },
    ];

    mocks.execute.mockResolvedValue(mockRows);

    const result = await index.find(
      "collection.doc-123",
      undefined,
      undefined,
      { cursor: "0", limit: 1 },
    );

    expect(result.nextCursor).toBe("1");
  });

  it("handles empty results", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    const result = await index.find("collection.doc-123");

    expect(result.results).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });

  it("respects abort signal", async () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const signal = new AbortController();
    signal.abort();

    await expect(
      index.find(
        "collection.doc-123",
        undefined,
        undefined,
        undefined,
        signal.signal,
      ),
    ).rejects.toThrow("Operation aborted");
  });

  it("maps database rows to OperationIndexEntry correctly", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    const mockRows = [
      {
        ordinal: 1,
        opId: "op-1",
        documentId: "doc-1",
        documentType: "budget",
        scope: "document",
        branch: "main",
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        index: 0,
        skip: 0,
        hash: "hash-001",
        sourceRemote: "",
        action: {
          id: "action-1",
          type: "CREATE_DOCUMENT",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          scope: "document",
        },
      },
    ];

    mocks.execute.mockResolvedValue(mockRows);

    const result = await index.find("collection.doc-123");

    expect(result.results[0]).toEqual({
      ordinal: 1,
      documentId: "doc-1",
      documentType: "budget",
      branch: "main",
      scope: "document",
      sourceRemote: "",
      index: 0,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
      hash: "hash-001",
      skip: 0,
      action: {
        id: "action-1",
        type: "CREATE_DOCUMENT",
        input: {},
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        scope: "document",
      },
      id: "op-1",
    });
  });

  it("handles missing ViewFilter", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123");

    expect(mocks.where).not.toHaveBeenCalledWith(
      "oi.branch",
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.where).not.toHaveBeenCalledWith(
      "oi.scope",
      expect.anything(),
      expect.anything(),
    );
  });

  it("handles missing PagingOptions", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123");

    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("handles cursor from PagingOptions", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.execute.mockResolvedValue([]);

    await index.find("collection.doc-123", undefined, undefined, {
      cursor: "42",
      limit: 100,
    });

    expect(mocks.where).toHaveBeenCalledWith("oi.ordinal", ">", 42);
  });
});

describe("KyselyOperationIndex.getLatestTimestampForCollection()", () => {
  it("returns latest timestamp for operations in collection", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.executeTakeFirst.mockResolvedValue({
      timestampUtcMs: "2021-01-01T00:00:05.000Z",
    });

    const result =
      await index.getLatestTimestampForCollection("collection.doc-123");

    expect(result).toBe("2021-01-01T00:00:05.000Z");
    expect(mocks.selectFrom).toHaveBeenCalledWith(
      "operation_index_operations as oi",
    );
    expect(mocks.innerJoin).toHaveBeenCalledWith(
      "document_collections as dc",
      "oi.documentId",
      "dc.documentId",
    );
    expect(mocks.orderBy).toHaveBeenCalledWith("oi.ordinal", "desc");
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });

  it("returns null for empty collection", async () => {
    const { db, mocks } = createMockKysely();
    const index = new KyselyOperationIndex(db);

    mocks.executeTakeFirst.mockResolvedValue(undefined);

    const result =
      await index.getLatestTimestampForCollection("collection.doc-123");

    expect(result).toBeNull();
  });

  it("throws when signal is aborted", async () => {
    const { db } = createMockKysely();
    const index = new KyselyOperationIndex(db);
    const controller = new AbortController();
    controller.abort();

    await expect(
      index.getLatestTimestampForCollection(
        "collection.doc-123",
        controller.signal,
      ),
    ).rejects.toThrow("Operation aborted");
  });
});
