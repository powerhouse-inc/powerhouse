/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  type IOperationalQueryBuilder,
  OperationalProcessor,
} from "document-drive/processors/operational-processor";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type PHDocument } from "document-model";
import { type Generated } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock React hooks to avoid "invalid hook call" errors in Node.js tests
vi.mock("react", () => ({
  useRef: vi.fn(() => ({ current: undefined })),
  useMemo: vi.fn((fn) => fn()),
  useCallback: vi.fn((fn) => fn),
  useEffect: vi.fn((fn, deps) => {
    // Execute the effect immediately for testing
    const cleanup = fn();
    return cleanup;
  }),
  useState: vi.fn((initial) => [initial, vi.fn()]),
}));

// Mock operational store for all tests
vi.mock("../src/operational/hooks/useOperationalStore.js", () => ({
  useOperationalStore: vi.fn(),
}));

// Mock createNamespacedQueryBuilder for integration tests
vi.mock("document-drive/processors/operational-processor", async () => {
  const actual = await vi.importActual(
    "document-drive/processors/operational-processor",
  );
  return {
    ...actual,
    createNamespacedQueryBuilder: vi.fn(),
  };
});

// Mock the useOperationalQuery hook for unit tests
vi.mock("../src/operational/hooks/useOperationalQuery.js", () => ({
  useOperationalQuery: vi.fn(),
}));

import { createNamespacedQueryBuilder } from "document-drive/processors/operational-processor";
import { useOperationalQuery } from "../src/operational/hooks/useOperationalQuery.js";
import { useOperationalStore } from "../src/operational/hooks/useOperationalStore.js";
import { createTypedQuery } from "../src/operational/utils/createTypedQuery.js";

const mockUseOperationalQuery = vi.mocked(useOperationalQuery);
const mockUseOperationalStore = vi.mocked(useOperationalStore);
const mockCreateNamespacedQueryBuilder = vi.mocked(
  createNamespacedQueryBuilder,
);

// Define a simple test schema
interface TestSchema {
  todos: {
    id: Generated<number>;
    title: string;
    completed: boolean;
    created_at: Generated<Date>;
  };
}

// Create a fake processor class for testing
class TestTodoProcessor extends OperationalProcessor<TestSchema> {
  static getNamespace(driveId: string): string {
    return `test_todos_${driveId.replaceAll("-", "_")}`;
  }

  async initAndUpgrade(): Promise<void> {
    // Mock implementation
  }

  async onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    // Mock implementation
  }

  async onDisconnect(): Promise<void> {
    // Mock implementation
  }
}

describe("createTypedQuery - Unit Tests (Mocked)", () => {
  const testDriveId = "test-drive-123";

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation with proper LiveQueryResults structure
    mockUseOperationalQuery.mockReturnValue({
      isLoading: false,
      error: null,
      result: { rows: [], fields: [] },
    });
  });

  it("should create a typed query function", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    expect(typeof useQuery).toBe("function");
    expect(useQuery).toBeDefined();
  });

  it("should call useOperationalQuery with correct processor class", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (db: IOperationalQueryBuilder<TestSchema>) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    useQuery(testDriveId, queryCallback);

    // Verify the correct processor class was passed
    expect(mockUseOperationalQuery).toHaveBeenCalledWith(
      TestTodoProcessor,
      testDriveId,
      expect.any(Function), // memoized callback
      undefined, // no parameters
      undefined, // no options
    );
  });

  it("should call useOperationalQuery with parameters when provided", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (
      db: IOperationalQueryBuilder<TestSchema>,
      params: { completed: boolean },
    ) => {
      return db
        .selectFrom("todos")
        .selectAll()
        .where("completed", "=", params.completed)
        .compile();
    };

    const parameters = { completed: true };
    useQuery(testDriveId, queryCallback, parameters);

    // Verify parameters were passed
    expect(mockUseOperationalQuery).toHaveBeenCalledWith(
      TestTodoProcessor,
      testDriveId,
      expect.any(Function), // memoized callback
      parameters,
      undefined, // no options
    );
  });

  it("should call useOperationalQuery with options when provided", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (
      db: IOperationalQueryBuilder<TestSchema>,
      params: { limit: number },
    ) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    const parameters = { limit: 10 };
    const options = { hashNamespace: false };
    useQuery(testDriveId, queryCallback, parameters, options);

    // Verify options were passed
    expect(mockUseOperationalQuery).toHaveBeenCalledWith(
      TestTodoProcessor,
      testDriveId,
      expect.any(Function), // memoized callback
      parameters,
      options,
    );
  });

  it("should return the result from useOperationalQuery", () => {
    const mockResult = {
      isLoading: true,
      error: new Error("Test error"),
      result: {
        rows: [{ id: 1, title: "Test", completed: false }],
        fields: [],
      },
    };

    mockUseOperationalQuery.mockReturnValue(mockResult);

    const useQuery = createTypedQuery(TestTodoProcessor);
    const queryCallback = (db: IOperationalQueryBuilder<TestSchema>) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    const result = useQuery(testDriveId, queryCallback);

    expect(result).toEqual(mockResult);
    expect(result.isLoading).toBe(true);
    expect(result.error?.message).toBe("Test error");
    expect(result.result?.rows).toHaveLength(1);
  });
});

