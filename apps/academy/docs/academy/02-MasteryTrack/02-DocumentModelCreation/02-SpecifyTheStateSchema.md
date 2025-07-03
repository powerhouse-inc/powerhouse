# Specify the state schema

The state schema is the backbone of your document model. It defines the structure, data types, and relationships of the information your document will hold. In Powerhouse, we use the GraphQL Schema Definition Language (SDL) to define this schema. A well-defined state schema is crucial for ensuring data integrity, consistency, and for enabling powerful querying and manipulation capabilities.

## Core concepts

### Types
At the heart of GraphQL SDL are **types**. Types define the shape of your data. You can define custom object types that represent the entities in your document. For example, in a `ToDoList` document, you might have a `ToDoListState` type and a `ToDoItem` type.

*   **`ToDoListState`**: This could be the root type representing the overall state of the to-do list. It might contain a list of `ToDoItem` objects.
*   **`ToDoItem`**: This type would represent an individual to-do item, with properties like an `id`, `text` (the task description), and `checked` (a boolean indicating if the task is completed).

### Fields
Each type has **fields**, which represent the properties of that type. Each field has a name and a type. For instance, the `ToDoItem` type would have an `id` field of type `ID!`, a `text` field of type `String!`, and a `checked` field of type `Boolean!`.

### Scalars
GraphQL has a set of built-in **scalar types**:
*   `String`: A UTF‐8 character sequence.
*   `Int`: A signed 32‐bit integer.
*   `Float`: A signed double-precision floating-point value.
*   `Boolean`: `true` or `false`.
*   `ID`: A unique identifier, often used as a key for a field. It is serialized in the same way as a String; however, it is not intended to be human-readable.

In addition to these standard types, the Powerhouse Document-Engineering system introduces custom scalars that are linked to reusable front-end components. These scalars are tailored for the web3 ecosystem and will be explored in the Component Library section of the documentation.

### Lists and non-null

You can modify types using lists and non-null indicators:
*   **Lists**: To indicate that a field will return a list of a certain type, you wrap the type in square brackets, e.g., `[ToDoItem!]!`. This means the field `items` in `ToDoListState` will be a list of `ToDoItem` objects.
*   **Non-Null**: To indicate that a field cannot be null, you add an exclamation mark `!` after the type name, e.g., `String!`. This means that the `text` field of a `ToDoItem` must always have a value. The outer `!` in `[ToDoItem!]!` means the list itself cannot be null (it must be at least an empty list), and the inner `!` on `ToDoItem!` means that every item within that list must also be non-null.

## Example: ToDoList state schema

Let's revisit the `ToDoList` example from the "Define the ToDoList document specification" tutorial.
Only this time, we'll also add a 'Stats' type. Since we want to keep track of the number of completed To-Do's.

```graphql
# The state of our ToDoList
type ToDoListState {
  items: [ToDoItem!]!
}

# A single to-do item
type ToDoItem {
  id: ID!
  text: String!
  checked: Boolean!
}
# The statistics on our to-do's
type ToDoListStats {
  total: Int!
  checked: Int!
  unchecked: Int!
}
```

### Breakdown:

*   **`ToDoListState` type**:
    *   `items: [ToDoItem!]!`: This field defines that our `ToDoListState` contains a list called `items`.
        *   `[ToDoItem!]`: This signifies that `items` is a list of `ToDoItem` objects.
        *   `ToDoItem!`: The `!` after `ToDoItem` means that no item in the list can be null. Each entry must be a valid `ToDoItem`.
        *   The final `!` after `[ToDoItem!]` means that the `items` list itself cannot be null. It can be an empty list `[]`, but it cannot be absent.

*   **`ToDoItem` type**:
    *   `id: ID!`: Each `ToDoItem` has a unique identifier that cannot be null. This is crucial for referencing specific items, for example, when updating or deleting them.
    *   `text: String!`: The textual description of the to-do item. It cannot be null, ensuring every to-do has a description.
    *   `checked: Boolean!`: Indicates whether the to-do item is completed. It defaults to a boolean value (true or false) and cannot be null.

*   **`ToDoListStats` type**: This type holds the summary statistics for the to-do list.
    *   `total: Int!`: The total count of all to-do items. This field must be an integer and cannot be null.
    *   `checked: Int!`: The number of to-do items that are marked as completed. This must be an integer and cannot be null.
    *   `unchecked: Int!`: The number of to-do items that are still pending. This also must be an integer and cannot be null.

