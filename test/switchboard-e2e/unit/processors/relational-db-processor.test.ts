import {
  type InternalTransmitterUpdate,
  type IRelationalDb,
  RelationalDbProcessor,
  type RelationalDbProcessorFilter,
} from "document-drive";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock Relational DB Processor for testing
 * Simulates a TodoList processor that listens to document operations
 * and transforms them into relational database entries.
 */
class MockTodoProcessor extends RelationalDbProcessor<MockTodoDatabase> {
  public receivedStrands: InternalTransmitterUpdate[] = [];
  public initCalled = false;
  public disconnectCalled = false;

  async initAndUpgrade(): Promise<void> {
    this.initCalled = true;
    
    // Simulate creating a "todos" table
    await this.relationalDb.schema
      .createTable("todos")
      .addColumn("id", "varchar(255)", (col) => col.primaryKey())
      .addColumn("task", "varchar(255)", (col) => col.notNull())
      .addColumn("completed", "boolean", (col) => col.notNull().defaultTo(false))
      .ifNotExists()
      .execute();
  }

  async onStrands(
    strands: InternalTransmitterUpdate[],
  ): Promise<void> {
    this.receivedStrands.push(...strands);
    
    // Simulate processing: extract todo items from document state
    for (const strand of strands) {
      const state = strand.state;
      if (state && typeof state === 'object' && 'todos' in state) {
        const todos = (state as any).todos as Array<{id: string, task: string, completed: boolean}>;
        
        for (const todo of todos) {
          // Upsert todo into database
          await this.relationalDb
            .insertInto("todos")
            .values({
              id: todo.id,
              task: todo.task,
              completed: todo.completed,
            })
            .onConflict((oc) =>
              oc.column("id").doUpdateSet({
                task: todo.task,
                completed: todo.completed,
              })
            )
            .execute();
        }
      }
    }
  }

  async onDisconnect(): Promise<void> {
    this.disconnectCalled = true;
  }

  // Expose database for testing
  public getDatabase() {
    return this.relationalDb;
  }
}

interface MockTodoDatabase {
  todos: {
    id: string;
    task: string;
    completed: boolean;
  };
}

/**
 * Create a mock relational database for testing
 */
