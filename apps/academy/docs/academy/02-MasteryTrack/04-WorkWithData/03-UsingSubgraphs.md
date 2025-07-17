# Using Subgraphs

This tutorial will demonstrate how to create and customize a subgraph using our To-do List project as an example.
Let's start with the basics and gradually add more complex features and functionality.

## What is a subgraph?

A subgraph in Powerhouse is a **GraphQL-based modular data component** that extends the functionality of your document models. While document models handle the core state and operations, subgraphs can:
1. Connect to external APIs or databases
2. Add custom queries and mutations
3. Automate interactions between different document models
4. Provide additional backend functionality

### Subgraphs can retrieve data from

- **The Reactor** – The core Powerhouse data system or network node.   
- **Relational Data Stores** – Structured data storage for operational processes, offering real-time updates, for querying structured data.  
- **Analytics Stores** – Aggregated historical data, useful for insights, reporting and business intelligence.

### Subgraphs consist of

- **A schema** – Which defines the GraphQL Queries and Mutations.
- **Resolvers** – Which handle data fetching and logic.
- **Context Fields** – Additional metadata that helps in resolving data efficiently.

#### Additionally, context fields allow resolvers to access extra information, such as:
- **User authentication** (e.g., checking if a user is an admin).
- **External data sources** (e.g., analytics).



```typescript title="Example of a context field"
context: {
  admin: async (session) => {
    const admins = await operationalStore.get("admins");
    return admins.includes(session.user);
  }
}
```

## 1. How to generate a subgraph

Lets start by generating a new subgraph. For our tutorial we will create a new subgraph within our To-do List project.   
Open your project and start your terminal.
The Powerhouse toolkit provides a command-line utility to create new subgraphs easily.   

```bash title="Run the following command to generate a new subgraph"
ph generate --subgraph <to-do-list-subgraph>
```

```bash title="Expected Output"
Loaded templates: node_modules/@powerhousedao/codegen/dist/codegen/.hygen/templates
       FORCED: ./subgraphs/to-do-list-subgraph/index.ts
     skipped: ./subgraphs/index.ts
      inject: ./subgraphs/index.ts
```

### What happened?
1. A new subgraph was created in `./subgraphs/to-do-list-subgraph/`
2. The subgraph was automatically registered in your project's registry
3. Basic boilerplate code was generated with an example query

If we now run `ph reactor` we will see the new subgraph being registered during the startup of the Reactor.
  > Registered /todolist subgraph.

Alternatively, when you are running a local reactor with `ph reactor` a series of subgraphs will automatically get registered, amongst those one for the available document models in your Powerhouse project. 

```
Initializing Subgraph Manager...
> Registered /graphql/auth subgraph.  
> Registered /graphql/system subgraph.
> Registered /graphql/analytics subgraph.
> Registered /d/:drive subgraph.
> Updating router
> Registered /graphql supergraph 
> Registered /graphql/to-do-list subgraph. 
> Updating router
> Registered /graphql supergraph 
  ➜  Reactor:   http://localhost:4001/d/powerhouse
```

## 2. Building a To-do List Subgraph

Now that we've generated our subgraph, let's build a complete To-do List subgraph that extends the functionality of our To-do List document model. This subgraph will provide additional querying capabilities and demonstrate how subgraphs work with document models.

### 2.1 Understanding the To-do List Document Model

Before building our subgraph, let's recall the structure of our To-do List document model from the [DocumentModelCreation tutorial](/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema):

```graphql
type ToDoListState {
  items: [ToDoItem!]!
  stats: ToDoListStats!
}

type ToDoItem {
  id: ID!
  text: String!
  checked: Boolean!
}

type ToDoListStats {
  total: Int!
  checked: Int!
  unchecked: Int
}
```

The document model has these operations:
- `ADD_TODO_ITEM`: Adds a new to-do item
- `UPDATE_TODO_ITEM`: Updates an existing to-do item
- `DELETE_TODO_ITEM`: Deletes a to-do item

### 2.2 Define the Subgraph Schema

Now let's create a subgraph that provides enhanced querying capabilities for our To-do List documents. 

**Step 1: Define the schema in `subgraphs/to-do-list/schema.ts`:**

```typescript
export const typeDefs = `
  type Query {
    todoList: TodoListSummary
    todoItems(checked: Boolean): [TodoItem!]!
    todoItemsCount(checked: Boolean): Int!
  }

  type TodoListSummary {
    total: Int!
    checked: Int!
    unchecked: Int!
  }

  type TodoItem {
    id: ID!
    text: String!
    checked: Boolean!
  }
`;
```

