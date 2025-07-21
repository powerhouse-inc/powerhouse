# Using subgraphs

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

- **A schema** — Which defines the GraphQL Queries and Mutations.
- **Resolvers** — Which handle data fetching and logic.
- **Context Fields** — Additional metadata that helps in resolving data efficiently.

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

Let's start by generating a new subgraph. For our tutorial we will create a new subgraph within our To-do List project.   
Open your project and start your terminal.
The Powerhouse toolkit provides a command-line utility to create new subgraphs easily.   

```bash title="Run the following command to generate a new subgraph"
ph generate --subgraph to-do-list
```

```bash title="Expected Output"
Loaded templates: node_modules/@powerhousedao/codegen/dist/codegen/.hygen/templates
       FORCED: ./subgraphs/to-do-list/index.ts
     skipped: ./subgraphs/index.ts
      inject: ./subgraphs/index.ts
```

### What happened?
1. A new subgraph was created in `./subgraphs/to-do-list/`
2. The subgraph was automatically registered in your project's registry
3. Basic boilerplate code was generated with an example query

If we now run `ph reactor` we will see the new subgraph being registered during the startup of the Reactor.
  > Registered /todolist subgraph.

Alternatively, when you are running a local reactor with `ph reactor`, a series of subgraphs will automatically get registered, among those, one for the available document models in your Powerhouse project. 

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

## 2. Building a to-do list subgraph

Now that we've generated our subgraph, let's build a complete To-do List subgraph that extends the functionality of our To-do List document model. This subgraph will provide additional querying capabilities and demonstrate how subgraphs work with document models.

### 2.1 Understanding the to-do list document model

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

### 2.2 Define the subgraph schema

Now let's create a subgraph that provides enhanced querying capabilities for our To-do List documents. 

**Step 1: Define the schema in `subgraphs/to-do-list/schema.ts`:**

```typescript
export const typeDefs = `
  type Query {
    # Dashboard-style summary query - returns high-level metrics
    # Similar to ToDoListStats from document model but optimized for quick queries
    todoList: TodoListSummary
    
    # Filtered list query - lets you get items by completion status
    # More flexible than the basic document model - can filter checked/unchecked
    todoItems(checked: Boolean): [TodoItem!]!
    
    # Count-only query - when you just need numbers, not full data
    # Faster than getting full list when you only need totals for dashboards
    todoItemsCount(checked: Boolean): Int!
  }

  # This mirrors ToDoListStats from the document model
  # But it's a "view" optimized for summary reports and dashboards
  type TodoListSummary {
    total: Int!     # Total number of items
    checked: Int!   # Number of completed items  
    unchecked: Int! # Number of pending items
  }

  # This matches the ToDoItem from the document model
  # Same data structure, but accessed through subgraph queries for filtering
  type TodoItem {
    id: ID!          # Unique identifier
    text: String!    # The task description
    checked: Boolean! # Completion status
  }
`;
```


<details>
<summary> #### Understanding resolvers </summary>

Before diving into the technical implementation, let's understand why these three different query types matter for your product.
Think of resolvers as custom API endpoints that are automatically created based on what your users actually need to know about your data.

 When someone asks your system a question through GraphQL, the resolver:

1. **Understands the request** - "The user wants unchecked items"
2. **Knows where to get the data** - "I need to check the todo_items database table"  
3. **Applies the right filters** - "Only get items where checked = false"
4. **Returns the answer** - "Here are the 5 unchecked items"

**The three resolvers serve different business needs:**

- **`todoList` Resolver - The Dashboard**
  - **Business value**: Perfect for executive dashboards or KPI displays
  - **Use case**: "We have 150 total tasks, 89 completed, 61 pending"
  - **Users**: Executives, managers, anyone needing high-level metrics

- **`todoItems` Resolver - The Detailed List**  
  - **Business value**: Great for operational views where people need to see actual tasks
  - **Use case**: "Show me all pending tasks" or "Show me everything"
  - **Users**: Workers, operators, anyone who needs to act on specific items

- **`todoItemsCount` Resolver - The Counter**
  - **Business value**: Super fast for analytics or when you only need numbers
  - **Use case**: "How many completed tasks do we have?" → "47"
  - **Users**: Analysts, automated systems, performance dashboards

**Why this architecture matters:**
- **Performance**: Count queries are much faster than getting full lists when you only need numbers
- **User Experience**: Different resolvers serve different user needs efficiently
- **Flexibility**: Users can ask for exactly what they need, nothing more, nothing less

</details>

**Step 2: Create resolvers in `subgraphs/to-do-list/resolvers.ts`:**

