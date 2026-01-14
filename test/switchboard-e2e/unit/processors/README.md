# Processor Unit Tests

Unit tests for Powerhouse Relational Database Processors - testing processor initialization, operation processing, factory patterns, and database migrations in isolation.

## Overview

These tests validate the relational DB processor infrastructure without requiring:
- A running reactor instance
- A live database connection
- GraphQL endpoint setup
- E2E test overhead

## Test Files

### 1. `relational-db-processor.test.ts`
**Purpose:** Core processor functionality

**What it tests:**
- ✅ Processor initialization with filters
- ✅ Database access through `getDb()`
- ✅ Operation processing via `onStrands()`
- ✅ Document state transformation into DB records
- ✅ Lifecycle management (`initAndUpgrade`, `onDisconnect`)
- ✅ Error handling for DB operations
- ✅ Filter configuration (document types, branches, scopes)
- ✅ Type safety for database schemas

**Key concepts:**
```typescript
class MyProcessor extends RelationalDbProcessor<MyDatabase> {
  async initAndUpgrade() { /* Create tables */ }
  async onStrands(strands) { /* Process operations */ }
  async onDisconnect() { /* Cleanup */ }
}
```

**Test count:** 22 tests

---

### 2. `processor-factory.test.ts`
**Purpose:** Factory pattern for processor creation

**What it tests:**
- ✅ Factory function creation and registration
- ✅ Dynamic processor instantiation per drive
- ✅ Multiple processors from single factory
- ✅ Conditional processor creation based on drive ID
- ✅ Processor record structure validation
- ✅ Shared vs. isolated database instances
- ✅ Factory composition patterns
- ✅ Error handling during factory initialization

**Key concepts:**
```typescript
const factory: ProcessorFactory = (driveId: string) => {
  return [
    {
      processor: new MyProcessor(namespace, filter, db),
      filter: { documentType: ["powerhouse/my-doc"] },
    },
  ];
};
```

**Test count:** 18 tests

---

### 3. `processor-migrations.test.ts`
**Purpose:** Database schema migrations

**What it tests:**
- ✅ Up migrations (schema creation)
- ✅ Down migrations (schema teardown)
- ✅ Idempotent migrations (`ifNotExists`, `ifExists`)
- ✅ Table creation with constraints
- ✅ Foreign key relationships
- ✅ Index creation for performance
- ✅ Migration ordering (child tables first on drop)
- ✅ Migration versioning and tracking
- ✅ Partial failure handling
- ✅ Repeated up/down cycles

**Key concepts:**
```typescript
export async function up(db: IRelationalDb<any>) {
  await db.schema
    .createTable("todos")
    .addColumn("id", "varchar(255)", col => col.primaryKey())
    .addColumn("task", "varchar(255)")
    .ifNotExists()
    .execute();
}

export async function down(db: IRelationalDb<any>) {
  await db.schema.dropTable("todos").ifExists().execute();
}
```

**Test count:** 20 tests

---

## Running Processor Tests

```bash
# Run all processor unit tests
pnpm test unit/processors/

# Run specific test file
pnpm test unit/processors/relational-db-processor.test.ts
pnpm test unit/processors/processor-factory.test.ts
pnpm test unit/processors/processor-migrations.test.ts

# Watch mode during development
pnpm test:watch unit/processors/

# Run with coverage
pnpm vitest --coverage unit/processors/
```

## Test Statistics

| Test File | Test Count | Focus Area |
|-----------|------------|------------|
| `relational-db-processor.test.ts` | 22 | Core processor logic |
| `processor-factory.test.ts` | 18 | Factory patterns |
| `processor-migrations.test.ts` | 20 | Database migrations |
| **Total** | **60** | **Processor infrastructure** |

## Why These Tests Matter

### 1. **Fast Feedback**
- Run in milliseconds (no reactor startup delay)
- Immediate validation of processor logic
- Rapid iteration during development

### 2. **Isolation**
- Test processor logic independently
- Mock database operations
- No E2E infrastructure required

### 3. **Coverage**
- Validates critical processor workflows
- Tests error scenarios that are hard to reproduce in E2E
- Ensures type safety and correct patterns

### 4. **Documentation**
- Tests serve as usage examples
- Clear patterns for creating processors
- Reference for best practices

## Relationship to E2E Tests

These unit tests **complement** (not replace) E2E tests:

| Aspect | Unit Tests | E2E Tests |
|--------|-----------|-----------|
| **Speed** | Milliseconds | 30+ seconds |
| **Scope** | Single processor | Full system |
| **Database** | Mocked | Real (PGlite) |
| **Reactor** | Not required | Required |
| **Value** | Fast validation | Full integration |

**Development workflow:**
1. ✅ Write unit tests first (TDD)
2. ✅ Validate processor logic in isolation
3. ✅ Run E2E tests for integration
4. ✅ Deploy with confidence

## Common Patterns

### Creating a Test Processor

```typescript
class TestProcessor extends RelationalDbProcessor<TestDatabase> {
  async initAndUpgrade(): Promise<void> {
    const db = await this.getDb();
    await db.schema
      .createTable("test_table")
      .addColumn("id", "varchar(255)", col => col.primaryKey())
      .ifNotExists()
      .execute();
  }

  async onStrands(strands: InternalTransmitterUpdate<any>[]): Promise<void> {
    const db = await this.getDb();
    // Process operations and update database
  }

  async onDisconnect(): Promise<void> {
    // Cleanup resources
  }
}
```

### Mocking the Database

```typescript
function createMockDb(): IRelationalDb<MyDatabase> {
  return {
    schema: {
      createTable: vi.fn(() => ({
        addColumn: vi.fn(() => ({
          ifNotExists: vi.fn(() => ({
            execute: vi.fn().mockResolvedValue(undefined),
          })),
        })),
      })),
    },
    insertInto: vi.fn(() => ({
      values: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as any;
}
```

### Testing Factory Functions

```typescript
it("should create processor from factory", () => {
  const factory: ProcessorFactory = (driveId) => {
    const filter: RelationalDbProcessorFilter = {
      documentType: ["powerhouse/todo-list"],
    };
    
    return [{
      processor: new TestProcessor("test", filter, mockDb),
      filter,
    }];
  };

  const records = factory("test-drive-123");
  expect(records).toHaveLength(1);
});
```

## Adding New Tests

When creating a processor, add tests for:

1. **Initialization** - Does it create tables correctly?
2. **Operation Processing** - Does it handle document operations?
3. **Filtering** - Does it respect document type filters?
4. **Migrations** - Are up/down migrations idempotent?
5. **Error Handling** - Does it gracefully handle failures?
6. **Cleanup** - Does it properly disconnect?

## References

- [Relational DB Processor Spec](../../../../docs/specs/relational-db-processor.md)
- [Academy Tutorial](../../../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/05-RelationalDbProcessor.md)
- [Processor Manager Tests](../../../../packages/reactor/test/processors/processor-manager.test.ts)
- [E2E Processor Tests](../../tests/relational-db-processor.spec.ts)

## Tips

- Use `vi.fn()` for mocking database methods
- Test both success and failure paths
- Validate filter logic with multiple document types
- Ensure migrations are idempotent
- Test lifecycle (init → process → disconnect)
- Mock only what's necessary, keep tests focused