**Step 2: Create resolvers in `subgraphs/to-do-list/resolvers.ts`:**

```typescript
// subgraphs/to-do-list/resolvers.ts
// subgraphs/to-do-list/resolvers.ts
interface SubgraphInstance {
  operationalStore: any;
}

export const createResolvers = (subgraphInstance: SubgraphInstance) => ({
  Query: {
    todoList: async () => {
      const items = await subgraphInstance.operationalStore.getAll("todo_items");
      const total = items.length;
      const checked = items.filter((item: any) => item.checked).length;
      const unchecked = total - checked;
      
      return {
        total,
        checked,
        unchecked
      };
    },
    
    todoItems: async (parent: any, { checked }: any) => {
      let query = subgraphInstance.operationalStore.select("*").from("todo_items");
      
      if (checked !== undefined) {
        query = query.where("checked", checked);
      }
      
      const items = await query.orderBy("created_at", "asc");
      return items;
    },
    
    todoItemsCount: async (parent: any, { checked }: any) => {
      let query = subgraphInstance.operationalStore.count("* as count").from("todo_items");
      
      if (checked !== undefined) {
        query = query.where("checked", checked);
      }
      
      const result = await query.first();
      return result?.count || 0;
    }
  }
});
```

**Step 3: Implement the main class in `subgraphs/to-do-list/index.ts`:**

```typescript
// subgraphs/to-do-list/index.ts
import { typeDefs } from './schema.js';
import { createResolvers } from './resolvers.js';

export default class ToDoListSubgraph {
  path = '/to-do-list';
  
  typeDefs = typeDefs;
  resolvers: any;
  operationalStore: any;
  
  constructor() {
    this.resolvers = createResolvers(this);
  }

  async onSetup() {
    await this.createOperationalTables();
  }

  async createOperationalTables() {
    await this.operationalStore.schema.createTableIfNotExists(
      "todo_items",
      (table: any) => {
        table.string("id").primary();
        table.string("text").notNullable();
        table.boolean("checked").defaultTo(false);
        table.timestamp("created_at").defaultTo(this.operationalStore.fn.now());
        table.timestamp("updated_at").defaultTo(this.operationalStore.fn.now());
      }
    );
  }

  async process(event: any) {
    // Handle To-do List document operations
    if (event.type === "ADD_TODO_ITEM") {
      await this.operationalStore.insert("todo_items", {
        id: event.input.id,
        text: event.input.text,
        checked: false,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log(`Added todo item: ${event.input.text}`);
    }
    
    if (event.type === "UPDATE_TODO_ITEM") {
      const updateData: any = {
        updated_at: new Date()
      };
      
      // Only update fields that were provided
      if (event.input.text !== undefined) {
        updateData.text = event.input.text;
      }
      if (event.input.checked !== undefined) {
        updateData.checked = event.input.checked;
      }
      
      await this.operationalStore.update("todo_items")
        .where("id", event.input.id)
        .update(updateData);
      
      console.log(`Updated todo item: ${event.input.id}`);
    }
    
    if (event.type === "DELETE_TODO_ITEM") {
      await this.operationalStore.delete("todo_items")
        .where("id", event.input.id);
      
      console.log(`Deleted todo item: ${event.input.id}`);
    }
  }
}
```

**What this schema provides:**
- `todoList`: Returns statistics about all to-do items (total, checked, unchecked counts)
- `todoItems`: Returns a list of to-do items, optionally filtered by checked status
- `todoItemsCount`: Returns just the count of items, optionally filtered by checked status

### 2.3 Understanding the Implementation

**What this multi-file approach provides:**

1. **Schema separation** (`schema.ts`): Clean GraphQL type definitions
2. **Resolver isolation** (`resolvers.ts`): Business logic separated from structure  
3. **Main orchestration** (`index.ts`): Combines everything and handles lifecycle methods

**Key features implemented:**
- A `todo_items` operational table to store individual to-do items
- Fields that match our document model structure
- Timestamps for tracking when items were created and updated
- Resolvers that fetch and filter todo items from the operational store
- Event processing to keep the subgraph data synchronized with document model changes

### 2.4 Connect to Document Model Events (Processor Integration)

To make our subgraph truly useful, we need to connect it to the actual To-do List document model events. This ensures that when users interact with To-do List documents through Connect, the subgraph data stays synchronized.

Add this processor integration to your subgraph:

