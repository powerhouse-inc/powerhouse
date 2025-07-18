# Build a Todo-List Processor

## What You'll Learn

In this tutorial, you'll learn how to build a **relational database processor** that listens to changes in Powerhouse TodoList documents and automatically maintains a synchronized relational database. This is useful for creating queryable data stores, generating reports, or integrating with existing database-driven applications.

## What is a Processor?

A **processor** in Powerhouse is a background service that automatically responds to document changes. Think of it as a "listener" that watches for specific document operations (like creating, updating, or deleting todos) and then performs custom logic - in this case, updating a relational database.

**Key Benefits:**
- **Real-time synchronization**: Your database stays automatically up-to-date with document changes
- **Query performance**: Relational databases excel at complex queries and joins

## Tutorial Steps

1. **Generate the processor** - Create the basic processor structure
2. **Define your database schema** - Design the tables to store your data
3. **Generate TypeScript types** - Get type safety for database operations
4. **Configure the filter** - Specify which documents to listen to
5. **Customize the processor logic** - Implement how document changes update the database
6. **Use the data via Subgraph** - Query your processed data through GraphQL

---

## Step 1: Generate the Processor

First, we'll create the processor using the Powerhouse CLI. This command scaffolds all the necessary files and configuration.

```bash
ph generate --processor todo-processor --processor-type relational-db --document-types powerhouse/todolist
```

**Breaking down this command:**
- `--processor todo-processor`: Names your processor "todo-processor"
- `--processor-type relational-db`: Creates a processor that works with SQL databases
- `--document-types powerhouse/todolist`: Tells the processor to listen for changes in TodoList documents

**What gets created:**
- `processors/todo-processor/` directory with all necessary files
- Migration files for database schema management
- Factory function for processor instantiation
- Base processor class ready for customization

---

## Step 2: Define Your Database Schema

Next, we need to define what our database tables will look like. This happens in the **migration file**, which contains instructions for creating (and optionally destroying) database tables.

**File location:** `processors/todo-processor/migration.ts`

### Understanding Migrations

Migrations are scripts that modify your database structure. They have two functions:
- **`up()`**: Runs when the processor is added - creates tables and indexes
- **`down()`**: Runs when the processor is removed - cleans up by dropping tables

Here's our TodoList migration:

```ts
import { type IBaseRelationalDb } from "document-drive/processors/types"

export async function up(db: IBaseRelationalDb): Promise<void> {
  // Create table
  await db.schema
    .createTable("todo")                          // Table name: "todo"
    .addColumn("name", "varchar(255)")            // Todo item text (up to 255 characters)
    .addColumn("completed", "boolean")            // Completion status (true/false)
    .addPrimaryKeyConstraint("todo_pkey", ["name"]) // Primary key on 'name' column
    .ifNotExists()                               // Only create if table doesn't exist
    .execute();                                  // Execute the SQL command

  // Optional: Log all tables for debugging
  const tables = await db.introspection.getTables();
  console.log(tables);
}

export async function down(db: IBaseRelationalDb): Promise<void> {
  // Clean up: drop the table when processor is removed
  await db.schema.dropTable("todo").execute();
}
```

**Design decisions explained:**
- **`name` as primary key**: Assumes todo names are unique (you might want to use an auto-incrementing ID instead)
- **Simple boolean for completion**: Easy to query for completed vs. incomplete todos
- **`ifNotExists()`**: Prevents errors if the processor restarts

---

## Step 3: Generate TypeScript Types

After defining your database schema, generate TypeScript types for type-safe database operations. This provides IDE autocomplete and catches errors at compile time.

```bash
ph generate --migration-file processors/todo-indexer/migrations.js --schema-file processors/todo-indexer/schema.ts
```

**What this does:**
- Analyzes your migration file
- Generates TypeScript interfaces matching your database tables
- Creates a `schema.ts` file with type definitions

**Result:** You'll get types like:
```ts
interface Todo {
  name: string;
  completed: boolean;
}
```

These types will be available in `processors/todo-processor/schema.ts` and ensure your database queries are type-safe.

---

## Step 4: Configure the Filter

The **filter** determines which document changes your processor should respond to. This is configured in the factory function.

**File location:** `processors/todo-processor/factory.ts`

```ts
export const todoProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveId: string): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = TodoProcessorProcessor.getNamespace(driveId);

    // Create a filter for the processor
    const filter: RelationalDbProcessorFilter = {
      branch: ["main"],                           // Only listen to main branch changes
      documentId: ["*"],                          // Listen to ALL documents (wildcard)
      documentType: ["powerhouse/todo-list"],     // Only TodoList document types
      scope: ["global"],                          // Global scope (vs. user-specific)
    };

    // Create a namespaced store for the processor
    const store = await createNamespacedDb<TodoProcessorProcessor>(
      namespace,
      module.relationalStore,
    );

    // Create the processor
    const processor = new TodoProcessorProcessor(namespace, filter, store);
    return [
      {
        processor,
        filter,
      },
    ];
  };
```

**Filter options explained:**
- **`branch`**: Which document branches to monitor (usually "main" for production data)
- **`documentId`**: Specific document IDs or "*" for all documents
- **`documentType`**: The document model type - must match exactly
- **`scope`**: "global" for shared data, or specific scopes for user/organization data

