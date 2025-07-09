# Build a Todo-List processor

1. Generate the processor
2. Define your database schema
3. Customize the processor to your needs
4. Test your processor
5. Use the operational store in Frontend and Subgraph


## Generate the Processor

In order to generate the processor you need to run the following command:
```bash
ph generate --processor todo-processor --processor-type operational --document-types powerhouse/todolist
```

## Define your database schema

in the migrations.ts file in your processor directory you can find the up and down methods which are being executed when the processor gets installed or removed. 

```ts
import { type IOperationalStore } from "document-drive/processors/types"

export async function up(db: IOperationalStore): Promise<void> {
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

export async function down(db: IOperationalStore): Promise<void> {
  // drop table
  await db.schema.dropTable("todo").execute();
}
```

when you finished defining your database model you can generate the types for typescript from it with the following command: 

```bash
ph generate --migration-file processors/todo-indexer/migrations.js --schema-file processors/todo-indexer/schema.ts
```


## Customize the processor

the index file contains the processor itsself with the default template:

```ts
import {
  OperationalProcessor,
  type OperationalProcessorFilter,
} from "document-drive/processors/operational-processor";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { up } from "./migrations.js";
import { type DB } from "./schema.js";
import type { ToDoListDocument } from "../../document-models/to-do-list/index.js";

type DocumentType = ToDoListDocument;

export class TodoIndexerProcessor extends OperationalProcessor<DB> {
  get filter(): OperationalProcessorFilter {
    return {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["powerhouse/todolist"],
      scope: ["global"],
    };
  }

  async initAndUpgrade(): Promise<void> {
    await up(this.operationalStore);
  }

  async onStrands(
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
        console.log(">>> ", operation.type);
        await this.operationalStore
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

As you can see you can define with the filter options when the processor is executed. 
In this case the processor is called when an operation on a powerhouse/todolist document was processed.
The operations and the corresponding states will be passed to the onStrands method.

Furthermore the Processor contains an initAndUpgrade function which is called when the processor is being activated. Next to the init there is also an onDisconnect function which is called when the processor is beging removed. The template of the operational database processor contains the up method of the migrations.ts file. 

Finally there is the onStrands method. Here you can update your operational database based upon your needs. 

## test the processor

.... todo

## use the operational database

### subgraph

1. generate subgraph with

```bash
ph generate --subgraph <subgraph-name>
```

open ```./subgraphs/<subgraph-name>/index.ts```

define the following:


```
resolvers = {
    Query: {
      todoList: {
        resolve: async (parent, args, context, info) => {
          const todoList = await this.operationalStore.selectFrom("todo").selectAll().execute();
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

      todoList: [Todo!]!
    }
  `;
  ``` 

  you can simply do sql requests with the provided operationalstore in the class for example
  ```ts
  await this.operationalStore.selectFrom("todo").selectAll().execute();
  ```

  ### useOperationalStore Hook

  ..... 