## Best practices for designing your state schema

1.  **Start Simple, Iterate**: Begin with the core entities and properties. You can always expand and refine your schema as your understanding of the document's requirements grows.
2.  **Clarity and Explicitness**: Name your types and fields clearly and descriptively. This makes the schema easier to understand and maintain.
3.  **Use Non-Null Wisely**: Enforce data integrity by using non-null (`!`) for fields that must always have a value. However, be mindful not to over-constrain if a field can genuinely be optional.
4.  **Normalize vs. Denormalize**:
    *   **Normalization**: Similar to relational databases, you can normalize your data by having distinct types and linking them via IDs. This can reduce data redundancy. For example, if you had `User` and `ToDoItem` and wanted to assign tasks, you might have an `assigneeId` field in `ToDoItem` that links to a `User`'s `id`.
    *   **Denormalization**: Sometimes, for performance or simplicity, you might embed data directly. For instance, if user information associated with a to-do item was very simple and only used in that context, you might embed user fields directly in `ToDoItem`.
    *   The choice depends on your specific use case, query patterns, and how data is updated.
5.  **Consider Future Needs**: While you shouldn't over-engineer, think a little about potential future enhancements. For example, adding a `createdAt: String` or `dueDate: String` field to `ToDoItem` might be useful later.
6.  **Root State Type**: It's a common pattern to have a single root type for your document state (e.g., `ToDoListState`). This provides a clear entry point for accessing all document data.

By carefully defining your state schema, you lay a solid foundation for your Powerhouse document model, making it robust, maintainable, and easy to work with. The schema dictates not only how data is stored but also how it can be queried and mutated through operations, which will be covered in the next section.

## Practical implementation: defining the state schema in Connect

Now that you understand the concepts behind the state schema, let's put it into practice. This section will guide you through creating a document model specification for the advanced ToDoList example discussed above.

<details>
<summary>Tutorial: The state schema specification</summary> 

### Prerequisites

-   You have a Powerhouse project set up. If not, please follow the [Create a new Powerhouse Project](../../GetStarted/CreateNewPowerhouseProject) tutorial.
-   Connect Studio is running. If not, navigate to your project directory in the terminal and run `ph connect`.

### Steps

1.  **Create a New Document Model**:
    -   With Connect Studio open in your browser, navigate into your local drive.
    -   At the bottom of the page in the 'New Document' section, click the `DocumentModel` button to create a new document model specification.

2.  **Define Document Metadata**:
    -   **Name**: Give your document model a descriptive name, for example, `ToDoList`. **Pay close attention to capitalization, as it influences our code.**
    -   **Document Type**: In the 'Document Type' field, enter a unique identifier for this document type: `powerhouse/todolist`.

3.  **Specify the State Schema**:
    -   In the code editor provided, you'll see a template for a GraphQL schema.
    -   Replace the entire content of the editor with the advanced `ToDoList` schema we've designed in this chapter:

    ```graphql
    # The state of our ToDoList
    type ToDoListState {
      items: [ToDoItem!]!
      stats: ToDoListStats!
    }

    # A single to-do item
    type ToDoItem {
      id: ID!
      text: String!
      checked: Boolean!
    }
    # The statistics on our to-do's
    type ToDoListStats {
      total: Int!
      checked: Int!
      unchecked: Int!
    }
    ```

4.  **Sync Schema and View Initial State**:
    -   After pasting the schema, click the **'Sync with schema'** button.
    -   This action processes your schema and generates an initial JSON state for your document model based on the `ToDoListState` type. You can view this initial state, which helps you verify that your schema is structured correctly.

    For now, you can ignore the "Modules & Operations" section. We will define and implement the operations that modify this state in the upcoming sections of this Mastery Track.

By completing these steps, you have successfully specified the data structure for the advanced ToDoList document model. The next step is to define the operations that will allow users to interact with and change this state.

</details>

For a complete, working example, you can always have a look at the [Example ToDoList Repository](/academy/MasteryTrack/DocumentModelCreation/ExampleToDoListRepository) which contains the full implementation of the concepts discussed in this Mastery Track.

