# Specify the state schema

The state schema is the backbone of your document model. It defines the structure, data types, and relationships of the information your document will hold. In Powerhouse, we use the **GraphQL Schema Definition Language (SDL)** to define this schema. A well-defined state schema is crucial for ensuring data integrity, consistency, and for enabling powerful querying and manipulation capabilities.

:::tip Specification Driven Design
Your state schema is more than just a data structure—it's a **specification** that enables **Specification Driven Design & Development**. This schema becomes a machine-readable blueprint that AI agents can interpret and execute, enabling precise collaboration between you and AI throughout the development process.
:::

## Core concepts

### Types

At the heart of GraphQL SDL are **types**. Types define the shape of your data. You can define custom object types that represent the entities in your document. For example, in a `TodoList` document, you might have a `TodoListState` type and a `TodoItem` type.

- **`TodoListState`**: This could be the root type representing the overall state of the to-do list. It might contain a list of `TodoItem` objects.
- **`TodoItem`**: This type would represent an individual to-do item, with properties like an `id`, `text` (the task description), and `checked` (a boolean indicating if the task is completed).

### Fields

Each type has **fields**, which represent the properties of that type. Each field has a name and a type. For instance, the `TodoItem` type would have an `id` field of type `OID!`, a `text` field of type `String!`, and a `checked` field of type `Boolean!`.

### Scalars

GraphQL has a set of built-in **scalar types**:

- `String`: A UTF‐8 character sequence.
- `Int`: A signed 32‐bit integer.
- `Float`: A signed double-precision floating-point value.
- `Boolean`: `true` or `false`.
- `ID`: A unique identifier, often used as a key for a field. It is serialized in the same way as a String; however, it is not intended to be human-readable.

In addition to these standard types, the Powerhouse Document-Engineering system introduces custom scalars that are linked to reusable front-end components. These scalars are tailored for the web3 ecosystem and will be explored in the Component Library section of the documentation.

:::tip Custom Scalar: OID
Powerhouse provides the `OID` (Object ID) scalar type, which is a custom scalar specifically designed for unique identifiers in document models. It provides automatic ID generation capabilities when used with the `generateId()` function from the document-model core library.
:::

### Lists and non-null

You can modify types using lists and non-null indicators:

- **Lists**: To indicate that a field will return a list of a certain type, you wrap the type in square brackets, e.g., `[TodoItem!]!`. This means the field `items` in `TodoListState` will be a list of `TodoItem` objects.
- **Non-Null**: To indicate that a field cannot be null, you add an exclamation mark `!` after the type name, e.g., `String!`. This means that the `text` field of a `TodoItem` must always have a value. The outer `!` in `[TodoItem!]!` means the list itself cannot be null (it must be at least an empty list), and the inner `!` on `TodoItem!` means that every item within that list must also be non-null.

## Example: TodoList state schema

Let's revisit the `TodoList` example from the "Define the TodoList document specification" tutorial in Get Started.

### Basic schema (matching Get Started tutorial)

This is the same schema you built in the Get Started tutorial:

```graphql
# The state of our TodoList
type TodoListState {
  items: [TodoItem!]!
}

# A single to-do item
type TodoItem {
  id: OID!
  text: String!
  checked: Boolean!
}
```

### Advanced schema (with statistics tracking)

:::info Advanced Feature
In this Mastery Track, we'll extend the basic schema with a `stats` field to demonstrate how you can add computed statistics to your document model. This is an **optional enhancement** that builds on the foundation from Get Started.
:::

```graphql
# The state of our TodoList (advanced version with stats)
type TodoListState {
  items: [TodoItem!]!
  stats: TodoListStats!
}

# A single to-do item
type TodoItem {
  id: OID!
  text: String!
  checked: Boolean!
}

# The statistics on our to-do's (advanced feature)
type TodoListStats {
  total: Int!
  checked: Int!
  unchecked: Int!
}
```

### Breakdown:

- **`TodoListState` type**:
  - `items: [TodoItem!]!`: This field defines that our `TodoListState` contains a list called `items`.
    - `[TodoItem!]`: This signifies that `items` is a list of `TodoItem` objects.
    - `TodoItem!`: The `!` after `TodoItem` means that no item in the list can be null. Each entry must be a valid `TodoItem`.
    - The final `!` after `[TodoItem!]` means that the `items` list itself cannot be null. It can be an empty list `[]`, but it cannot be absent.
  - `stats: TodoListStats!` *(advanced)*: Holds aggregated statistics about the to-do items.

- **`TodoItem` type**:
  - `id: OID!`: Each `TodoItem` has a unique identifier using Powerhouse's custom `OID` scalar. This is crucial for referencing specific items, for example, when updating or deleting them.
  - `text: String!`: The textual description of the to-do item. It cannot be null, ensuring every to-do has a description.
  - `checked: Boolean!`: Indicates whether the to-do item is completed. It defaults to a boolean value (true or false) and cannot be null.

- **`TodoListStats` type** *(advanced)*: This type holds the summary statistics for the to-do list.
  - `total: Int!`: The total count of all to-do items. This field must be an integer and cannot be null.
  - `checked: Int!`: The number of to-do items that are marked as completed. This must be an integer and cannot be null.
  - `unchecked: Int!`: The number of to-do items that are still pending. This also must be an integer and cannot be null.

## Best practices for designing your state schema

