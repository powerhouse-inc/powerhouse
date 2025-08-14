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



## Example: Implement a search subgraph based on data from the reactor

In this example we implement a subgraph which allows to search through todo-list documents in a specific document drive. 

First we will generate the subgraph with the help of the ph cli, then we will define the GraphQL schema and implement the resolvers and finally we will start the reactor and execute a query through the GraphQL Gateway.

### 1. Generate the subgraph

Let's start by generating a new subgraph. For our tutorial we will create a new subgraph within our To-do List project.   
Open your project and start your terminal.
The Powerhouse toolkit provides a command-line utility to create new subgraphs easily.   

```bash title="Run the following command to generate a new subgraph"
ph generate --subgraph search-todos
```

```bash title="Expected Output"
Loaded templates: /projects/powerhouse/powerhouse/packages/codegen/dist/src/codegen/.hygen/templates
       FORCED: ./subgraphs/search-todos/index.ts
     skipped: ./subgraphs/index.ts
      inject: ./subgraphs/index.ts

Loaded templates: /projects/powerhouse/powerhouse/packages/codegen/dist/src/codegen/.hygen/templates
       FORCED: ./subgraphs/search-todos/resolvers.ts
       FORCED: ./subgraphs/search-todos/schema.ts
```

### What happened?
1. A new subgraph was created in `./subgraphs/search-todos/`
2. The subgraph was automatically registered in your project's registry
3. Basic boilerplate code was generated with an example query

If we now run `ph reactor` we will see the new subgraph being registered during the startup of the Reactor.
  > Registered /graphql/search-todos subgraph.

```
Initializing Subgraph Manager...
> Registered /graphql/auth subgraph.  
> Registered /graphql/system subgraph.
> Registered /graphql/analytics subgraph.
> Registered /d/:drive subgraph.
> Updating router
> Registered /graphql supergraph 
> Registered /graphql/search-todos subgraph. 
> Updating router
> Registered /graphql supergraph 
  ➜  Reactor:   http://localhost:4001/d/powerhouse
```

## 2. Building a to-do list subgraph

Now that we've generated our subgraph its tome to define the GraphQL schema and implement the resolvers.

**Step 1: Define the schema in `subgraphs/search-todos/schema.ts` by creating the file:**

```typescript
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
"""
Subgraph definition
"""

type Query {
    searchTodos(driveId: String!, searchTerm: String!): [String!]!
}

`;

```

**Step 2: Create resolvers in `subgraphs/search-todos/resolvers.ts`:**

```typescript
// subgraphs/search-todos/resolvers.ts
import { type Subgraph } from "@powerhousedao/reactor-api";
import { type ToDoListDocument } from "document-models/to-do-list/index.js";

export const getResolvers = (subgraph: Subgraph) => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      searchTodos: async (parent: unknown, args: { driveId: string, searchTerm: string }) => {
        const documents = await reactor.getDocuments(args.driveId);
        const todoItems: string[] = [];
        for (const docId of documents) {
          const doc: ToDoListDocument = await reactor.getDocument(docId);
          if (doc.header.documentType !== "powerhouse/todo-list") {
            continue;
          }

          const amountEntries = doc.state.global.items.filter(e => e.text.includes(args.searchTerm)).length;
          if (amountEntries > 0) {
            todoItems.push(docId);
          }
        }
        return todoItems;
      },
    },
  };
};

```


## 3. Testing the to-do list subgraph

### 3.1. Start the reactor
To activate the subgraph, run:

```bash
ph reactor
```

You should see the subgraph being registered in the console output:
```
> Registered /graphql/search-todos subgraph.
```

### 3.2. Create some test data
Before testing queries, let's create some To-do List documents with test data:

1. Open Connect at `http://localhost:3001` in another terminal
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

**Query 1: Search for Todos **
```graphql
query {
  searchTodos(driveId: "powerhouse", searchTerm: "test")
}
```


### 3.5. Test real-time updates

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