```typescript
async process(event) {
  // Handle To-do List document operations
  if (event.type === "ADD_TODO_ITEM") {
    await this.operationalStore.insert("todo_items", {
      id: event.input.id,
      text: event.input.text,
      checked: false,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    console.log(`Added todo item: ${event.input.text}`);
  }
  
  if (event.type === "UPDATE_TODO_ITEM") {
    const updateData = {
      updated_at: new Date()
    };
    
    // Only update fields that were provided
    if (event.input.text !== undefined) {
      updateData.text = event.input.text;
    }
    if (event.input.checked !== undefined) {
      updateData.checked = event.input.checked;
    }
    
    await this.operationalStore.update("todo_items")
      .where("id", event.input.id)
      .update(updateData);
    
    console.log(`Updated todo item: ${event.input.id}`);
  }
  
  if (event.type === "DELETE_TODO_ITEM") {
    await this.operationalStore.delete("todo_items")
      .where("id", event.input.id);
    
    console.log(`Deleted todo item: ${event.input.id}`);
  }
}
```

**What this processor does:**
- Listens for document model operations (`ADD_TODO_ITEM`, `UPDATE_TODO_ITEM`, `DELETE_TODO_ITEM`)
- Updates the operational store in real-time when these operations occur
- Provides console logging for debugging
- Maintains data consistency between the document model and the subgraph

### 2.5 Summary of What We've Built

- **Added two main queries**: `todoList` for statistics and `todoItems` for item lists
- **Created an operational table** `todo_items` to store the todo items with proper schema
- **Added resolvers** to fetch and filter todo items from the operational store
- **Implemented event processing** to keep the subgraph data synchronized with document model changes
- **The todoItems query accepts an optional checked parameter** to filter items by their completion status
- **The todoList query returns the full statistics** including total, checked, and unchecked counts

## 3. Testing the To-do List Subgraph

### 3.1. Start the reactor
To activate the subgraph, run:

```bash
ph reactor
```
Or, for full system startup:

```bash title="Start the Reactor & Connect in Studio or Locally"
ph dev 
```

You should see the subgraph being registered in the console output:
```
> Registered /graphql/to-do-list subgraph.
```

### 3.2. Create some test data
Before testing queries, let's create some To-do List documents with test data:

1. Open Connect at `http://localhost:3001`
2. Add the 'remote' drive that is running locally via the (+) 'Add Drive' button. Add 'http://localhost:4001/d/powerhouse'
3. Create a new To-do List document
4. Add some test items:
   - "Learn about subgraphs" (leave unchecked)
   - "Build a To-do List subgraph" (mark as checked)
   - "Test the subgraph" (leave unchecked)

### 3.3. Access GraphQL playground
Open your browser and go to:

```bash
http://localhost:4001/graphql/to-do-list
```

### 3.4. Test the queries

**Query 1: Get To-do List statistics**
```graphql
query {
  todoList {
    total
    checked
    unchecked
  }
}
```

**Query 2: Get all to-do items**
```graphql
query {
  todoItems {
    id
    text
    checked
  }
}
```

**Query 3: Get only unchecked items**
```graphql
query {
  todoItems(checked: false) {
    id
    text
    checked
  }
}
```

**Query 4: Get count of completed items**
```graphql
query {
  todoItemsCount(checked: true)
}
```

### 3.5. Expected responses

**For the statistics query:**
```json
{
  "data": {
    "todoList": {
      "total": 3,
      "checked": 1,
      "unchecked": 2
    }
  }
}
```

**For the items query:**
```json
{
  "data": {
    "todoItems": [
      {
        "id": "item-1",
        "text": "Learn about subgraphs",
        "checked": false
      },
      {
        "id": "item-2",
        "text": "Build a To-do List subgraph",
        "checked": true
      },
      {
        "id": "item-3",
        "text": "Test the subgraph",
        "checked": false
      }
    ]
  }
}
```

### 3.6. Test real-time updates

To verify that your subgraph stays synchronized with document changes:

1. Keep the GraphQL playground open
2. In another tab, open your To-do List document in Connect
3. Add a new item or check/uncheck an existing item
4. Return to the GraphQL playground and re-run your queries
5. You should see the updated data immediately

This demonstrates the real-time synchronization between the document model and the subgraph through event processing.

## 4. Working with the supergraph or gateway

A supergraph is a GraphQL schema that combines multiple underlying GraphQL APIs, known as subgraphs, into a single, unified graph. This architecture allows different teams to work independently on their respective services (subgraphs) while providing a single entry point for clients or users to query all available data

### 4.1 Key concepts

*   **Subgraph:** An independent GraphQL service with its own schema. Each subgraph typically represents a specific domain or microservice within a larger system.
*   **Gateway/Router:** A server that sits in front of the subgraphs. It receives client queries, consults the supergraph schema, and routes parts of the query to the relevant subgraphs. It then stitches the results back together before sending the final response to the client.

