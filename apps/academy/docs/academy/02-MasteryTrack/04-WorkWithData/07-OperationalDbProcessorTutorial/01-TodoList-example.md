# Build a Todo-List processor

1. Generate the processor
2. Define your database schema
3. Customize the processor to your needs
4. Test your processor
5. Use the relational database in Frontend and Subgraph


## Generate the Processor

In order to generate the processor you need to run the following command:
```bash
ph generate --processor todo-processor --processor-type relational-db --document-types powerhouse/todolist
```

With that command you create a processor named todo-processor which is of type relational db and listens on changes from documents of type powerhouse/todolist.

## Define your database schema

As next step we need to define the db schema in the `processors/todo-processor/migration.ts` file.

The migration file has a up and a down function which gets called when either the processor was added or when the processor was removed.

Below you can find the example of a todo table.

```ts
import { type IBaseRelationalDb } from "document-drive/processors/types"

export async function up(db: IBaseRelationalDb): Promise<void> {
  // Create table
  await db.schema
    .createTable("todo")
    .addColumn("name", "varchar(255)")
    .addColumn("completed", "boolean")
    .addPrimaryKeyConstraint("todo_pkey", ["name"])
    .ifNotExists()
    .execute();

  const tables = await db.introspection.getTables();
  console.log(tables);
}

export async function down(db: IBaseRelationalDb): Promise<void> {
  // drop table
  await db.schema.dropTable("todo").execute();
}
```

## Generate Types

After defining your db schema its important to generate the types for typescript. This allows to create type safety queries and make use of code completion in your IDE when writing database queries.

Simply execute the following command. 

```bash
ph generate --migration-file processors/todo-indexer/migrations.js --schema-file processors/todo-indexer/schema.ts
```

Afterwards check your `processors/todo-processor/schema.ts` file.
It will contain the types of your database.

## Define the Filter

Checkout the `processors/todo-processor/factory.ts`.

Here you can define how the processor is being instantiated. In thise case it listens on powerhouse/todo-list document changes in the main branch and the global scope.

```ts
export const todoProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveId: string): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = TodoProcessorProcessor.getNamespace(driveId);

    // Create a filter for the processor
    const filter: RelationalDbProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["powerhouse/todo-list"],
      scope: ["global"],
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

## Customize the logic of the processor

When you defined your db schema and the filter when your processor should receive processed operations its time to implement the actual logic.

In the following you'll find an example where we store all the created and udpated todos in a table.

```ts
type DocumentType = ToDoListDocument;

export class TodoIndexerProcessor extends RelationalDbProcessor<DB> {

  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb as IBaseRelationalDb);
  }

  override async onStrands(
    strands: InternalTransmitterUpdate<DocumentType>[],
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      for (const operation of strand.operations) {
        await this.relationalDb
          .insertInto("todo")
          .values({
            task: strand.documentId,
            status: true,
          })
          .execute();
      }
    }
  }

  async onDisconnect() {}
}

```

## Fetch Data through a Subgraph

### Generate Subgraph

Simply generate a new subgraph with:
```bash
ph generate --subgraph <subgraph-name>
```

### Fetch Data from Processor

open ```./subgraphs/<subgraph-name>/index.ts```



define the following:


```ts
resolvers = {
    Query: {
      todoList: {
        resolve: async (parent, args, context, info) => {
          const todoList = await TodoProcessor.query(
              args.driveId ?? "powerhouse", 
              this.relationalDb
          )
            .selectFrom("todo")
            .selectAll()
            .execute();
          return todoList
        },
      },
    },
  };

  typeDefs = gql`
    type Query {
      type Todo {
        name: String!
        completed: Boolean!
      }

      todoList(driveId: String): [Todo!]!
    }
  `;
  ``` 


