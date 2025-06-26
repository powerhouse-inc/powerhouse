# Specify document operations

In the previous section, we defined the state schema for our document model. Now, we turn our attention to a critical aspect of document model creation: **specifying document operations**. These operations are the heart of your document's behavior, dictating how its state can be modified.

## What are document operations?

In Powerhouse, document models adhere to event sourcing principles. This means that every change to a document's state is the result of a sequence of operations (or events). Instead of directly mutating the state, you define specific, named operations that describe the intended change.

For example, in our `To-do List` document model, operations might include:

*   `ADD_TODO_ITEM`: To add a new task.
*   `UPDATE_TODO_ITEM`: To modify an existing task (e.g., change its text or mark it as completed).
*   `DELETE_TODO_ITEM`: To remove a task.

Each operation acts as a command that, when applied, transitions the document from one state to the next. The complete history of these operations defines the document's journey to its current state.

## Connecting operations to the schema

In the "Define To-do List Document Model" chapter in the "Get Started" guide, we used GraphQL `input` types to define the structure of the data required for each operation. Let's revisit that:

```graphql
# Defines a GraphQL input type for adding a new to-do item
input AddTodoItemInput {
  id: ID!
  text: String!
}

# Defines a GraphQL input type for updating a to-do item
input UpdateTodoItemInput {
  id: ID!
  text: String
  checked: Boolean
}

# Defines a GraphQL input type for deleting a to-do item
input DeleteTodoItemInput {
  id: ID!
}
```

These `input` types are not just abstract definitions; they are the **specifications for our document operations**.

*   **`AddTodoItemInput`** specifies that to execute an `ADD_TODO_ITEM` operation, we need an `id` and `text` for the new item.
*   **`UpdateTodoItemInput`** specifies that for an `UPDATE_TODO_ITEM` operation, we need the `id` of the item to update, and optionally new `text` or a `checked` status.
*   **`DeleteTodoItemInput`** specifies that a `DELETE_TODO_ITEM` operation requires the `id` of the item to be removed.

The Powerhouse Connect application uses these GraphQL input types when you define operations within a module (e.g., the `to_do_list` module with operations `ADD_TODO_ITEM`, `UPDATE_TODO_ITEM`, `DELETE_TODO_ITEM`).

## Designing effective document operations

Careful design of your document operations is crucial for a robust and maintainable document model. Here are some key considerations:

### 1. Granularity
Operations should be granular enough to represent distinct user intentions or logical changes.

*   **Too coarse:** An operation like `MODIFY_TODOLIST` that takes a whole new list of items would be too broad. It would be hard to track specific changes and could lead to complex reducer logic.
*   **Too fine:** While possible, having separate operations like `SET_TODO_ITEM_TEXT` and `SET_TODO_ITEM_CHECKED_STATUS` might be overly verbose if these are often updated together. `UPDATE_TODO_ITEM` with optional fields offers a good balance.
*   **Just right:** The `ADD_TODO_ITEM`, `UPDATE_TODO_ITEM`, and `DELETE_TODO_ITEM` operations for our `ToDoList` are good examples. They represent clear, atomic changes.

### 2. Naming conventions
Clear and consistent naming makes your operations understandable. A common convention is `VERB_NOUN` or `VERB_NOUN_SUBJECT`.

*   Examples: `ADD_ITEM`, `UPDATE_USER_PROFILE`, `ASSIGN_TASK_TO_USER`.
*   In our case: `ADD_TODO_ITEM`, `UPDATE_TODO_ITEM`, `DELETE_TODO_ITEM`.

The name you provide in the Connect UI (e.g., `ADD_TODO_ITEM`) directly corresponds to the operation type that will be recorded and that your reducers will handle.

### 3. Input types (payloads)
The input type for an operation (its payload) should contain all the necessary information to perform that operation, and nothing more.

*   **Completeness:** If an operation needs a user ID to authorize a change, include it in the input.
*   **Conciseness:** Avoid including data that isn't directly used by the operation.
*   **Clarity:** Use descriptive field names within your input types. `action.input.text` is clearer than `action.input.t`.

The GraphQL `input` types we defined earlier (`AddTodoItemInput`, `UpdateTodoItemInput`, `DeleteTodoItemInput`) serve precisely this purpose. They ensure that whoever triggers an operation provides the correct data in the correct format.

### 4. Immutability and pure functions
While not specified in the operation definition itself, remember that the *implementation* of these operations (the reducers) should treat state as immutable and behave as pure functions. The operation specification (input type) provides the data for these pure functions.