### 4.2 Benefits of using a supergraph

*   **Federated Architecture:** Enables a microservices-based approach where different teams can own and operate their services independently.
*   **Scalability:** Individual subgraphs can be scaled independently based on their specific needs.
*   **Improved Developer Experience:** Clients interact with a single, consistent GraphQL API, simplifying data fetching and reducing the need to manage multiple endpoints.
*   **Schema Evolution:** Subgraphs can evolve their schemas independently, and the supergraph can be updated without breaking existing clients, as long as breaking changes are managed carefully.
*   **Clear Separation of Concerns:** Each subgraph focuses on a specific domain, leading to more maintainable and understandable codebases.


### 4.3 Use the Powerhouse supergraph

The Powerhouse supergraph for any given remote drive or reactor can be found under `http://localhost:4001/graphql`. The gateway / supergraph available on `/graphql` combines all the subgraphs, except for the drive subgraph (which is accessible via `/d/:driveId`). To get to the endpoint open your localhost by starting the reactor and adding `graphql` to the end of the url. The following commands explain how you can test & try the supergraph. 

- Start the reactor:

  ```bash
  ph reactor
  ```

- Open the GraphQL editor in your browser:

  ```
  http://localhost:4001/graphql
  ```

The supergraph allows to both query & mutate data from the same endpoint. 

**Example: Using the supergraph with To-do List documents**

1. Create a todo document in the `powerhouse` drive using the `ToDoList_createDocument` mutation:
   ```graphql
   mutation {
     ToDoList_createDocument(
       input: {
         documentId: "my-todo-list"
         name: "My Test To-do List"
       }
     ) {
       id
       name
     }
   }
   ```

2. Add some items to your to-do list using the `ToDoList_addTodoItem` mutation:
   ```graphql
   mutation {
     ToDoList_addTodoItem(
       docId: "my-todo-list"
       input: {
         id: "item-1"
         text: "Learn about supergraphs"
       }
     )
   }
   ```

3. Query the document state using the `GetDocument` query:
   ```graphql
   query {
     ToDoList {
       getDocument(docId: "my-todo-list") {
         id
         name
         state {
           items {
             id
             text
             checked
           }
           stats {
             total
             checked
             unchecked
           }
         }
       }
     }
   }
   ```

4. Now query the same data through your subgraph (which should be included in the supergraph):
   ```graphql
   query {
     todoList {
       total
       checked
       unchecked
     }
     todoItems {
       id
       text
       checked
     }
   }
   ```

This demonstrates how the supergraph provides a unified interface to both your document models and your custom subgraphs, allowing you to query and mutate data from the same endpoint. 

## 5. Summary

Congratulations! You've successfully built a complete To-do List subgraph that demonstrates the power of extending document models with custom GraphQL functionality. Let's recap what you've accomplished:

### What you built:
- **A custom GraphQL schema** that provides enhanced querying capabilities for To-do List documents
- **An operational data store** that efficiently stores and retrieves to-do items
- **Real-time event processing** that keeps your subgraph synchronized with document model changes
- **Advanced query capabilities** including filtering and counting operations
- **Integration with the supergraph** for unified API access

### Key concepts learned:
- **Subgraphs extend document models** with additional querying and data processing capabilities
- **Operational data stores** provide efficient storage for subgraph data
- **Event processing** enables real-time synchronization between document models and subgraphs
- **The supergraph** unifies multiple subgraphs into a single GraphQL endpoint

### Next steps:
- Explore adding **mutations** to your subgraph for more complex operations
- Implement **data aggregation** for analytics and reporting
- Connect to **external APIs** for enhanced functionality
- Build **processors** that automate workflows between different document models

This tutorial has provided you with a solid foundation for building sophisticated data processing and querying capabilities in the Powerhouse ecosystem.

## Subgraphs are particularly useful for

1. **Cross-Document Interactions**: For example, connecting a To-do List with an Invoice document model:
   - When an invoice-related task is marked complete, update the invoice status
   - When an invoice is paid, automatically check off related tasks

2. **External Integrations**: 
   - Sync tasks with external project management tools
   - Connect with notification systems
   - Integrate with analytics platforms

3. **Custom Business Logic**:
   - Implement complex task prioritization
   - Add automated task assignments
   - Create custom reporting functionality

### Prebuilt subgraphs

Some subgraphs (e.g., System Subgraph, Drive Subgraph) already exist.  
To integrate with them, register them via the Reactor API.

### Future enhancements

Bridge Processors and Subgraphs – Currently, there's a gap in how processors and subgraphs interact. Powerhouse might improve this in future updates.







