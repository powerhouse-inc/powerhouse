import {
  type IRelationalDb,
  type ProcessorFactory,
  type ProcessorRecord,
  RelationalDbProcessor,
  type RelationalDbProcessorFilter,
} from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for Processor Factory Pattern
 * 
 * Tests the factory pattern used to create and register processors with the reactor.
 * This pattern allows dynamic processor creation based on drive configuration.
 */

/**
 * Helper to create a mock drive header for testing
 */
function createMockDriveHeader(driveId: string): PHDocumentHeader {
  return {
    id: driveId,
    documentType: "powerhouse/document-drive",
    revision: 1,
    created: Date.now(),
    lastModified: Date.now(),
  } as PHDocumentHeader;
}

interface TodoDatabase {
  todos: {
    id: string;
    task: string;
    completed: boolean;
  };
}

class TestTodoProcessor extends RelationalDbProcessor<TodoDatabase> {
  async initAndUpgrade(): Promise<void> {
    // Initialization logic
  }

  async onStrands(strands: any[]): Promise<void> {
    // Processing logic
  }

  async onDisconnect(): Promise<void> {
    // Cleanup logic
  }
}

function createMockDb(): IRelationalDb<TodoDatabase> {
  return {
    schema: {
      createTable: vi.fn(() => ({
        addColumn: vi.fn(() => ({
          execute: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    },
    selectFrom: vi.fn(() => ({
      selectAll: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue([]),
      })),
    })),
  } as any;
}

describe("Processor Factory Unit Tests", () => {
  let mockDb: IRelationalDb<TodoDatabase>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Factory Function Creation", () => {
    it("should create a processor factory that returns processor records", () => {
      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        const filter: RelationalDbProcessorFilter = {
          documentType: ["powerhouse/todo-list"],
          branch: null,
          documentId: null,
          scope: null,
        };

        const processor = new TestTodoProcessor(
          "todo-indexer",
          filter,
          mockDb,
        );

        return [
          {
            processor,
            filter,
          },
        ];
      };

      const records = factory(createMockDriveHeader("test-drive-123"));

      expect(records).toHaveLength(1);
      expect(records[0].processor).toBeInstanceOf(TestTodoProcessor);
      expect(records[0].filter).toEqual({
        documentType: ["powerhouse/todo-list"],
        branch: null,
        documentId: null,
        scope: null,
      });
    });

    it("should create multiple processors from a single factory", () => {
      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        const todoFilter: RelationalDbProcessorFilter = {
          documentType: ["powerhouse/todo-list"],
          branch: null,
          documentId: null,
          scope: null,
        };

        const budgetFilter: RelationalDbProcessorFilter = {
          documentType: ["powerhouse/budget-statement"],
          branch: null,
          documentId: null,
          scope: null,
        };

        return [
          {
            processor: new TestTodoProcessor("todo-indexer", todoFilter, mockDb),
            filter: todoFilter,
          },
          {
            processor: new TestTodoProcessor("budget-indexer", budgetFilter, mockDb),
            filter: budgetFilter,
          },
        ];
      };

      const records = factory(createMockDriveHeader("test-drive-123"));

      expect(records).toHaveLength(2);
      expect(records[0].filter.documentType).toContain("powerhouse/todo-list");
      expect(records[1].filter.documentType).toContain("powerhouse/budget-statement");
    });

    it("should pass driveHeader to factory function", () => {
      const factory: ProcessorFactory = vi.fn((driveHeader: PHDocumentHeader) => {
        return [];
      });

      const testDriveId = "drive-abc-123";
      const mockHeader = createMockDriveHeader(testDriveId);
      factory(mockHeader);

      expect(factory).toHaveBeenCalledWith(mockHeader);
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testDriveId,
          documentType: "powerhouse/document-drive",
        })
      );
    });

    it("should allow conditional processor creation based on driveId", () => {
      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        // Only create processor for specific drives
        if (driveHeader.id.startsWith("production-")) {
          const filter: RelationalDbProcessorFilter = {
            documentType: ["powerhouse/todo-list"],
          };

          return [
            {
              processor: new TestTodoProcessor("todo-indexer", filter, mockDb),
              filter,
            },
          ];
        }

        return []; // No processors for non-production drives
      };

      const productionRecords = factory(createMockDriveHeader("production-drive-123"));
      const devRecords = factory(createMockDriveHeader("dev-drive-456"));

      expect(productionRecords).toHaveLength(1);
      expect(devRecords).toHaveLength(0);
    });
  });

  describe("Processor Record Structure", () => {
    it("should create valid processor records with all required fields", () => {
      const filter: RelationalDbProcessorFilter = {
        documentType: ["powerhouse/todo-list"],
      };

      const processor = new TestTodoProcessor("todo-indexer", filter, mockDb);

      const record: ProcessorRecord = {
        processor,
        filter,
      };

      expect(record.processor).toBeInstanceOf(TestTodoProcessor);
      expect(record.filter).toBeDefined();
      expect(record.filter.documentType).toContain("powerhouse/todo-list");
    });

    it("should support complex filters in processor records", () => {
      const complexFilter: RelationalDbProcessorFilter = {
        documentType: ["powerhouse/todo-list", "powerhouse/note"],
        branch: ["main", "develop"],
        scope: ["global", "local"],
        documentId: null,
      };

      const processor = new TestTodoProcessor(
        "multi-doc-processor",
        complexFilter,
        mockDb,
      );

      const record: ProcessorRecord = {
        processor,
        filter: complexFilter,
      };

      expect(record.filter.documentType).toHaveLength(2);
      expect(record.filter.branch).toHaveLength(2);
      expect(record.filter.scope).toHaveLength(2);
    });

    it("should handle empty filter (catch-all processor)", () => {
      const emptyFilter: RelationalDbProcessorFilter = {
        documentType: null,
        branch: null,
        documentId: null,
        scope: null,
      };

      const processor = new TestTodoProcessor(
        "catch-all-processor",
        emptyFilter,
        mockDb,
      );

      const record: ProcessorRecord = {
        processor,
        filter: emptyFilter,
      };

      expect(record.filter).toEqual({
        documentType: null,
        branch: null,
        documentId: null,
        scope: null,
      });
    });
  });

  describe("Factory Registration Pattern", () => {
    it("should simulate factory registration with unique IDs", () => {
      const registeredFactories = new Map<string, ProcessorFactory>();

      const factory1: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        const filter: RelationalDbProcessorFilter = {
          documentType: ["powerhouse/todo-list"],
          branch: null,
          documentId: null,
          scope: null,
        };
        return [
          {
            processor: new TestTodoProcessor("todo-indexer", filter, mockDb),
            filter,
          },
        ];
      };

      const factory2: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        const filter: RelationalDbProcessorFilter = {
          documentType: ["powerhouse/budget-statement"],
        };
        return [
          {
            processor: new TestTodoProcessor("budget-indexer", filter, mockDb),
            filter,
          },
        ];
      };

      registeredFactories.set("todo-factory", factory1);
      registeredFactories.set("budget-factory", factory2);

      expect(registeredFactories.size).toBe(2);
      expect(registeredFactories.has("todo-factory")).toBe(true);
      expect(registeredFactories.has("budget-factory")).toBe(true);
    });

    it("should prevent duplicate factory registration", () => {
      const registeredFactories = new Map<string, ProcessorFactory>();

      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => [];

      registeredFactories.set("test-factory", factory);

      expect(() => {
        if (registeredFactories.has("test-factory")) {
          throw new Error("Factory 'test-factory' is already registered");
        }
        registeredFactories.set("test-factory", factory);
      }).toThrow("Factory 'test-factory' is already registered");
    });

    it("should allow factory unregistration", () => {
      const registeredFactories = new Map<string, ProcessorFactory>();

      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => [];

      registeredFactories.set("test-factory", factory);
      expect(registeredFactories.size).toBe(1);

      registeredFactories.delete("test-factory");
      expect(registeredFactories.size).toBe(0);
    });
  });

  describe("Factory with Database Configuration", () => {
    it("should share database instance across processors from same factory", () => {
      const sharedDb = createMockDb();

      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        return [
          {
            processor: new TestTodoProcessor(
              "processor-1",
              { documentType: ["powerhouse/todo-list"] },
              sharedDb,
            ),
            filter: { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
          },
          {
            processor: new TestTodoProcessor(
              "processor-2",
              { documentType: ["powerhouse/note"] },
              sharedDb,
            ),
            filter: { documentType: ["powerhouse/note"], branch: null, documentId: null, scope: null },
          },
        ];
      };

      const records = factory(createMockDriveHeader("test-drive"));

      const processor1 = records[0].processor as TestTodoProcessor;
      const processor2 = records[1].processor as TestTodoProcessor;

      expect(processor1["relationalDb"]).toBe(sharedDb);
      expect(processor2["relationalDb"]).toBe(sharedDb);
      expect(processor1["relationalDb"]).toBe(processor2["relationalDb"]);
    });

    it("should allow different database instances per factory", () => {
      const db1 = createMockDb();
      const db2 = createMockDb();

      const factory1: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        return [
          {
            processor: new TestTodoProcessor(
              "processor-1",
              { documentType: ["powerhouse/todo-list"] },
              db1,
            ),
            filter: { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
          },
        ];
      };

      const factory2: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        return [
          {
            processor: new TestTodoProcessor(
              "processor-2",
              { documentType: ["powerhouse/todo-list"] },
              db2,
            ),
            filter: { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
          },
        ];
      };

      const records1 = factory1(createMockDriveHeader("drive-1"));
      const records2 = factory2(createMockDriveHeader("drive-2"));

      const processor1 = records1[0].processor as TestTodoProcessor;
      const processor2 = records2[0].processor as TestTodoProcessor;

      expect(processor1["relationalDb"]).not.toBe(processor2["relationalDb"]);
    });
  });

  describe("Factory Error Handling", () => {
    it("should handle factory initialization errors", () => {
      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        if (driveHeader.id === "invalid-drive") {
          throw new Error("Cannot create processor for invalid drive");
        }

        return [
          {
            processor: new TestTodoProcessor(
              "todo-indexer",
              { documentType: ["powerhouse/todo-list"] },
              mockDb,
            ),
            filter: { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
          },
        ];
      };

      expect(() => factory(createMockDriveHeader("valid-drive"))).not.toThrow();
      expect(() => factory(createMockDriveHeader("invalid-drive"))).toThrow(
        "Cannot create processor for invalid drive"
      );
    });

    it("should validate processor creation before returning records", () => {
      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        const filter: RelationalDbProcessorFilter = {
          documentType: ["powerhouse/todo-list"],
          branch: null,
          documentId: null,
          scope: null,
        };

        let processor: TestTodoProcessor;
        try {
          processor = new TestTodoProcessor("todo-indexer", filter, mockDb);
        } catch (error) {
          // Return empty array if processor creation fails
          return [];
        }

        return [{ processor, filter }];
      };

      const records = factory(createMockDriveHeader("test-drive"));
      
      expect(records).toHaveLength(1);
      expect(records[0].processor).toBeInstanceOf(TestTodoProcessor);
    });
  });

  describe("Factory Function Composition", () => {
    it("should compose multiple factory functions", async () => {
      const todoFactory: ProcessorFactory = (driveHeader: PHDocumentHeader) => [
        {
          processor: new TestTodoProcessor(
            "todo-indexer",
            { documentType: ["powerhouse/todo-list"] },
            mockDb,
          ),
          filter: { documentType: ["powerhouse/todo-list"] },
        },
      ];

      const budgetFactory: ProcessorFactory = (driveHeader: PHDocumentHeader) => [
        {
          processor: new TestTodoProcessor(
            "budget-indexer",
            { documentType: ["powerhouse/budget-statement"] },
            mockDb,
          ),
          filter: { documentType: ["powerhouse/budget-statement"] },
        },
      ];

      const composedFactory: ProcessorFactory = async (driveHeader: PHDocumentHeader) => {
        const todo = await Promise.resolve(todoFactory(driveHeader));
        const budget = await Promise.resolve(budgetFactory(driveHeader));
        return [...todo, ...budget];
      };

      const records = await composedFactory(createMockDriveHeader("test-drive"));

      expect(records).toHaveLength(2);
    });

    it("should filter out null processors from factory", () => {
      const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
        const processors: ProcessorRecord[] = [];

        // Conditionally add processors
        if (driveHeader.id.includes("todo")) {
          processors.push({
            processor: new TestTodoProcessor(
              "todo-indexer",
              { documentType: ["powerhouse/todo-list"] },
              mockDb,
            ),
            filter: { documentType: ["powerhouse/todo-list"], branch: null, documentId: null, scope: null },
          });
        }

        if (driveHeader.id.includes("budget")) {
          processors.push({
            processor: new TestTodoProcessor(
              "budget-indexer",
              { documentType: ["powerhouse/budget-statement"] },
              mockDb,
            ),
            filter: { documentType: ["powerhouse/budget-statement"], branch: null, documentId: null, scope: null },
          });
        }

        return processors;
      };

      const todoRecords = factory(createMockDriveHeader("todo-drive"));
      const budgetRecords = factory(createMockDriveHeader("budget-drive"));
      const bothRecords = factory(createMockDriveHeader("todo-budget-drive"));
      const noneRecords = factory(createMockDriveHeader("other-drive"));

      expect(todoRecords).toHaveLength(1);
      expect(budgetRecords).toHaveLength(1);
      expect(bothRecords).toHaveLength(2);
      expect(noneRecords).toHaveLength(0);
    });
  });
});
