# GraphQL at Powerhouse

In this section, we will cover **the core concepts of GraphQL with examples applied to the Powerhouse ecosystem**. GraphQL plays a fundamental role in defining document model data schemas, handling data access patterns, and enabling event-driven workflows within the Powerhouse ecosystem.

More specifically, GraphQL is used as:
- The **schema definition language (SDL)** for defining our document models and thereby self-documenting the API to the data model. It allows developers to define the structure and relationships of data in a strongly-typed format.
- As the **query language in subgraphs**, which allow different services to expose and query structured data dynamically.

### Why GraphQL?

- **Precision**: Instead of over-fetching or under-fetching data, GraphQL enables you to specify the precise data requirements in your query.
- **Single Endpoint**: With GraphQL, you can access all the data you need through one endpoint, reducing the number of network requests.
- **Dynamic Queries**: Its introspective nature allows developers to explore the API's schema dynamically, which streamlines development and documentation.

## GraphQL: Core concepts

### Schema
The schema defines the structure of a GraphQL API. It acts as a contract between the client and server, detailing:

- **Data Types**: The various types of data that can be queried.   
For example the contributor type and the project type
- **Fields**: The available fields on each type.   
For example the contributor type has a field 'name' and the project type has a field 'title'
- **Relationships**: How different types relate to each other.   
For example the contributor type has a relationship with the project type

  ```graphql title="Example of a Powerhouse Contributor schema in GraphQL"
  type Contributor {
    id: ID!
    name: String!
    reputationScore: Float
    projects: [Project]   # The Contributor type has a field 'projects' that returns an array of Project objects
  }

  type Project {
    id: ID!
    title: String!
    status: String
    budget: Float
  }

  type Query {
    getContributor(id: ID!): Contributor
  }
  ```

  With the following query someone can request the contributor with the id 123

    ```graphql title="Example of a query to get a contributor"
    query {
      getContributor(id: "123") {
        name
        reputationScore
        projects {      # Accessing the related projects
          title
          status
        }
      }
    }
    ```

---

### Fields and arguments
- **Field**: A specific piece of data you can request from an object. When you build a query, you select the fields you want to retrieve.
- **Argument**: Key-value pairs that can be attached to fields to customize and refine the query. Some fields require arguments to work correctly, especially when dealing with mutations.

  Powerhouse uses invoices as part of its decentralized operations. With GraphQL, an invoice query might look like this:
  Here, contributorId and status are arguments that filter the results to return only paid invoices for a specific contributor.

  ```graphql title="Fetching an Invoice with Filtering"
  query {
    getInvoices(contributorId: "456", status: "PAID") {
      id
      amount
      currency
      dueDate
    }
  }
  ```
___

### Introspection
GraphQL APIs are self-documenting. Through introspection, you can query the API to retrieve details about its schema, including:

- The list of **available types and fields**.
- The **relationships** between those types. This capability is particularly useful for developing dynamic client applications and auto-generating documentation.

  Developers might want to see what data structures are available. This makes it easy to explore document models and read models in Powerhouse without needing to consult extensive external documentation.

  ```graphql title="Discovering Available Queries"
  {
    __schema {
      types {
        name
        fields {
          name
        }
      }
    }
  }
  ```

---
### Connections, edges, and nodes
When dealing with lists of data, GraphQL employs a pattern that includes:

- **Connection**: A structure that represents a list of related objects.
- **Edge**: Represents the link between individual nodes (objects) in a connection. Each edge contains:
  - A node field (the actual object).
  - A cursor for pagination.
- **Node**: The individual object in the connection. When querying nodes, you continue selecting subfields until all the data resolves to scalar values.

  To efficiently fetch invoices in Powerhouse, a paginated query could look like this.
  This allows Powerhouse Switchboard to efficiently handle large datasets and return results incrementally

  ```graphql title="Paginated List of Invoices"
  query {
    invoices(first: 10, after: "cursor123") {
      edges {
        node {
          id
          amount
          dueDate
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  ```

---

### Mutations
- While queries retrieve data, **mutations modify data**. In Powerhouse, a contributor might need to submit an invoice after completing a task. A GraphQL mutation for this could be:

    ```graphql title="Submitting an Invoice"
    mutation {
      submitInvoice(input: {
        contributorId: "123"
        amount: 500.00
        currency: "USD"
        dueDate: "2024-03-01"
      }) {
        id
        status
      }
    }
    ```

---