**Namespace concept**: Each processor gets its own database namespace to avoid conflicts when multiple processors or drives exist.

---

## Step 5: Implement the Processor Logic

Now for the core functionality - how your processor responds to document changes. This is where you define what happens when TodoList documents are created, updated, or deleted.

**File location:** `processors/todo-processor/index.ts`

```ts
type DocumentType = ToDoListDocument;

export class TodoIndexerProcessor extends RelationalDbProcessor<DB> {

  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    // Each drive gets its own database tables to prevent data mixing
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    // Run database migrations when processor starts
    // This creates your tables if they don't exist
    await up(this.relationalDb as IBaseRelationalDb);
  }

  override async onStrands(
    strands: InternalTransmitterUpdate<DocumentType>[],
  ): Promise<void> {
    // Early exit if no data to process
    if (strands.length === 0) {
      return;
    }

    // Process each strand (a strand represents changes to one document)
    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      // Process each operation in the strand
      for (const operation of strand.operations) {
        // Simple example: Insert a new todo for every operation
        // In a real implementation, you'd check the operation type and data
        await this.relationalDb
          .insertInto("todo")
          .values({
            task: strand.documentId,              // Use document ID as task name
            status: true,                         // Default to completed
          })
          .execute();
      }
    }
  }

  async onDisconnect() {
    // Cleanup logic when processor shuts down
    // Could include closing connections, saving state, etc.
  }
}
```

### Understanding Strands and Operations

**Strands** represent a sequence of changes to a single document. Each strand contains:
- `documentId`: Which document changed
- `operations`: Array of operations (add todo, complete todo, etc.)
- `state`: The current document state

**Operations** are the actual changes made to the document:
- `ADD_TODO`: New todo item created
- `TOGGLE_TODO`: Todo completion status changed
- `DELETE_TODO`: Todo item removed

### Improving the Example

The provided example is simplified. In production, you'd want to:

1. **Parse operation types:**
```ts
switch (operation.type) {
  case 'ADD_TODO':
    // Insert new todo
    break;
  case 'CHECK_TODO': 
    // Update completion status
    break;
  case 'DELETE_TODO':
    // Remove todo from database
    break;
}
```

2. **Handle errors gracefully:**
```ts
try {
  await this.relationalDb.insertInto("todo").values(values).execute();
} catch (error) {
  console.error('Failed to insert todo:', error);
  // Could implement retry logic, dead letter queue, etc.
}
```

3. **Use transactions for consistency:**
```ts
await this.relationalDb.transaction().execute(async (trx) => {
  // Multiple operations that should all succeed or all fail
});
```

---

## Step 6: Query Data Through a Subgraph

Once your processor is storing data in the database, you can expose it via GraphQL using a **subgraph**. This creates a clean API for frontend applications to query the processed data.

### Generate a Subgraph

Create a new GraphQL subgraph that can query your processor's database:

```bash
ph generate --subgraph <subgraph-name>
```

**What this creates:**
- GraphQL schema definitions
- Resolver functions that fetch data
- Integration with your processor's database

### Configure the Subgraph

**File location:** `./subgraphs/<subgraph-name>/index.ts`

```ts
resolvers = {
    Query: {
      todoList: {
        resolve: async (parent, args, context, info) => {
          // Query the processor's database using the generated types
          const todoList = await TodoProcessor.query(
              args.driveId ?? "powerhouse",        // Default drive if none specified
              this.relationalDb                    // Database connection from processor
          )
            .selectFrom("todo")                    // FROM todo table
            .selectAll()                           // SELECT * (all columns)
            .execute();                            // Execute and return results
          return todoList
        },
      },
    },
  };

  // GraphQL schema definition
  typeDefs = gql`
    type Query {
      type Todo {
        name: String!                              # Todo text (required)
        completed: Boolean!                        # Completion status (required)
      }

      todoList(driveId: String): [Todo!]!         # Query to get all todos for a drive
    }
  `;
```

### Understanding the GraphQL Integration

**Resolvers** are functions that fetch data for each GraphQL field:
- `parent`: Data from parent resolver (unused here)
- `args`: Arguments passed to the query (like `driveId`)
- `context`: Shared context (database connections, user info, etc.)
- `info`: Metadata about the GraphQL query

**Type Definitions** describe your GraphQL schema:
- `type Todo`: Defines the structure of a todo item
- `todoList(driveId: String): [Todo!]!`: A query that returns an array of todos
- `!` means the field is required/non-null

### Querying Your Data

Once deployed, frontend applications can query your data like this:

```graphql
query GetTodos($driveId: String) {
  todoList(driveId: $driveId) {
    name
    completed
  }
}
```

This would return:
```json
{
  "data": {
    "todoList": [
      {"name": "Buy groceries", "completed": false},
      {"name": "Write tutorial", "completed": true}
    ]
  }
}
```

---

## Next Steps and Best Practices

### Testing Your Processor

1. **Unit tests**: Test individual functions with mock data
2. **Integration tests**: Test the full processor with real document operations

### Production Considerations

1. **Error handling**: Implement robust error handling and logging
2. **Monitoring**: Add metrics to track processor performance
3. **Scaling**: Consider database indexing and query optimization
4. **Security**: Validate input data and implement proper access controls

This processor tutorial demonstrates the power of Powerhouse's event-driven architecture, where document changes automatically flow through to specialized data stores optimized for different use cases.