function createMockRelationalDb(): IRelationalDb<MockTodoDatabase> {
  const mockDb = {
    schema: {
      createTable: vi.fn(() => ({
        addColumn: vi.fn(() => ({
          addColumn: vi.fn(() => ({
            addColumn: vi.fn(() => ({
              ifNotExists: vi.fn(() => ({
                execute: vi.fn().mockResolvedValue(undefined),
              })),
            })),
          })),
        })),
      })),
      dropTable: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue(undefined),
      })),
    },
    insertInto: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflict: vi.fn(() => ({
          execute: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    })),
    selectFrom: vi.fn(() => ({
      selectAll: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue([]),
      })),
      where: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue([]),
      })),
    })),
    deleteFrom: vi.fn(() => ({
      where: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as unknown as IRelationalDb<MockTodoDatabase>;

  return mockDb;
}

describe("Relational DB Processor Unit Tests", () => {
  let mockDb: IRelationalDb<MockTodoDatabase>;
  let processor: MockTodoProcessor;

  beforeEach(() => {
    mockDb = createMockRelationalDb();
    
    const filter: RelationalDbProcessorFilter = {
      documentType: ["powerhouse/todo-list"],
      branch: null,
      documentId: null,
      scope: null,
    };

    processor = new MockTodoProcessor(
      "test-processor",
      filter,
      mockDb,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Processor Initialization", () => {
    it("should initialize with correct namespace and filter", () => {
      expect(processor).toBeDefined();
      expect(processor["_namespace"]).toBe("test-processor");
      expect(processor["_filter"]).toEqual({
        documentType: ["powerhouse/todo-list"],
        branch: null,
        documentId: null,
        scope: null,
      });
    });

    it("should call initAndUpgrade and create database tables", async () => {
      await processor.initAndUpgrade();
      
      expect(processor.initCalled).toBe(true);
      expect(mockDb.schema.createTable).toHaveBeenCalledWith("todos");
    });

    it("should handle initAndUpgrade errors gracefully", async () => {
      const errorDb = {
        ...mockDb,
        schema: {
          createTable: vi.fn(() => {
            throw new Error("Database connection failed");
          }),
        },
      } as unknown as IRelationalDb<MockTodoDatabase>;

      const errorProcessor = new MockTodoProcessor(
        "error-processor",
        { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
        errorDb,
      );

      await expect(errorProcessor.initAndUpgrade()).rejects.toThrow(
        "Database connection failed"
      );
    });
  });

  describe("Filter Configuration", () => {
    it("should create processor with specific document type filter", () => {
      const specificFilter: RelationalDbProcessorFilter = {
        documentType: ["powerhouse/todo-list"],
        branch: null,
        documentId: null,
        scope: null,
      };

      const specificProcessor = new MockTodoProcessor(
        "specific-processor",
        specificFilter,
        mockDb,
      );

      expect(specificProcessor["_filter"]).toEqual(specificFilter);
    });

    it("should create processor with multiple document types", () => {
    const multiFilter: RelationalDbProcessorFilter = {
      documentType: ["powerhouse/todo-list", "powerhouse/budget-statement"],
      branch: null,
      documentId: null,
      scope: null,
    };

      const multiProcessor = new MockTodoProcessor(
        "multi-processor",
        multiFilter,
        mockDb,
      );

      expect(multiProcessor["_filter"]).toEqual(multiFilter);
    });

    it("should create processor with branch and scope filters", () => {
    const scopedFilter: RelationalDbProcessorFilter = {
      documentType: ["powerhouse/todo-list"],
      branch: ["main"],
      scope: ["production"],
      documentId: null,
    };

      const scopedProcessor = new MockTodoProcessor(
        "scoped-processor",
        scopedFilter,
        mockDb,
      );

      expect(scopedProcessor["_filter"]).toEqual(scopedFilter);
    });
  });

  describe("Operation Processing (onStrands)", () => {
    it("should receive and store document operations", async () => {
      const mockStrand: InternalTransmitterUpdate = {
        driveId: "drive-123",
        documentId: "doc-456",
        documentType: "powerhouse/todo-list",
        scope: "global",
        branch: "main",
        operations: [],
        state: {
          todos: [
            { id: "todo-1", task: "Write tests", completed: false },
            { id: "todo-2", task: "Review PR", completed: true },
          ],
        },
        document: {} as any,
      };

      await processor.onStrands([mockStrand]);

      expect(processor.receivedStrands).toHaveLength(1);
      expect(processor.receivedStrands[0]).toEqual(mockStrand);
    });

    it("should process multiple strands in a single batch", async () => {
      const strands: InternalTransmitterUpdate[] = [
        {
          driveId: "drive-1",
          documentId: "doc-1",
          documentType: "powerhouse/todo-list",
          scope: "global",
          branch: "main",
          operations: [],
          state: {
            todos: [{ id: "todo-1", task: "Task 1", completed: false }],
          },
          document: {} as any,
        },
        {
          driveId: "drive-2",
          documentId: "doc-2",
          documentType: "powerhouse/todo-list",
          scope: "global",
          branch: "main",
          operations: [],
          state: {
            todos: [{ id: "todo-2", task: "Task 2", completed: true }],
          },
          document: {} as any,
        },
      ];

      await processor.onStrands(strands);

      expect(processor.receivedStrands).toHaveLength(2);
      expect(mockDb.insertInto).toHaveBeenCalled();
    });

    it("should handle empty strands array", async () => {
      await processor.onStrands([]);

      expect(processor.receivedStrands).toHaveLength(0);
    });

    it("should handle strands with no todos in state", async () => {
      const emptyStrand: InternalTransmitterUpdate = {
        driveId: "drive-123",
        documentId: "doc-456",
        documentType: "powerhouse/todo-list",
        scope: "global",
        branch: "main",
        operations: [],
        state: {}, // No todos
        document: {} as any,
      };

      await processor.onStrands([emptyStrand]);

      expect(processor.receivedStrands).toHaveLength(1);
      // Should not crash, just skip processing
    });

    it("should transform document state into database records", async () => {
      const strand: InternalTransmitterUpdate = {
        driveId: "drive-123",
        documentId: "doc-456",
        documentType: "powerhouse/todo-list",
        scope: "global",
        branch: "main",
        operations: [],
        state: {
          todos: [
            { id: "todo-1", task: "Write unit tests", completed: false },
          ],
        },
        document: {} as any,
      };

      await processor.onStrands([strand]);

      expect(mockDb.insertInto).toHaveBeenCalledWith("todos");
    });
  });

  describe("Database Access", () => {
    it("should provide access to database through relationalDb", () => {
      const db = processor.getDatabase();
      
      expect(db).toBeDefined();
      expect(db).toBe(mockDb);
    });

    it("should expose schema management methods", () => {
      expect(mockDb.schema).toBeDefined();
      expect(mockDb.schema.createTable).toBeDefined();
      expect(mockDb.schema.dropTable).toBeDefined();
    });

    it("should support query builder operations", () => {
      expect(mockDb.selectFrom).toBeDefined();
      expect(mockDb.insertInto).toBeDefined();
      expect(mockDb.deleteFrom).toBeDefined();
    });
  });

  describe("Lifecycle Management", () => {
    it("should call onDisconnect when processor is shut down", async () => {
      await processor.onDisconnect();
      
      expect(processor.disconnectCalled).toBe(true);
    });

    it("should clean up resources on disconnect", async () => {
      // Simulate some activity
      await processor.initAndUpgrade();
      const strand: InternalTransmitterUpdate = {
        driveId: "drive-123",
        documentId: "doc-456",
        documentType: "powerhouse/todo-list",
        scope: "global",
        branch: "main",
        operations: [],
        state: { todos: [] },
        document: {} as any,
      };
      await processor.onStrands([strand]);
      
      // Then disconnect
      await processor.onDisconnect();
      
      expect(processor.disconnectCalled).toBe(true);
      expect(processor.initCalled).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors during operation processing", async () => {
      const errorDb = {
        ...mockDb,
        insertInto: vi.fn(() => {
          throw new Error("Database write failed");
        }),
      } as unknown as IRelationalDb<MockTodoDatabase>;

      const errorProcessor = new MockTodoProcessor(
        "error-processor",
        { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
        errorDb,
      );

      const strand: InternalTransmitterUpdate = {
        driveId: "drive-123",
        documentId: "doc-456",
        documentType: "powerhouse/todo-list",
        scope: "global",
        branch: "main",
        operations: [],
        state: {
          todos: [{ id: "todo-1", task: "Test", completed: false }],
        },
        document: {} as any,
      };

      await expect(errorProcessor.onStrands([strand])).rejects.toThrow(
        "Database write failed"
      );
    });

    it("should handle null or undefined state gracefully", async () => {
      const nullStrand: InternalTransmitterUpdate = {
        driveId: "drive-123",
        documentId: "doc-456",
        documentType: "powerhouse/todo-list",
        scope: "global",
        branch: "main",
        operations: [],
        state: null,
        document: {} as any,
      };

      // Should not throw
      await expect(processor.onStrands([nullStrand])).resolves.not.toThrow();
    });
  });

  describe("Type Safety", () => {
    it("should enforce database schema types", () => {
      const db = processor.getDatabase();
      
      // This test verifies TypeScript compilation more than runtime behavior
      // The types should prevent incorrect table/column names
      expect(db).toBeDefined();
    });

    it("should type-check filter configuration", () => {
    const typedFilter: RelationalDbProcessorFilter = {
      documentType: ["powerhouse/todo-list"],
      branch: ["main", "develop"],
      scope: ["global"],
      documentId: null,
    };

      const typedProcessor = new MockTodoProcessor(
        "typed-processor",
        typedFilter,
        mockDb,
      );

      expect(typedProcessor["_filter"]).toEqual(typedFilter);
    });
  });
});