## GraphQL Subgraphs in Powerhouse

Powerhouse structures its data into **subgraphs**, which are modular GraphQL services that connect to the Reactor (Powerhouse's core data infrastructure) or Operational Data Stores fueled by data from processors. Each subgraph has its own SDL, ensuring modularity and flexibility while working within the ecosystem.

### Fetching data from the Reactor

Powerhouse uses GraphQL to expose system-level data, such as drives, users, and operational records through the **System Subgraph**, which allows querying of drives, stored files and folders.

### Operational data stores

Custom subgraphs can be created to store and retrieve operational data in real time. For example, a subgraph can track file uploads and expose this data via GraphQL queries:

```graphql title="File Schema Example"
type File {
  id: ID!
  name: String!
  size: Int!
  createdAt: DateTime!
}

type Query {
  getFile(id: ID!): File
}
```

This schema ensures that every File entity has an ID, name, size, and timestamp, providing a structured approach to file management data.

---

## CQRS Architecture with GraphQL

Powerhouse uses **CQRS (Command Query Responsibility Segregation)** to separate write operations (commands) from read operations (queries). This improves system scalability and flexibility:

- **GraphQL Queries** handle read operations, retrieving structured data efficiently
- **GraphQL Mutations** handle write operations, modifying the state in a controlled manner

Powerhouse's subgraphs act as the read layer, while processors handle write operations into operational data stores. This prevents conflicts between querying and modifying data.

| Layer | Role | GraphQL Usage | Implementation |
| --- | --- | --- | --- |
| Write Model (Commands) | Handles state changes (adding, modifying, deleting) | GraphQL Mutations | Processor |
| Read Model (Queries) | Optimized for fetching/reading/retrieving data | GraphQL Queries | Subgraph |

### Read and write separation  

**Read Model (Query)**  
- Optimized for data retrieval
- Structured using GraphQL Queries
- Aggregates and exposes data via a subgraph
- Pulls data from Operational Data Stores, Analytics Stores, and Reactor
- Subgraphs do not directly modify the data—they only expose pre-processed information

```graphql title="Example Query Operation"
query {
  getFile(id: "123") {
    name
    size
    createdAt
  }
}
```

**Write Model (Mutation)** 
- Handles state changes (adding, modifying, deleting)
- Structured using GraphQL Mutations
- Writes data to Operational Data Stores

```graphql title="Example Mutation Operation"
mutation {
  createFile(name: "document.pdf", size: 1024) {
    id
    name
    createdAt
  }
}
```

---

## GraphQL and Event-Driven Architecture

Event-Driven Architecture (EDA) enables asynchronous processing where events trigger actions. Powerhouse uses GraphQL to expose real-time event data from its Reactor and Operational Data Stores.

### How GraphQL fits into EDA

- **Real-Time Data Exposure** – Subgraphs fetch event-based data updates
- **Event Subscription Mechanism** – Powerhouse is working towards integrating GraphQL Subscriptions for real-time updates
- **Efficient Decoupling** – Events are stored in an operational datastore, and GraphQL queries retrieve structured results

### Example: Powerhouse's event flow

1. Processor detects an event (e.g., file upload)
2. Writes event data to the Operational Data Store
3. Subgraph exposes the updated data via GraphQL

---

## GraphQL Subscriptions

Although Powerhouse currently uses queries and mutations, **GraphQL Subscriptions** could allow real-time streaming of event-based data in future implementations:

```graphql title="Example Future Subscription"
subscription {
  fileUploaded {
    id
    name
    size
    createdAt
  }
}
```

This would enable clients to listen for new file uploads without polling, providing a more efficient real-time experience.

---

## Summary

GraphQL offers a streamlined and efficient approach to data retrieval, particularly useful when you need granular control over your API interactions. In the Powerhouse ecosystem, GraphQL serves multiple critical functions:

- **Schema Definition**: Defines document models and self-documents APIs
- **Subgraph Architecture**: Enables modular, scalable data services
- **CQRS Implementation**: Separates read and write operations for better performance
- **Event-Driven Integration**: Supports real-time data exposure and future subscription capabilities

By defining robust schemas, using precise fields and arguments, leveraging introspection, and implementing subgraphs with CQRS principles, GraphQL minimizes unnecessary data transfers while maximizing flexibility and scalability in the Powerhouse platform.

For more information about GraphQL fundamentals, visit the [Introduction to GraphQL](https://graphql.org/learn/) documentation.