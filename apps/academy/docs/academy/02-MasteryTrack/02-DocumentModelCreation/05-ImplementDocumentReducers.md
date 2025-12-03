# Implement document reducers

## The heart of document logic

In our journey through Powerhouse Document Model creation, we've defined the "what" – the structure of our data ([State Schema](02-SpecifyTheStateSchema.md)) and the ways it can be changed ([Document Operations](03-SpecifyDocumentOperations.md)). We've also seen how the [Document Model Generator](04-UseTheDocumentModelGenerator.md) translates these specifications into a coded scaffold. Now, we arrive at the "how": implementing **Document Reducers**.

Reducers are the core logic units of your document model. They are the functions that take the current state of your document and an operation (an "action"), and then determine the _new_ state of the document. They are the embodiment of your business rules and the engine that drives state transitions in a predictable, auditable, and immutable way.

## Recap: The journey to reducer implementation

Before diving into the specifics of writing reducers, let's recall the preceding steps:

1.  **State Schema Definition**: You designed the GraphQL `type` definitions for your document's data structure (e.g., `TodoListState`, `TodoItem`).
2.  **Document Operation Specification**: You defined the GraphQL `input` types that specify the parameters for each allowed modification to your document (e.g., `AddTodoItemInput`, `UpdateTodoItemInput`). These were then associated with named operations (e.g., `ADD_TODO_ITEM`) in the Connect application.
3.  **Code Generation**: You used `ph generate <YourModelName.phd>` to create the necessary TypeScript types, action creators, and, crucially, the skeleton file for your reducers (typically `document-models/<your-model-name>/src/reducers/todos.ts`).

This generated reducer file is our starting point. It will contain function stubs or an object structure expecting your reducer implementations, all typed according to your schema.

## What is a reducer? The core principles

In the context of Powerhouse and inspired by patterns like Redux, a reducer is a **pure function** with the following signature (conceptually):

`(currentState, action) => newState`

Let's break down its components and principles:

- **`currentState`**: This is the complete, current state of your document model instance before the operation is applied. It's crucial to treat this as **immutable**.
- **`action`**: This is an object describing the operation to be performed. It typically has:
  - A `type` property: A string identifying the operation (e.g., `'ADD_TODO_ITEM'`).
  - An `input` property (or similar, like `payload`): An object containing the data necessary for the operation, matching the GraphQL `input` type you defined (e.g., `{ text: 'Buy groceries' }` for `AddTodoItemInput`).
- **`newState`**: The reducer must return a _new_ state object representing the state after the operation has been applied. If the operation does not result in a state change, the reducer should return the `currentState` object itself.

### Key principles guiding reducer implementation:

1.  **Purity**:
    - **Deterministic**: Given the same `currentState` and `action`, a reducer must _always_ produce the same `newState`.
    - **No Side Effects**: Reducers must not perform any side effects. This means no API calls, no direct DOM manipulation, no `Math.random()` (unless seeded deterministically for specific testing scenarios), and no modification of variables outside their own scope. Their sole job is to compute the next state.

2.  **Immutability**:
    - **Never Mutate `currentState`**: You must never directly modify the `currentState` object or any of its nested properties.
    - **Always Return a New Object for Changes**: If the state changes, you must create and return a brand new object. If the state does not change, you return the original `currentState` object.
    - This is fundamental to Powerhouse's event sourcing architecture, enabling time travel, efficient change detection, and a clear audit trail.
    
    :::tip Powerhouse uses Immer.js
    Powerhouse uses **Immer.js** under the hood, which means you can write code that _looks like_ it's mutating the state directly (e.g., `state.items.push(...)`), but Immer ensures it results in an immutable update. This gives you the best of both worlds: readable code and immutable state.
    :::

3.  **Single Source of Truth**: The document state managed by reducers is the single source of truth for that document instance. All UI rendering and data queries are derived from this state.