1.  **Start Simple, Iterate**: Begin with the core entities and properties. You can always expand and refine your schema as your understanding of the document's requirements grows.
2.  **Clarity and Explicitness**: Name your types and fields clearly and descriptively. This makes the schema easier to understand and maintain.
3.  **Use Non-Null Wisely**: Enforce data integrity by using non-null (`!`) for fields that must always have a value. However, be mindful not to over-constrain if a field can genuinely be optional.
4.  **Normalize vs. Denormalize**:
    - **Normalization**: Similar to relational databases, you can normalize your data by having distinct types and linking them via IDs. This can reduce data redundancy. For example, if you had `User` and `TodoItem` and wanted to assign tasks, you might have an `assigneeId` field in `TodoItem` that links to a `User`'s `id`.
    - **Denormalization**: Sometimes, for performance or simplicity, you might embed data directly. For instance, if user information associated with a to-do item was very simple and only used in that context, you might embed user fields directly in `TodoItem`.
    - The choice depends on your specific use case, query patterns, and how data is updated.
5.  **Consider Future Needs**: While you shouldn't over-engineer, think a little about potential future enhancements. For example, adding a `createdAt: String` or `dueDate: String` field to `TodoItem` might be useful later.
6.  **Root State Type**: It's a common pattern to have a single root type for your document state (e.g., `TodoListState`). This provides a clear entry point for accessing all document data.

By carefully defining your state schema, you lay a solid foundation for your Powerhouse document model, making it robust, maintainable, and easy to work with. The schema dictates not only how data is stored but also how it can be queried and mutated through operations, which will be covered in the next section.

## Practical implementation: defining the state schema in Vetra Studio

Now that you understand the concepts behind the state schema, let's put it into practice. This section will guide you through creating a document model specification for the TodoList example discussed above.

<details>
<summary>Tutorial: The state schema specification</summary>

### Prerequisites

- You have a Powerhouse project set up. If not, please follow the [Create a new Powerhouse Project](../../GetStarted/CreateNewPowerhouseProject) tutorial.
- Vetra Studio is running. If not, navigate to your project directory in the terminal and run `ph vetra --watch`.

### Steps

1.  **Create a New Document Model**:
    - With Vetra Studio open in your browser, you'll see the Vetra Studio Drive.
    - Click the **Document Models 'Add new specification'** button to create a new document model specification.

2.  **Define Document Metadata**:
    - **Name**: Give your document model a descriptive name: `TodoList`. **Pay close attention to capitalization, as it influences our code generation.**
    - **Document Type**: In the 'Document Type' field, enter a unique identifier for this document type: `powerhouse/todo-list`.

3.  **Specify the State Schema**:
    - In the code editor provided, you'll see a template for a GraphQL schema.
    - Replace the entire content of the editor with the advanced `TodoList` schema we've designed in this chapter:

    ```graphql
    # The state of our TodoList (advanced version with stats)
    type TodoListState {
      items: [TodoItem!]!
      stats: TodoListStats!
    }

    # A single to-do item
    type TodoItem {
      id: OID!
      text: String!
      checked: Boolean!
    }
    
    # The statistics on our to-do's (advanced feature)
    type TodoListStats {
      total: Int!
      checked: Int!
      unchecked: Int!
    }
    ```

4.  **Sync Schema and View Initial State**:
    - After pasting the schema, click the **'Sync with schema'** button.
    - This action processes your schema and generates an initial JSON state for your document model based on the `TodoListState` type. You can view this initial state, which helps you verify that your schema is structured correctly.

    For now, you can ignore the "Modules & Operations" section. We will define and implement the operations that modify this state in the upcoming sections of this Mastery Track.

By completing these steps, you have successfully specified the data structure for the advanced TodoList document model. The next step is to define the operations that will allow users to interact with and change this state.

</details>

<details>
<summary>Alternatively: Define the state schema in Connect</summary>

### Prerequisites

- You have a Powerhouse project set up. If not, please follow the [Create a new Powerhouse Project](../../GetStarted/CreateNewPowerhouseProject) tutorial.
- Connect is running. If not, navigate to your project directory in the terminal and run `ph connect`.

### Steps

1.  **Create a New Document Model**:
    - With Connect open in your browser, navigate into your local drive.
    - At the bottom of the page in the 'New Document' section, click the `DocumentModel` button to create a new document model specification.

2.  **Define Document Metadata**:
    - **Name**: Give your document model a descriptive name: `TodoList`. **Pay close attention to capitalization, as it influences our code generation.**
    - **Document Type**: In the 'Document Type' field, enter a unique identifier for this document type: `powerhouse/todo-list`.

3.  **Specify the State Schema**:
    - In the code editor provided, you'll see a template for a GraphQL schema.
    - Replace the entire content of the editor with the advanced `TodoList` schema we've designed in this chapter:

    ```graphql
    # The state of our TodoList (advanced version with stats)
    type TodoListState {
      items: [TodoItem!]!
      stats: TodoListStats!
    }

    # A single to-do item
    type TodoItem {
      id: OID!
      text: String!
      checked: Boolean!
    }
    
    # The statistics on our to-do's (advanced feature)
    type TodoListStats {
      total: Int!
      checked: Int!
      unchecked: Int!
    }
    ```

4.  **Sync Schema and View Initial State**:
    - After pasting the schema, click the **'Sync with schema'** button.
    - This action processes your schema and generates an initial JSON state for your document model based on the `TodoListState` type. You can view this initial state, which helps you verify that your schema is structured correctly.

    For now, you can ignore the "Modules & Operations" section. We will define and implement the operations that modify this state in the upcoming sections of this Mastery Track.

By completing these steps, you have successfully specified the data structure for the advanced TodoList document model. The next step is to define the operations that will allow users to interact with and change this state.

</details>

For a complete, working example, you can always have a look at the [Example TodoList Repository](/academy/MasteryTrack/DocumentModelCreation/ExampleToDoListRepository) which contains the full implementation of the concepts discussed in this Mastery Track.