## Role in event sourcing and CQRS

*   **Events:** Each successfully executed operation is recorded as an event in the document's history. This history provides an audit trail and allows for replaying events to reconstruct state, which is invaluable for debugging and understanding how a document evolved.
*   **Commands:** Document operations are essentially "commands" in a Command Query Responsibility Segregation (CQRS) pattern. They represent an intent to change the state. The processing of this command (by the reducer) leads to one or more events being stored and the state being updated.

## From specification to implementation

Specifying your document operations is the bridge between defining your data structure (the state schema) and implementing the logic that changes that data (the reducers).

1.  **You define the state schema** (e.g., `ToDoListState`, `ToDoItem`).
2.  **You specify the operations** that can alter this state, along with their required input data (e.g., `ADD_TODO_ITEM` with `AddTodoItemInput`).
3.  **Next, you will implement reducers** for each specified operation. Each reducer will take the current state and an operation's input, and produce a new state.

The generated code from `ph generate` (as seen in `03-ImplementOperationReducers.md`) will create a structure for your reducers based on the operations you specified in the Connect application (which, in turn, were based on your GraphQL input types).

For example, the `ToDoListToDoListOperations` type generated by Powerhouse will expect methods corresponding to `addTodoItemOperation`, `updateTodoItemOperation`, and `deleteTodoItemOperation`.

```typescript
import { ToDoListToDoListOperations } from '../../gen/to-do-list/operations.js';

export const reducer: ToDoListToDoListOperations = {
  addTodoItemOperation(state, action, dispatch) {
    // Implementation uses action.input which matches AddTodoItemInput
  },
  updateTodoItemOperation(state, action, dispatch) {
    // Implementation uses action.input which matches UpdateTodoItemInput
  },
  deleteTodoItemOperation(state, action, dispatch) {
    // Implementation uses action.input which matches DeleteTodoItemInput
  },
};
```

## Practical implementation: Defining operations in Connect

Now that you understand the theory, let's walk through the practical steps of defining these operations for our `To-do List` document model within the Powerhouse Connect application.

<details>
<summary>Tutorial: Specifying To-do List operations</summary>

Assuming you have already defined the state schema for the `To-do List` as covered in the previous section, follow these steps to add the operations:

1.  **Create a Module for Operations:**
    Below the schema editor in Connect, find the input field labeled `Add module`. Modules help organize your operations.
    *   Type `to_do_list` into the field and press Enter.

2.  **Add the `ADD_TODO_ITEM` Operation:**
    A new field, `Add operation`, will appear under your new module.
    *   Type `ADD_TODO_ITEM` into this field and press Enter.
    *   An editor will appear for the operation's input type. You need to define the data required for this operation. Paste the following GraphQL `input` definition into the editor:

    ```graphql
    # Defines a GraphQL input type for adding a new to-do item
    input AddTodoItemInput {
      id: ID!
      text: String!
    }
    ```

3.  **Add the `UPDATE_TODO_ITEM` Operation:**
    *   In the `Add operation` field again, type `UPDATE_TODO_ITEM` and press Enter.
    *   Paste the corresponding `input` definition into its editor:

    ```graphql
    # Defines a GraphQL input type for updating a to-do item
    input UpdateTodoItemInput {
      id: ID!
      text: String
      checked: Boolean
    }
    ```

4.  **Add the `DELETE_TODO_ITEM` Operation:**
    *   Finally, type `DELETE_TODO_ITEM` in the `Add operation` field and press Enter.
    *   Paste its `input` definition:

    ```graphql
    # Defines a GraphQL input type for deleting a to-do item
    input DeleteTodoItemInput {
      id: ID!
    }
    ```

5.  **Review and Export:**
    After adding all three operations, your document model specification in Connect is complete for now. You can see how each operation (`ADD_TODO_ITEM`, etc.) is now explicitly linked to an input type that defines its payload.

    The next step in a real project would be to click the `Export` button to save this specification file. In the next chapter, we will see how this exported file is used to generate code for our reducers.

</details>

## Conclusion

Specifying document operations is a foundational step in building robust and predictable document models in Powerhouse. By clearly defining the **"what" (the operation and its input)** before implementing the **"how" (the reducer logic)**, you create a clear contract for state transitions. This approach enhances type safety, testability, and the overall maintainability of your document model.

In the next section, we will dive deeper into the implementation of the reducer functions for these specified operations.
