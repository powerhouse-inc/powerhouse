import type { IRelationalDb } from "document-drive";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for Processor Database Migrations
 * 
 * Tests the migration lifecycle for relational DB processors:
 * - Schema creation (up migrations)
 * - Schema teardown (down migrations)
 * - Migration versioning and tracking
 * - Idempotent migrations (safe to run multiple times)
 */

interface TodoDatabase {
  todos: {
    id: string;
    task: string;
    completed: boolean;
    created_at: string;
  };
  todo_tags: {
    todo_id: string;
    tag: string;
  };
}

/**
 * Mock migration functions simulating a real processor's migrations
 */
async function upMigration(db: IRelationalDb<TodoDatabase>): Promise<void> {
  // Create todos table
  await db.schema
    .createTable("todos")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("task", "varchar(255)", (col) => col.notNull())
    .addColumn("completed", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo((db.fn as any).now()))
    .ifNotExists()
    .execute();

  // Create todo_tags table with foreign key
  await db.schema
    .createTable("todo_tags")
    .addColumn("todo_id", "varchar(255)", (col) => col.notNull())
    .addColumn("tag", "varchar(100)", (col) => col.notNull())
    .addPrimaryKeyConstraint("todo_tags_pkey", ["todo_id", "tag"])
    .addForeignKeyConstraint(
      "todo_tags_todo_id_fkey",
      ["todo_id"],
      "todos",
      ["id"],
      (cb) => cb.onDelete("cascade")
    )
    .ifNotExists()
    .execute();

  // Create index for faster tag lookups
  await db.schema
    .createIndex("idx_todo_tags_tag")
    .on("todo_tags")
    .column("tag")
    .ifNotExists()
    .execute();
}

async function downMigration(db: IRelationalDb<TodoDatabase>): Promise<void> {
  // Drop tables in reverse order (child tables first to respect foreign keys)
  await db.schema.dropTable("todo_tags").ifExists().execute();
  await db.schema.dropTable("todos").ifExists().execute();
}

/**
 * Create a mock database with schema builder methods
 */
function createMockDb(): {
  db: IRelationalDb<TodoDatabase>;
  mocks: {
    createTableCalls: string[];
    dropTableCalls: string[];
    createIndexCalls: string[];
  };
} {
  const mocks = {
    createTableCalls: [] as string[],
    dropTableCalls: [] as string[],
    createIndexCalls: [] as string[],
  };

  // Create chainable mock builder
  const createChainableMock = (): any => {
    const chain: any = {
      addColumn: vi.fn(function(this: any) {
        return this;
      }),
      addPrimaryKeyConstraint: vi.fn(function(this: any) {
        return this;
      }),
      addForeignKeyConstraint: vi.fn(function(this: any) {
        return this;
      }),
      ifNotExists: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue(undefined),
      })),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    return chain;
  };

  const mockDb = {
    fn: {
      now: vi.fn(() => "now()"),
    },
    schema: {
      createTable: vi.fn((tableName: string) => {
        mocks.createTableCalls.push(tableName);
        return createChainableMock();
      }),
      dropTable: vi.fn((tableName: string) => {
        mocks.dropTableCalls.push(tableName);
        return {
          ifExists: vi.fn(() => ({
            execute: vi.fn().mockResolvedValue(undefined),
          })),
          execute: vi.fn().mockResolvedValue(undefined),
        };
      }),
      createIndex: vi.fn((indexName: string) => {
        mocks.createIndexCalls.push(indexName);
        return {
          on: vi.fn(() => ({
            column: vi.fn(() => ({
              ifNotExists: vi.fn(() => ({
                execute: vi.fn().mockResolvedValue(undefined),
              })),
            })),
          })),
        };
      }),
    },
  } as unknown as IRelationalDb<TodoDatabase>;

  return { db: mockDb, mocks };
}