4.  **Delegation to specific operation handlers**:
    While you can write one large reducer that uses a `switch` statement or `if/else if` blocks based on `action.type`, Powerhouse's generated code typically encourages a more modular approach. You'll often implement a separate function for each operation, which are then combined into a main reducer object or map. The `ph generate` command usually sets up this structure for you. For example, in your `document-models/todo-list/src/reducers/todos.ts`, you'll find an object structure like this:

    ```typescript
    import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

    export const todoListTodosOperations: TodoListTodosOperations = {
      addTodoItemOperation(state, action) {
        // Your logic for ADD_TODO_ITEM
      },
      updateTodoItemOperation(state, action) {
        // Your logic for UPDATE_TODO_ITEM
      },
      deleteTodoItemOperation(state, action) {
        // Your logic for DELETE_TODO_ITEM
      },
    };
    ```

    The `TodoListTodosOperations` type is generated by Powerhouse and ensures your reducer object correctly implements all defined operations. The `state` and `action` parameters within these methods will also be strongly typed based on your schema.

## Implementing reducer logic: A practical guide

Let's use our familiar `TodoList` example to illustrate common patterns. 

### Basic implementation (matching Get Started)

The basic implementation matches what you built in the Get Started tutorial:

```typescript
import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    // Generate a unique ID for the new todo item
    const id = generateId();
    
    // Add the new item to the state (Immer handles immutability)
    state.items.push({ ...action.input, id, checked: false });
  },
  
  updateTodoItemOperation(state, action) {
    // Find the item to update by its ID
    const item = state.items.find((item) => item.id === action.input.id);
    
    // Return early if item not found
    if (!item) return;
    
    // Update only the fields that are provided (partial update)
    item.text = action.input.text ?? item.text;
    item.checked = action.input.checked ?? item.checked;
  },
  
  deleteTodoItemOperation(state, action) {
    // Filter out the item with the matching ID
    state.items = state.items.filter((item) => item.id !== action.input.id);
  },
};
```

:::info Key Pattern: ID Generation
Notice that `addTodoItemOperation` uses `generateId()` from `document-model/core` to create a unique ID. This is the recommended pattern — the ID is generated in the reducer, not passed from the UI. This ensures consistent, unique IDs across all operations.
:::

### Advanced implementation (with statistics tracking)

:::info Advanced Feature
This section extends the basic reducers with statistics tracking, matching the advanced schema from the previous section. This demonstrates how to update computed/derived state alongside your primary data.
:::

For the advanced version with `stats`, we need to update the statistics whenever items are added, updated, or deleted:

```typescript
import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    // Generate a unique ID for the new todo item
    const id = generateId();
    
    // Update statistics
    state.stats.total += 1;
    state.stats.unchecked += 1;

    // Add the new item to the state
    state.items.push({
      id,
      text: action.input.text,
      checked: false, // New items always start as unchecked
    });
  },

  updateTodoItemOperation(state, action) {
    // Find the specific item we want to update
    const item = state.items.find((item) => item.id === action.input.id);

    if (!item) {
      throw new Error(`Item with id ${action.input.id} not found`);
    }

    // Update text if provided
    if (action.input.text !== undefined) {
      item.text = action.input.text;
    }

    // Handle checked status changes and update stats
    if (action.input.checked !== undefined && action.input.checked !== item.checked) {
      if (action.input.checked) {
        state.stats.unchecked -= 1;
        state.stats.checked += 1;
      } else {
        state.stats.unchecked += 1;
        state.stats.checked -= 1;
      }
      item.checked = action.input.checked;
    }
  },

  deleteTodoItemOperation(state, action) {
    // Find the item to determine its checked status for stats
    const item = state.items.find((item) => item.id === action.input.id);

    if (item) {
      // Update statistics
      state.stats.total -= 1;
      if (item.checked) {
        state.stats.checked -= 1;
      } else {
        state.stats.unchecked -= 1;
      }
    }

    // Remove the item from the list
    state.items = state.items.filter((item) => item.id !== action.input.id);
  },
};
```

### Common patterns explained

#### 1. Adding an item

```typescript
addTodoItemOperation(state, action) {
  const id = generateId();  // Generate unique ID
  state.items.push({ ...action.input, id, checked: false });
}
```

- We use `generateId()` to create a unique identifier
- We spread `action.input` to get the text, add the generated ID and default `checked: false`
- With Immer, this "mutation" is actually immutable

#### 2. Updating an item

```typescript
updateTodoItemOperation(state, action) {
  const item = state.items.find((item) => item.id === action.input.id);
  if (!item) return;
  
  item.text = action.input.text ?? item.text;
  item.checked = action.input.checked ?? item.checked;
}
```

- We find the item by ID
- We use nullish coalescing (`??`) to only update fields that were provided
- This allows partial updates (e.g., just changing `checked` without touching `text`)