```typescript
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
  // Define the API endpoint where this subgraph will be accessible
  // Users can query this at: http://localhost:4001/graphql/to-do-list
  path = '/to-do-list';
  
  // GraphQL schema definition (what queries are available)
  typeDefs = typeDefs;
  
  // Query handlers (how to fetch the data)
  resolvers: any;
  
  // Database interface (injected by Powerhouse framework)
  operationalStore: any;
  
  constructor() {
    // Connect the resolvers to this subgraph instance
    // This gives resolvers access to the database through this.operationalStore
    this.resolvers = createResolvers(this);
  }

  // Called once when the subgraph starts up
  async onSetup() {
    await this.createOperationalTables();
  }

  // Create the database tables we need for storing todo items
  async createOperationalTables() {
    await this.operationalStore.schema.createTableIfNotExists(
      "todo_items", // Table name
      (table: any) => {
        table.string("id").primary();           // Unique identifier for each todo item
        table.string("text").notNullable();     // The actual todo task text
        table.boolean("checked").defaultTo(false); // Completion status (unchecked by default)
        table.timestamp("created_at").defaultTo(this.operationalStore.fn.now()); // When item was created
        table.timestamp("updated_at").defaultTo(this.operationalStore.fn.now()); // When item was last modified
      }
    );
  }

  // Event processor: Keeps subgraph data synchronized with document model changes
  // When users add/update/delete todos in Connect, this method handles the updates
  async process(event: any) {
    // Handle new todo item creation
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
    
    // Handle todo item updates (text changes, checking/unchecking)
    if (event.type === "UPDATE_TODO_ITEM") {
      const updateData: any = {
        updated_at: new Date() // Always update the timestamp
      };
      
      // Only update fields that were actually changed
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
    
    // Handle todo item deletion
    if (event.type === "DELETE_TODO_ITEM") {
      await this.operationalStore.delete("todo_items")
        .where("id", event.input.id);
      
      console.log(`Deleted todo item: ${event.input.id}`);
    }
  }
}
```

### 2.3 Understanding the implementation

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

### 2.4 Understanding the document model event integration

Notice that our `index.ts` file already includes a `process` method - this is the **processor integration** that keeps our subgraph synchronized with To-do List document model events. When users interact with To-do List documents through Connect, this method automatically handles the updates.

**How the existing processor integration works:**

The `process` method in our `index.ts` file handles three types of document model events:

**1. Adding new todo items:**
```typescript
if (event.type === "ADD_TODO_ITEM") {
  await this.operationalStore.insert("todo_items", {
    id: event.input.id,
    text: event.input.text,
    checked: false,
    created_at: new Date(),
    updated_at: new Date()
  });
}
```

**2. Updating existing items:**
```typescript
if (event.type === "UPDATE_TODO_ITEM") {
  // Only update fields that were actually changed
  const updateData = { updated_at: new Date() };
  if (event.input.text !== undefined) updateData.text = event.input.text;
  if (event.input.checked !== undefined) updateData.checked = event.input.checked;
  
  await this.operationalStore.update("todo_items")
    .where("id", event.input.id)
    .update(updateData);
}
```

**3. Deleting items:**
```typescript
if (event.type === "DELETE_TODO_ITEM") {
  await this.operationalStore.delete("todo_items")
    .where("id", event.input.id);
}
```

**The integration happens automatically:**
1. **User action**: Someone adds a todo item in Connect
2. **Document model**: Processes the `ADD_TODO_ITEM` operation  
3. **Framework routing**: Powerhouse automatically calls your subgraph's `process` method
4. **Subgraph response**: Your `process` method updates the operational store
5. **Query availability**: Users can now query the updated data via GraphQL

### 2.5 Summary of what we've built

Our complete To-do List subgraph includes:

- **GraphQL schema** (`schema.ts`): Defines `todoList`, `todoItems`, and `todoItemsCount` queries
- **Resolvers** (`resolvers.ts`): Handle data fetching and filtering from the operational store
- **Main subgraph class** (`index.ts`): Coordinates everything and includes:
  - **Operational table creation**: Sets up the `todo_items` table with proper schema
  - **Event processing**: The `process` method keeps subgraph data synchronized with document model changes
  - **Real-time updates**: Automatically handles `ADD_TODO_ITEM`, `UPDATE_TODO_ITEM`, and `DELETE_TODO_ITEM` events

**Key features:**
- **Filtering capability**: The `todoItems` query accepts an optional `checked` parameter
- **Performance optimization**: The `todoItemsCount` query returns just numbers when you don't need full data
- **Real-time synchronization**: Changes in Connect immediately appear in subgraph queries
- **Complete statistics**: The `todoList` query returns total, checked, and unchecked counts

## 3. Testing the to-do list subgraph

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

A supergraph is a GraphQL schema that combines multiple underlying GraphQL APIs, known as subgraphs, into a single, unified graph. This architecture allows different teams to work independently on their respective services (subgraphs) while providing a single entry point for clients or users to query all available data.

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

The Powerhouse supergraph for any given remote drive or reactor can be found under `http://localhost:4001/graphql`. The gateway / supergraph available on `/graphql` combines all the subgraphs, except for the drive subgraph (which is accessible via `/d/:driveId`). To access the endpoint, start the reactor and navigate to the URL with `graphql` appended. The following commands explain how you can test & try the supergraph. 

- Start the reactor:

  ```bash
  ph reactor
  ```

- Open the GraphQL editor in your browser:

  ```
  http://localhost:4001/graphql
  ```

The supergraph allows you to both query & mutate data from the same endpoint. 

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

### Key concepts learned:
- **Subgraphs extend document models** with additional querying and data processing capabilities
- **Operational data stores** provide efficient storage for subgraph data
- **Event processing** enables real-time synchronization between document models and subgraphs
- **The supergraph** unifies multiple subgraphs into a single GraphQL endpoint

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


### Future enhancements

Bridge Processors and Subgraphs — Currently, there's a gap in how processors and subgraphs interact. Powerhouse might improve this in future updates.







