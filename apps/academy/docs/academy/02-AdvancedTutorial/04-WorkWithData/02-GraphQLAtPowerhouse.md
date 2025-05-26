# GraphQL at Powerhouse

In this section, we will cover **the core concepts of GraphQL with examples applied to the Powerhouse ecosystem**. More specifically, GraphQL is used as:
- The **schema definition language (SDL)** for defining our document models and thereby self-documenting the API to the data model. It allows developers to define the structure and relationships of data in a strongly-typed format.
- As the **query language in subgraphs**, which allow different services to expose and query structured data dynamically. Jump to the section [GraphQL and Subgraphs](/docs/academy/AdvancedTutorial/WorkWithData/WorkingWithSubgraphs/GraphQLAndSubgraphs) to learn more about this.


### Why GraphQL?

- **Precision**: Instead of over-fetching or under-fetching data, GraphQL enables you to specify the precise data requirements in your query.
- **Single Endpoint**: With GraphQL, you can access all the data you need through one endpoint, reducing the number of network requests.
- **Dynamic Queries**: Its introspective nature allows developers to explore the API's schema dynamically, which streamlines development and documentation.

## GraphQL: Core Concepts

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

### Fields & Arguments
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
### Connections, Edges, and Nodes
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
## Summary
GraphQL offers a streamlined and efficient approach to data retrieval, particularly useful when you need granular control over your API interactions. By defining a robust schema, using precise fields and arguments, and leveraging introspection, GraphQL minimizes unnecessary data transfers. If you want to learn more about GraphQL, there is the following link to the official documentation: [Introduction to GraphQL](https://graphql.org/learn/).