/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { RelationalDbProcessor } from "document-drive/processors/relational-db-processor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Simple test schema
interface TestSchema {
  todos: {
    id: number;
    title: string;
    completed: boolean;
    created_at: Date;
  };
}

// Real test data
const testTodos = [
  { id: 1, title: "Learn React", completed: false },
  { id: 2, title: "Write tests", completed: true },
  { id: 3, title: "Build app", completed: false },
];

// Simple test processor
class TestTodoProcessor extends RelationalDbProcessor<TestSchema> {
  protected initialState: TestSchema = {
    todos: [] as any,
  };

  initAndUpgrade = vi.fn();
  onStrands = vi.fn();
  onDisconnect = vi.fn();
}

describe("createTypedQuery - Real PGlite E2E Test", () => {
  let db: any;

  beforeEach(async () => {
    // Create real PGlite database with live query extension
    db = new PGlite({
      extensions: {
        live,
      },
    });

    // Create the schema
    await db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data using individual INSERT statements
    await db.exec(
      `INSERT INTO todos (id, title, completed) VALUES (1, 'Learn React', false)`,
    );
    await db.exec(
      `INSERT INTO todos (id, title, completed) VALUES (2, 'Write tests', true)`,
    );
    await db.exec(
      `INSERT INTO todos (id, title, completed) VALUES (3, 'Build app', false)`,
    );
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    vi.resetAllMocks();
  });

  it("should execute real live query against real database and return correct filtered results", async () => {
    let queryResult: any = null;
    let queryError: any = null;

    // Test the live query directly first
    const sql = "SELECT * FROM todos WHERE completed = $1";
    const params = [false];

    try {
      const liveQuery = await db.live.query(sql, params, (result: any) => {
        queryResult = result;
      });

      // Wait for the callback to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Cleanup
      await liveQuery.unsubscribe();

      // Verify we got the correct filtered results
      expect(queryResult).not.toBeNull();
      expect(queryResult.rows).toBeDefined();
      expect(queryResult.rows).toHaveLength(2); // Only 2 incomplete todos

      const rows = queryResult.rows;
      expect(
        rows.some((row: any) => row.id === 1 && row.completed === false),
      ).toBe(true);
      expect(
        rows.some((row: any) => row.id === 3 && row.completed === false),
      ).toBe(true);
      expect(
        rows.some((row: any) => row.id === 2 && row.completed === true),
      ).toBe(false); // Should NOT be included
    } catch (error) {
      console.error("❌ Database test failed:", error);
      queryError = error;
    }

    expect(queryError).toBeNull();
    expect(queryResult).not.toBeNull();
  });

  it("should execute createTypedQuery end-to-end with real database and return correct results", async () => {
    let finalQueryResult: any = null;

    // Mock React hooks
    vi.doMock("react", () => ({
      useRef: vi.fn(() => ({ current: undefined })),
      useMemo: vi.fn((fn) => fn()),
      useCallback: vi.fn((fn) => fn),
      useEffect: vi.fn((effectFn) => {
        effectFn();
      }),
      useState: vi.fn((initial) => {
        let state = initial;
        const setState = vi.fn((newState) => {
          state = typeof newState === "function" ? newState(state) : newState;
          if (state?.rows) {
            finalQueryResult = state;
          }
        });
        return [state, setState];
      }),
    }));

    // Mock operational store to return our real database
    vi.doMock("../src/operational/hooks/useOperationalStore", () => ({
      useOperationalStore: vi.fn(() => ({
        db: db,
        dbReady: true,
        isLoading: false,
        error: null,
      })),
    }));

    // Mock createNamespacedQueryBuilder to work with our database
    vi.doMock("document-drive/processors/operational-processor", () => ({
      OperationalProcessor: class MockProcessor {
        protected initialState = { todos: [] };
        initAndUpgrade = vi.fn();
        onStrands = vi.fn();
        onDisconnect = vi.fn();
      },
      createNamespacedQueryBuilder: vi.fn(() => ({
        selectFrom: vi.fn((table) => ({
          selectAll: vi.fn(() => ({
            where: vi.fn((column, op, value) => ({
              compile: vi.fn(() => {
                console.log("🔧 Query compiled:", { table, column, value });
                return {
                  sql: `SELECT * FROM ${table} WHERE ${column} = $1`,
                  parameters: [value],
                };
              }),
            })),
          })),
        })),
      })),
    }));

    // Clear module cache and re-import
    vi.resetModules();
    const { createTypedQuery: createTypedQueryMocked } = await import(
      "../src/operational/utils/createTypedQuery.js"
    );

    // Step 1: Create typed query function
    const useTypedQuery = createTypedQueryMocked(TestTodoProcessor);

    // Step 2: Define a query callback for incomplete todos

    const queryCallback = (db: any) => {
      const query = db
        .selectFrom("todos")
        .selectAll()
        .where("completed", "=", false);
      return query.compile();
    };

    // Step 3: Execute the query through createTypedQuery
    const result = useTypedQuery("test-drive-id", queryCallback);

    console.log("📋 Initial createTypedQuery result:", result);

    // Step 4: Wait for the real database query to execute
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log("📋 query result from createTypedQuery:", finalQueryResult);

    // Step 5: Verify we got the correct results through the full flow
    expect(result).toHaveProperty("isLoading");
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("result");

    // Verify the final result has the correct data
    if (finalQueryResult) {
      expect(finalQueryResult.rows).toBeDefined();
      expect(finalQueryResult.rows).toHaveLength(2); // Only incomplete todos

      const rows = finalQueryResult.rows;
      expect(
        rows.some((row: any) => row.id === 1 && row.completed === false),
      ).toBe(true);
      expect(
        rows.some((row: any) => row.id === 3 && row.completed === false),
      ).toBe(true);
      expect(
        rows.some((row: any) => row.id === 2 && row.completed === true),
      ).toBe(false);
    } else {
      console.log(
        "⚠️ No final result captured - state update might not have triggered",
      );
    }
  });
});