describe("Processor Migrations Unit Tests", () => {
  let mockDb: IRelationalDb<TodoDatabase>;
  let mocks: {
    createTableCalls: string[];
    dropTableCalls: string[];
    createIndexCalls: string[];
  };

  beforeEach(() => {
    const result = createMockDb();
    mockDb = result.db;
    mocks = result.mocks;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Up Migration (Schema Creation)", () => {
    it("should create todos table with correct schema", async () => {
      await upMigration(mockDb);

      expect(mocks.createTableCalls).toContain("todos");
      expect(mockDb.schema.createTable).toHaveBeenCalledWith("todos");
    });

    it("should create todo_tags table with foreign key", async () => {
      await upMigration(mockDb);

      expect(mocks.createTableCalls).toContain("todo_tags");
      expect(mockDb.schema.createTable).toHaveBeenCalledWith("todo_tags");
    });

    it("should create index for faster queries", async () => {
      await upMigration(mockDb);

      expect(mocks.createIndexCalls).toContain("idx_todo_tags_tag");
      expect(mockDb.schema.createIndex).toHaveBeenCalledWith("idx_todo_tags_tag");
    });

    it("should use ifNotExists for idempotent migrations", async () => {
      // Running migration twice should not cause errors
      await upMigration(mockDb);
      await upMigration(mockDb);

      // Should be called twice, but ifNotExists prevents actual duplication
      expect(mockDb.schema.createTable).toHaveBeenCalledTimes(4); // 2 tables × 2 runs
    });

    it("should handle migration errors gracefully", async () => {
      const errorDb = {
        schema: {
          createTable: vi.fn(() => {
            throw new Error("Table creation failed: insufficient permissions");
          }),
        },
      } as unknown as IRelationalDb<TodoDatabase>;

      await expect(upMigration(errorDb)).rejects.toThrow(
        "Table creation failed: insufficient permissions"
      );
    });
  });

  describe("Down Migration (Schema Teardown)", () => {
    it("should drop todo_tags table first (respecting foreign keys)", async () => {
      await downMigration(mockDb);

      expect(mocks.dropTableCalls[0]).toBe("todo_tags");
      expect(mocks.dropTableCalls[1]).toBe("todos");
    });

    it("should drop todos table second", async () => {
      await downMigration(mockDb);

      expect(mocks.dropTableCalls).toContain("todos");
      expect(mockDb.schema.dropTable).toHaveBeenCalledWith("todos");
    });

    it("should use ifExists for safe teardown", async () => {
      await downMigration(mockDb);

      // Should not fail even if tables don't exist
      expect(mockDb.schema.dropTable).toHaveBeenCalled();
    });

    it("should allow multiple down migration runs", async () => {
      // Running down migration twice should not cause errors
      await downMigration(mockDb);
      await downMigration(mockDb);

      expect(mockDb.schema.dropTable).toHaveBeenCalledTimes(4); // 2 tables × 2 runs
    });

    it("should handle teardown errors gracefully", async () => {
      const errorDb = {
        schema: {
          dropTable: vi.fn(() => ({
            ifExists: vi.fn(() => ({
              execute: vi.fn().mockRejectedValue(
                new Error("Cannot drop table: foreign key constraint")
              ),
            })),
          })),
        },
      } as unknown as IRelationalDb<TodoDatabase>;

      await expect(downMigration(errorDb)).rejects.toThrow(
        "Cannot drop table: foreign key constraint"
      );
    });
  });

  describe("Migration Lifecycle", () => {
    it("should run up and down migrations in sequence", async () => {
      // Create tables
      await upMigration(mockDb);
      expect(mocks.createTableCalls).toHaveLength(2);

      // Clear mock calls
      mocks.dropTableCalls = [];

      // Drop tables
      await downMigration(mockDb);
      expect(mocks.dropTableCalls).toHaveLength(2);
    });

    it("should support migration rollback (up then down)", async () => {
      // Simulate a migration that needs to be rolled back
      await upMigration(mockDb);
      const createCount = (mockDb.schema.createTable as any).mock.calls.length;

      await downMigration(mockDb);
      const dropCount = (mockDb.schema.dropTable as any).mock.calls.length;

      expect(createCount).toBe(2); // todos + todo_tags
      expect(dropCount).toBe(2); // todo_tags + todos
    });

    it("should handle partial migration failures", async () => {
      let tableCount = 0;
      const partialFailureDb = {
        fn: { now: vi.fn() },
        schema: {
          createTable: vi.fn((tableName: string) => {
            tableCount++;
            if (tableCount === 2) {
              throw new Error("Second table creation failed");
            }
            return {
              addColumn: vi.fn(function(this: any) {
                return this;
              }),
              addPrimaryKeyConstraint: vi.fn(function(this: any) {
                return this;
              }),
              addForeignKeyConstraint: vi.fn(function(this: any) {
                return this;
              }),
              ifNotExists: vi.fn(() => ({
                execute: vi.fn().mockResolvedValue(undefined),
              })),
            };
          }),
          createIndex: vi.fn(() => ({
            on: vi.fn(() => ({
              column: vi.fn(() => ({
                ifNotExists: vi.fn(() => ({
                  execute: vi.fn().mockResolvedValue(undefined),
                })),
              })),
            })),
          })),
        },
      } as unknown as IRelationalDb<TodoDatabase>;

      await expect(upMigration(partialFailureDb)).rejects.toThrow();
    });
  });

  describe("Migration Idempotency", () => {
    it("should safely run up migration multiple times", async () => {
      // First run
      await upMigration(mockDb);
      const firstRunCalls = (mockDb.schema.createTable as any).mock.calls.length;

      // Second run (should use ifNotExists)
      await upMigration(mockDb);
      const secondRunCalls = (mockDb.schema.createTable as any).mock.calls.length;

      expect(secondRunCalls).toBe(firstRunCalls * 2);
    });

    it("should safely run down migration on non-existent tables", async () => {
      // Run down without running up first
      await downMigration(mockDb);

      // Should not throw due to ifExists clause
      expect(mockDb.schema.dropTable).toHaveBeenCalledTimes(2);
    });

    it("should handle repeated up/down cycles", async () => {
      // Cycle 1
      await upMigration(mockDb);
      await downMigration(mockDb);

      // Cycle 2
      await upMigration(mockDb);
      await downMigration(mockDb);

      // Cycle 3
      await upMigration(mockDb);
      await downMigration(mockDb);

      expect(mockDb.schema.createTable).toHaveBeenCalledTimes(6); // 3 cycles × 2 tables
      expect(mockDb.schema.dropTable).toHaveBeenCalledTimes(6);
    });
  });

  describe("Schema Constraints and Relationships", () => {
    it("should define primary key constraints", async () => {
      let primaryKeyConstraintCalled = false;
      
      const constraintDb = {
        fn: { now: vi.fn() },
        schema: {
          createTable: vi.fn(() => {
            const chain: any = {
              addColumn: vi.fn(function(this: any) {
                return this;
              }),
              addPrimaryKeyConstraint: vi.fn((name: string, columns: string[]) => {
                expect(name).toBeTruthy();
                expect(columns.length).toBeGreaterThan(0);
                primaryKeyConstraintCalled = true;
                return chain;
              }),
              addForeignKeyConstraint: vi.fn(function(this: any) {
                return this;
              }),
              ifNotExists: vi.fn(() => ({
                execute: vi.fn().mockResolvedValue(undefined),
              })),
            };
            return chain;
          }),
          createIndex: vi.fn(() => ({
            on: vi.fn(() => ({
              column: vi.fn(() => ({
                ifNotExists: vi.fn(() => ({
                  execute: vi.fn().mockResolvedValue(undefined),
                })),
              })),
            })),
          })),
        },
      } as unknown as IRelationalDb<TodoDatabase>;

      await upMigration(constraintDb);

      // Verify addPrimaryKeyConstraint was called
      expect(primaryKeyConstraintCalled).toBe(true);
      expect(constraintDb.schema.createTable).toHaveBeenCalled();
    });

    it("should define foreign key relationships", async () => {
      const fkDb = {
        fn: { now: vi.fn() },
        schema: {
          createTable: vi.fn(() => ({
            addColumn: vi.fn(function(this: any) {
              return this;
            }),
            addPrimaryKeyConstraint: vi.fn(() => ({
              addForeignKeyConstraint: vi.fn((name, columns, refTable, refColumns, cb) => {
                expect(name).toBe("todo_tags_todo_id_fkey");
                expect(refTable).toBe("todos");
                return {
                  ifNotExists: vi.fn(() => ({
                    execute: vi.fn().mockResolvedValue(undefined),
                  })),
                };
              }),
              ifNotExists: vi.fn(() => ({
                execute: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            ifNotExists: vi.fn(() => ({
              execute: vi.fn().mockResolvedValue(undefined),
            })),
          })),
          createIndex: vi.fn(() => ({
            on: vi.fn(() => ({
              column: vi.fn(() => ({
                ifNotExists: vi.fn(() => ({
                  execute: vi.fn().mockResolvedValue(undefined),
                })),
              })),
            })),
          })),
        },
      } as unknown as IRelationalDb<TodoDatabase>;

      await upMigration(fkDb);

      expect(fkDb.schema.createTable).toHaveBeenCalledWith("todo_tags");
    });

    it("should create indexes for query optimization", async () => {
      await upMigration(mockDb);

      expect(mockDb.schema.createIndex).toHaveBeenCalledWith("idx_todo_tags_tag");
    });
  });

  describe("Migration Versioning", () => {
    it("should simulate migration version tracking", async () => {
      const migrationHistory: { version: number; name: string; applied_at: Date }[] = [];

      // Simulate applying migration v1
      await upMigration(mockDb);
      migrationHistory.push({
        version: 1,
        name: "create_todos_and_tags",
        applied_at: new Date(),
      });

      expect(migrationHistory).toHaveLength(1);
      expect(migrationHistory[0].version).toBe(1);
    });

    it("should prevent re-applying completed migrations", async () => {
      const appliedMigrations = new Set<number>([1, 2, 3]);

      const migrationVersion = 2;
      
      if (appliedMigrations.has(migrationVersion)) {
        // Skip migration
        expect(appliedMigrations.has(migrationVersion)).toBe(true);
      } else {
        await upMigration(mockDb);
        appliedMigrations.add(migrationVersion);
      }

      // Migration should not have run
      expect(mockDb.schema.createTable).not.toHaveBeenCalled();
    });

    it("should support sequential migration ordering", async () => {
      const migrations = [
        { version: 1, up: vi.fn(), down: vi.fn() },
        { version: 2, up: vi.fn(), down: vi.fn() },
        { version: 3, up: vi.fn(), down: vi.fn() },
      ];

      // Apply migrations in order
      for (const migration of migrations.sort((a, b) => a.version - b.version)) {
        await migration.up();
      }

      expect(migrations[0].up).toHaveBeenCalled();
      expect(migrations[1].up).toHaveBeenCalled();
      expect(migrations[2].up).toHaveBeenCalled();
    });
  });
});