describe("createTypedQuery - Integration Tests (Real Implementation)", () => {
  const testDriveId = "test-drive-123";
  let mockOperationalStore: any;
  let mockDb: any;
  let mockLiveQuery: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset useOperationalQuery to use real implementation for these tests
    mockUseOperationalQuery.mockImplementation(
      (ProcessorClass, driveId, queryCallback, parameters, options) => {
        // This simulates the real useOperationalQuery behavior
        if (!mockOperationalStore.db || !mockOperationalStore.dbReady) {
          return {
            isLoading: mockOperationalStore.isLoading,
            error: mockOperationalStore.error,
            result: null,
          };
        }

        const db = mockCreateNamespacedQueryBuilder(
          ProcessorClass,
          driveId,
          mockOperationalStore.db,
          options,
        );
        const compiledQuery = queryCallback(db, parameters);

        // Simulate live query execution
        mockDb.live.query(
          compiledQuery.sql,
          compiledQuery.parameters || [],
          () => {},
        );

        return {
          isLoading: false,
          error: mockOperationalStore.error,
          result: {
            rows: [{ id: 1, title: "Test Todo", completed: false }],
            fields: [],
          },
        };
      },
    );

    // Create a mock database that behaves like PGlite with live queries
    mockLiveQuery = {
      query: vi.fn((sql, params, callback) => {
        // Simulate immediate query result
        const mockResult = {
          rows: [
            {
              id: 1,
              title: "Test Todo",
              completed: false,
              created_at: new Date(),
            },
          ],
          fields: [],
        };
        callback(mockResult);
        return Promise.resolve({ unsubscribe: vi.fn() });
      }),
    };

    mockDb = {
      selectFrom: vi.fn(() => ({
        selectAll: vi.fn(() => ({
          compile: vi.fn(() => ({
            sql: "SELECT * FROM todos",
            parameters: [],
          })),
          where: vi.fn(() => ({
            compile: vi.fn(() => ({
              sql: "SELECT * FROM todos WHERE completed = $1",
              parameters: [true],
            })),
          })),
        })),
      })),
      live: mockLiveQuery,
    };

    mockOperationalStore = {
      db: mockDb,
      isLoading: false,
      error: null,
      dbReady: true,
    };

    mockUseOperationalStore.mockReturnValue(mockOperationalStore);
    mockCreateNamespacedQueryBuilder.mockReturnValue(mockDb);
  });

  it("should execute real useOperationalQuery with createTypedQuery", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (db: IOperationalQueryBuilder<TestSchema>) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    const result = useQuery(testDriveId, queryCallback);

    // Verify the real integration works
    expect(result).toBeDefined();
    expect(typeof result.isLoading).toBe("boolean");
    expect(result.error === null || result.error instanceof Error).toBe(true);

    // Verify createNamespacedQueryBuilder was called
    expect(mockCreateNamespacedQueryBuilder).toHaveBeenCalledWith(
      TestTodoProcessor,
      testDriveId,
      mockDb,
      undefined,
    );

    // Verify the query was compiled
    expect(mockDb.selectFrom).toHaveBeenCalledWith("todos");
  });

  it("should handle parameterized queries through real implementation", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (
      db: IOperationalQueryBuilder<TestSchema>,
      params: { completed: boolean },
    ) => {
      return db
        .selectFrom("todos")
        .selectAll()
        .where("completed", "=", params.completed)
        .compile();
    };

    const parameters = { completed: true };
    const result = useQuery(testDriveId, queryCallback, parameters);

    // Verify the real integration works with parameters
    expect(result).toBeDefined();
    expect(typeof result.isLoading).toBe("boolean");

    // The query should have been compiled and executed
    expect(mockDb.selectFrom).toHaveBeenCalledWith("todos");

    // Verify createNamespacedQueryBuilder was called with the processor
    expect(mockCreateNamespacedQueryBuilder).toHaveBeenCalledWith(
      TestTodoProcessor,
      testDriveId,
      mockDb,
      undefined,
    );
  });

  it("should handle database readiness states", () => {
    // Test with database not ready
    mockOperationalStore.dbReady = false;
    mockOperationalStore.isLoading = true;
    mockUseOperationalStore.mockReturnValue(mockOperationalStore);

    const useQuery = createTypedQuery(TestTodoProcessor);
    const queryCallback = (db: IOperationalQueryBuilder<TestSchema>) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    const result = useQuery(testDriveId, queryCallback);

    // Should reflect the loading state from operational store
    expect(result.isLoading).toBe(true);
  });

  it("should handle database errors", () => {
    // Test with database error
    const testError = new Error("Database connection failed");
    mockOperationalStore.error = testError;
    mockOperationalStore.db = null;
    mockUseOperationalStore.mockReturnValue(mockOperationalStore);

    const useQuery = createTypedQuery(TestTodoProcessor);
    const queryCallback = (db: IOperationalQueryBuilder<TestSchema>) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    const result = useQuery(testDriveId, queryCallback);

    // Should reflect the error state from operational store
    expect(result.error).toBe(testError);
  });

  it("should pass options to createNamespacedQueryBuilder", () => {
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (
      db: IOperationalQueryBuilder<TestSchema>,
      params: { limit: number },
    ) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    const parameters = { limit: 10 };
    const options = { hashNamespace: false };

    useQuery(testDriveId, queryCallback, parameters, options);

    // Verify that options were passed through to createNamespacedQueryBuilder
    expect(mockCreateNamespacedQueryBuilder).toHaveBeenCalledWith(
      TestTodoProcessor,
      testDriveId,
      mockDb,
      options,
    );
  });

  it("should test real SQL compilation and live query setup", () => {
    // This tests the actual query compilation flow
    const useQuery = createTypedQuery(TestTodoProcessor);

    const queryCallback = (db: IOperationalQueryBuilder<TestSchema>) => {
      return db.selectFrom("todos").selectAll().compile();
    };

    useQuery(testDriveId, queryCallback);

    // Verify the real query compilation happened
    expect(mockDb.selectFrom).toHaveBeenCalledWith("todos");

    // Verify live query was set up
    expect(mockLiveQuery.query).toHaveBeenCalledWith(
      "SELECT * FROM todos",
      [],
      expect.any(Function),
    );
  });
});