#### 3. Deleting an item

```typescript
deleteTodoItemOperation(state, action) {
  state.items = state.items.filter((item) => item.id !== action.input.id);
}
```

- We use `filter` to create a new array without the deleted item
- Immer handles making this immutable

## Leveraging generated types

As highlighted in [Using the Document Model Generator](04-UseTheDocumentModelGenerator.md), `ph generate` produces TypeScript types for your state (e.g., `TodoListState`, `TodoItem`) and the inputs for your operations (e.g., `AddTodoItemInput`, `UpdateTodoItemInput`).

**Always use these generated types in your reducer implementations!**

```typescript
import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    // TypeScript knows action.input has { text: string }
    const id = generateId();
    state.items.push({ id, text: action.input.text, checked: false });
  },
  // ... other reducers
};
```

Using these types provides:

- **Compile-time safety**: Catch errors related to incorrect property names or data types before runtime.
- **Autocompletion and IntelliSense**: Improved developer experience in your IDE.
- **Clearer code**: Types serve as documentation for the expected data structures.

## Practical implementation: Writing the `TodoList` reducers

Now that you understand the principles, let's put them into practice by implementing the reducers for our `TodoList` document model.

<details>
<summary>Tutorial: Implementing the TodoList reducers</summary>

This tutorial assumes you have followed the steps in the previous chapters, especially using `ph generate TodoList.phd` to scaffold your document model's code.

### Implement the operation reducers

Navigate to `document-models/todo-list/src/reducers/todos.ts`. The generator will have created a skeleton file. Replace its contents with the following logic.

**Basic version (without stats):**

```typescript
import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    const id = generateId();
    state.items.push({ ...action.input, id, checked: false });
  },
  
  updateTodoItemOperation(state, action) {
    const item = state.items.find((item) => item.id === action.input.id);
    if (!item) return;
    
    item.text = action.input.text ?? item.text;
    item.checked = action.input.checked ?? item.checked;
  },
  
  deleteTodoItemOperation(state, action) {
    state.items = state.items.filter((item) => item.id !== action.input.id);
  },
};
```

**Advanced version (with stats):**

```typescript
import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    const id = generateId();
    
    state.stats.total += 1;
    state.stats.unchecked += 1;

    state.items.push({
      id,
      text: action.input.text,
      checked: false,
    });
  },

  updateTodoItemOperation(state, action) {
    const item = state.items.find((item) => item.id === action.input.id);
    if (!item) {
      throw new Error(`Item with id ${action.input.id} not found`);
    }

    if (action.input.text !== undefined) {
      item.text = action.input.text;
    }

    if (action.input.checked !== undefined && action.input.checked !== item.checked) {
      if (action.input.checked) {
        state.stats.unchecked -= 1;
        state.stats.checked += 1;
      } else {
        state.stats.unchecked += 1;
        state.stats.checked -= 1;
      }
      item.checked = action.input.checked;
    }
  },

  deleteTodoItemOperation(state, action) {
    const item = state.items.find((item) => item.id === action.input.id);

    if (item) {
      state.stats.total -= 1;
      if (item.checked) {
        state.stats.checked -= 1;
      } else {
        state.stats.unchecked -= 1;
      }
    }

    state.items = state.items.filter((item) => item.id !== action.input.id);
  },
};
```

</details>

## Reducers and the event sourcing model

Every time a reducer processes an operation and returns a new state, Powerhouse records the original operation (the "event") in an append-only log associated with the document instance. The current state of the document is effectively a "fold" or "reduction" of all past events, applied sequentially by the reducers.

This is why purity and immutability are so critical:

- **Purity** ensures that replaying the same sequence of events will always yield the exact same final state.
- **Immutability** ensures that each event clearly defines a discrete state transition, making it easy to audit changes and understand the document's history.

## Conclusion

Implementing document reducers is where you breathe life into your document model's specification. By adhering to the principles of purity and immutability, and by leveraging the type safety provided by Powerhouse's code generation, you can build predictable, testable, and maintainable business logic. These reducers form the immutable backbone of your document's state management, perfectly aligning with the event sourcing architecture that underpins Powerhouse.

With your reducers implemented, your document model is now functionally complete from a data manipulation perspective. The next chapter covers how to write tests for this logic to ensure its correctness and reliability.
