# Working with Subgraphs

This tutorial will demonstrate how to create and customize a subgraph using our ToDoList project as an example.
Let's start with the basics and gradually add more complex features and functionality.

## What is a Subgraph?

A subgraph in Powerhouse is a **GraphQL-based modular data component** that extends the functionality of your document models. While document models handle the core state and operations, subgraphs can:
1. Connect to external APIs or databases
2. Add custom queries and mutations
3. Automate interactions between different document models
4. Provide additional backend functionality

### Subgraphs can retrieve data from:

- **The Reactor** – The core Powerhouse data system or network node.   
- **Operational Data Stores** – Structured data storage for operational processes, offering real-time updates, for querying structured data.  
- **Analytics Stores** – Aggregated historical data, useful for insights, reporting and business intelligence.

### Subgraphs consist of:

- **A schema** – Which defines the GraphQL Queries and Mutations.
- **Resolvers** – Which handle data fetching and logic.
- **Context Fields** – Additional metadata that helps in resolving data efficiently.

#### Additionaly, context fields allow resolvers to access extra information, such as:
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

## 1. How to generate a subgraph?

Lets start by generating a new subgraph. For our tutorial we will create a new subgraph within our ToDoList project.   
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

### What Happened?
1. A new subgraph was created in `./subgraphs/to-do-list-subgraph/`
2. The subgraph was automatically registered in your project's registry
3. Basic boilerplate code was generated with an example query

If we now run 'phreactor' we will see the new subgraph being registered during the startup of the Reactor.
  > Registered /todolist subgraph.

## 2. Customizing your subgraph with a schema

Now that we've generated our subgraph, let's open it and define the schema inside the `index.ts` file.

### 2.1 Define the Schema

Here we define the schema (typeDefs) which defines the structure of your queries and mutations.
For educational purposes we will define a simple query that mimics the functionality of the todoList interface (or editor): 
- Returns the total number of todo's
- The number of todo's that are checked
- The number of todo's that are not checked



```graphql
type Query {
  fileIds: [String]
}
```

### What Happened?

- Added two queries: todoList and todoItems
- Created an operational table todo_items to store the todo items
- Added resolvers to fetch and filter todo items
- Removed the example code
- The todoItems query accepts an optional checked parameter to filter items by their status
- The todoList query returns the full list with its statistics


### 2.2 Implement the Resolver for the subgraph's schema
Resolvers define how data is retrieved or modified.
If you query for a specific value you can retrieve the value from either the reactor itself or an operational datastore.    
We'll look into this in more detail in the next section.

```js
resolvers: {
  Query: {
    fileIds: async () => {
      return ["file1", "file2", "file3"];
    }
  }
}
```

### 2.3 Add Operational Data Storage (Optional)
If you need to persist data, initialize an operational datastore inside onSetup():

```typescript title="Adding an operational datastore"
async onSetup() {
  await this.createOperationalTables();
}

async createOperationalTables() {
  await this.operationalStore.schema.createTableIfNotExists(
    "fileIds",
    (table) => {
      table.string("id").primary();
    }
  );
}
```

### 2.4 Fetching from an Operational Store
If your subgraph interacts with an Operational Data Store, modify the resolver:

```typescript title="Example of a resolver that fetches data from an operational store"
resolvers: {
  Query: {
    fileIds: async (_, __, { operationalStore }) => {
      return await operationalStore.getAll("fileIds");
    }
  }
}
```

### 2.5 Connecting to a Processor (Optional, but Recommended)

#### Why Connect a Processor?
Subgraphs alone are limited. A subgraph only queries data, but doesn't generate or store it.
To make subgraphs useful, connect them with processors that update the data dynamically.
**A processor listens to system events and updates the operational store in real-time.**

Making use of a processor allows for:
- **Live updates** instead of static data.
- **Scalable architecture** through event-driven data changes.
- **Seamless integration** with other Powerhouse components.

Inside your processor, you can listen for new files, which in turn update the datastore:

```typescript title="Example: Creating a Simple Processor"
async process(event) {
  if (event.type === "ADD_FILE") {
    await this.operationalStore.insert("fileIds", { id: event.fileId });
  }
}
```

Then, modify your subgraph resolver to return real-time data:

```js
resolvers: {
  Query: {
    fileIds: async (_, __, { operationalStore }) => {
      return await operationalStore.getAll("fileIds");
    }
  }
}
```

## 3. Testing the Subgraph

### 3.1. Start the Reactor
To activate the subgraph, run:

```bash
ph reactor
```
Or, for full system startup:

```bash title="Start the Reactor & Connect in Studio or Locally
ph dev 
```

### 3.2. Access GraphQL Playground
Open your browser and go to:

```bash
http://localhost:4001/<subgraph-name>
```
Example:

```bash
http://localhost:4001/test-subgraph
```

### 3.3. Run a Query

```graphql
query {
  fileIds
}
```

### 3.4. Expected Response
If everything works, you should see:

```json
{
  "data": {
    "fileIds": ["file1", "file2", "file3"]
  }
}
```

## 4. Working with the Supergraph or Gateway

A supergraph is a GraphQL schema that combines multiple underlying GraphQL APIs, known as subgraphs, into a single, unified graph. This architecture allows different teams to work independently on their respective services (subgraphs) while providing a single entry point for clients or users to query all available data

### 4.1 Key Concepts

*   **Subgraph:** An independent GraphQL service with its own schema. Each subgraph typically represents a specific domain or microservice within a larger system.
*   **Gateway/Router:** A server that sits in front of the subgraphs. It receives client queries, consults the supergraph schema, and routes parts of the query to the relevant subgraphs. It then stitches the results back together before sending the final response to the client.

### 4.2 Benefits of Using a Supergraph

*   **Federated Architecture:** Enables a microservices-based approach where different teams can own and operate their services independently.
*   **Scalability:** Individual subgraphs can be scaled independently based on their specific needs.
*   **Improved Developer Experience:** Clients interact with a single, consistent GraphQL API, simplifying data fetching and reducing the need to manage multiple endpoints.
*   **Schema Evolution:** Subgraphs can evolve their schemas independently, and the supergraph can be updated without breaking existing clients, as long as breaking changes are managed carefully.
*   **Clear Separation of Concerns:** Each subgraph focuses on a specific domain, leading to more maintainable and understandable codebases.


### 4.3 Use the Powerhouse Supergraph

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

- Create a todo document in the `powerhouse` drive using the `ToDo_createDocument` mutation.
  ![ToDo_createDocument](https://i.ibb.co/GQTZr7Wk/Screenshot-2025-05-01-at-1-22-23-PM.png)

- Get the document state using the `GetDocument` query.
  ![GetDocument](https://i.ibb.co/v47cj4Q4/Screenshot-2025-05-01-at-1-22-41-PM.png)

- In a different terminal, start connect:

  ```bash
  ph connect
  ```

- Open Connect and add the `powerhouse` drive:

  ```
  http://localhost:4001/d/powerhouse
  ```

- You should now see the todo document you've created earlier. Edit the todo document with the document editor and add a few tasks that you can query later. 

- Go back to the GraphQL explorer and use the `GetDocument` query again — you should see the updated state.

This is a quick example of how the supegraph can be used. 


## Subgraphs are particularly useful for:

1. **Cross-Document Interactions**: For example, connecting a ToDoList with an Invoice document model:
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

### Future Enhancements

Bridge Processors and Subgraphs – Currently, there's a gap in how processors and subgraphs interact. Powerhouse might improve this in future updates.







