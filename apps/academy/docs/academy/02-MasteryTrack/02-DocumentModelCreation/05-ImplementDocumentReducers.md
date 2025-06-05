# Implement Document Reducers

## The Heart of Document Logic

In our journey through Powerhouse Document Model creation, we've defined the "what" – the structure of our data ([State Schema](02-SpecifyTheStateSchema.md)) and the ways it can be changed ([Document Operations](03-SpecifyDocumentOperations.md)). We've also seen how the [Document Model Generator](04-UseTheDocumentModelGenerator.md) translates these specifications into a coded scaffold. Now, we arrive at the "how": implementing **Document Reducers**.

Reducers are the core logic units of your document model. They are the functions that take the current state of your document and an operation (an "action"), and then determine the *new* state of the document. They are the embodiment of your business rules and the engine that drives state transitions in a predictable, auditable, and immutable way.

## Recap: The Journey to Reducer Implementation

Before diving into the specifics of writing reducers, let's recall the preceding steps:

1.  **State Schema Definition**: You designed the GraphQL `type` definitions for your document's data structure (e.g., `ToDoListState`, `ToDoItem`).
2.  **Document Operation Specification**: You defined the GraphQL `input` types that specify the parameters for each allowed modification to your document (e.g., `AddTodoItemInput`, `UpdateTodoItemInput`). These were then associated with named operations (e.g., `ADD_TODO_ITEM`) in the Connect application.
3.  **Code Generation**: You used `ph generate <YourModelName.phdm.zip>` to create the necessary TypeScript types, action creators, and, crucially, the skeleton file for your reducers (typically `document-models/<YourModelName>/src/reducers/<your-model-name>.ts`).

This generated reducer file is our starting point. It will contain function stubs or an object structure expecting your reducer implementations, all typed according to your schema.

## What is a Reducer? The Core Principles

In the context of Powerhouse and inspired by patterns like Redux, a reducer is a **pure function** with the following signature (conceptually):

`(currentState, action) => newState`

Let's break down its components and principles:

*   **`currentState`**: This is the complete, current state of your document model instance before the operation is applied. It's crucial to treat this as **immutable**.
*   **`action`**: This is an object describing the operation to be performed. It typically has:
    *   A `type` property: A string identifying the operation (e.g., `'ADD_TODO_ITEM'`).
    *   An `input` property (or similar, like `payload`): An object containing the data necessary for the operation, matching the GraphQL `input` type you defined (e.g., `{ id: '1', text: 'Buy groceries' }` for `AddTodoItemInput`).
*   **`newState`**: The reducer must return a *new* state object representing the state after the operation has been applied. If the operation does not result in a state change, the reducer should return the `currentState` object itself.

### Key Principles Guiding Reducer Implementation:

1.  **Purity**:
    *   **Deterministic**: Given the same `currentState` and `action`, a reducer must *always* produce the same `newState`.
    *   **No Side Effects**: Reducers must not perform any side effects. This means no API calls, no direct DOM manipulation, no `Math.random()` (unless seeded deterministically for specific testing scenarios), and no modification of variables outside their own scope. Their sole job is to compute the next state.

2.  **Immutability**:
    *   **Never Mutate `currentState`**: You must never directly modify the `currentState` object or any of its nested properties.
    *   **Always Return a New Object for Changes**: If the state changes, you must create and return a brand new object. If the state does not change, you return the original `currentState` object.
    *   This is fundamental to Powerhouse's event sourcing architecture, enabling time travel, efficient change detection, and a clear audit trail. We'll explore techniques for immutability shortly.

3.  **Single Source of Truth**: The document state managed by reducers is the single source of truth for that document instance. All UI rendering and data queries are derived from this state.

4.  **Delegation to Specific Operation Handlers**:
    While you can write one large reducer that uses a `switch` statement or `if/else if` blocks based on `action.type`, Powerhouse's generated code typically encourages a more modular approach. You'll often implement a separate function for each operation, which are then combined into a main reducer object or map. The `ph generate` command usually sets up this structure for you. For example, in your `document-models/to-do-list/src/reducers/to-do-list.ts`, you'll find an object structure like this:

    ```typescript
    // Example structure from 01-GetStarted/03-ImplementOperationReducers.md
    import { ToDoListToDoListOperations } from '../../gen/to-do-list/operations.js'; // Generated type for operations
    import { ToDoListState } from '../../gen/types.js'; // Generated type for state

    export const reducer: ToDoListToDoListOperations = {
      addTodoItemOperation(state: ToDoListState, action, dispatch) {
        // Your logic for ADD_TODO_ITEM
        // ...
        return newState;
      },
      updateTodoItemOperation(state: ToDoListState, action, dispatch) {
        // Your logic for UPDATE_TODO_ITEM
        // ...
        return newState;
      },
      deleteTodoItemOperation(state: ToDoListState, action, dispatch) {
        // Your logic for DELETE_TODO_ITEM
        // ...
        return newState;
      },
      // ... other operations
    };
    ```
    The `ToDoListToDoListOperations` type (or similar, depending on your model name) is generated by Powerhouse and ensures your reducer object correctly implements all defined operations. The `state` and `action` parameters within these methods will also be strongly typed based on your schema.

    The `dispatch` parameter is an advanced feature allowing a reducer to trigger subsequent operations. While powerful for complex workflows, it's often not needed for basic operations and can be ignored if unused.

## Implementing Reducer Logic: A Practical Guide

Let's use our familiar `ToDoList` example (as detailed in `01-GetStarted/03-ImplementOperationReducers.md`) to illustrate common patterns.

Assume our `ToDoListState` is:
```typescript
interface ToDoItem {
  id: string;
  text: string;
  checked: boolean;
}

interface ToDoListState {
  items: ToDoItem[];
}
```

And our action creators (from `../../gen/creators` or `../../gen/operations.js`) provide actions like:
*   `actions.addTodoItem({ id: 'some-id', text: 'New Task' })`
*   `actions.updateTodoItem({ id: 'item-id', text: 'Updated Task Text', checked: true })`
*   `actions.deleteTodoItem({ id: 'item-id' })`

### 1. Adding an Item (e.g., `addTodoItemOperation`)

To add a new item to the `items` array immutably:

```typescript
addTodoItemOperation(state: ToDoListState, action: /* AddTodoItemActionType */ any, dispatch) {
  const newItem: ToDoItem = {
    id: action.input.id,
    text: action.input.text,
    checked: false, // New items default to unchecked
  };

  // Return a new state object
  return {
    ...state, // Copy all existing properties from the current state
    items: [...state.items, newItem], // Create a new items array: spread existing items, add the new one
  };
}
```
**Explanation**:
*   We use the spread operator (`...state`) to copy top-level properties from the old state into the new state object.
*   For the `items` array, we create a *new* array by spreading the existing `state.items` and then appending the `newItem`.

### 2. Updating an Item (e.g., `updateTodoItemOperation`)

To update an existing item in the `items` array immutably:

```typescript
updateTodoItemOperation(state: ToDoListState, action: /* UpdateTodoItemActionType */ any, dispatch) {
  const { id, text, checked } = action.input;

  // Return a new state object
  return {
    ...state,
    items: state.items.map(item => {
      if (item.id === id) {
        // This is the item to update. Return a *new* item object.
        return {
          ...item, // Copy existing properties of the item
          // Update only fields that are provided in the action input
          ...(text !== undefined && { text: text }),
          ...(checked !== undefined && { checked: checked }),
        };
      }
      // This is not the item we're looking for, return it unchanged.
      return item;
    }),
  };
}
```
**Explanation**:
*   We use the `map` array method, which always returns a *new* array.
*   For the item that matches `action.input.id`, we create a new item object using the spread operator (`...item`) and then overwrite the properties (`text`, `checked`) that are present in `action.input`.
*   The conditional spread (`...(condition && { property: value })`) is a concise way to only include a property in the new object if its corresponding input value is provided. This elegantly handles partial updates.
*   If an item doesn't match the ID, it's returned as is.

**Error Handling Note**: In a real application, you might want to add a check to see if an item with `action.input.id` actually exists. If not, you could throw an error or handle it according to your application's requirements:
```typescript
// Inside updateTodoItemOperation, before returning:
const itemToUpdate = state.items.find(item => item.id === action.input.id);
if (!itemToUpdate) {
  // Option 1: Throw an error (Powerhouse runtime might catch this)
  throw new Error(`Item with id ${action.input.id} not found.`);
  // Option 2: Return current state (no change)
  // return state;
}
// ... proceed with map
```

### 3. Deleting an Item (e.g., `deleteTodoItemOperation`)

To remove an item from the `items` array immutably:

```typescript
deleteTodoItemOperation(state: ToDoListState, action: /* DeleteTodoItemActionType */ any, dispatch) {
  const { id } = action.input;

  // Return a new state object
  return {
    ...state,
    items: state.items.filter(item => item.id !== id), // Create a new array excluding the item to delete
  };
}
```
**Explanation**:
*   We use the `filter` array method, which returns a *new* array containing only the elements for which the callback function returns `true`.

## Leveraging Generated Types

As highlighted in [Using the Document Model Generator](04-UseTheDocumentModelGenerator.md), `ph generate` produces TypeScript types for your state (e.g., `ToDoListState`, `ToDoItem`) and the inputs for your operations (e.g., `AddTodoItemInput`, `UpdateTodoItemInput`).

**Always use these generated types in your reducer implementations!**

```typescript
import {
  ToDoListState,
  AddTodoItemInput, // Generated input type
  // ... other types
} from '../../gen/types.js';
import { ToDoListToDoListOperations } from '../../gen/to-do-list/operations.js'; // Generated operations type

// Define the type for the action more explicitly if needed, or rely on inferred types
// from ToDoListToDoListOperations. For complex actions, defining specific action types can be beneficial.
// For example:
// interface AddTodoItemAction {
//   type: 'ADD_TODO_ITEM'; // Or the specific string constant used by the action creator
//   input: AddTodoItemInput;
// }

export const reducer: ToDoListToDoListOperations = {
  addTodoItemOperation(state: ToDoListState, action: { input: AddTodoItemInput /* plus type property */ }, dispatch) {
    // Now 'action.input.text' and 'action.input.id' are type-checked
    const newItem = {
      id: action.input.id,
      text: action.input.text,
      checked: false,
    };
    return {
      ...state,
      items: [...state.items, newItem],
    };
  },
  // ... other reducers
};
```
Using these types provides:
*   **Compile-time safety**: Catch errors related to incorrect property names or data types before runtime.
*   **Autocompletion and IntelliSense**: Improved developer experience in your IDE.
*   **Clearer code**: Types serve as documentation for the expected data structures.

## Testing Your Reducers

Reducers, being pure functions, are inherently easy to test. For each reducer:
1.  Set up an initial state.
2.  Create an action object (ideally using the generated action creators from `../../gen/creators.js` or `../../gen/operations.js`).
3.  Call the reducer function with the initial state and the action.
4.  Assert that the returned new state is what you expect it to be.
5.  Crucially, also assert that the *original* state object was not modified.

The `01-GetStarted/03-ImplementOperationReducers.md` document provides excellent examples of reducer tests:

```typescript
// Example from 01-GetStarted/03-ImplementOperationReducers.md (simplified)
import utils from '../../gen/utils'; // For createDocument
import { reducer } from '../../gen/reducer'; // The combined reducer
import * as creators from '../../gen/creators'; // Action creators
import { ToDoListDocument, ToDoListState } from '../../gen/types';

describe('Todolist Operations', () => {
  let document: ToDoListDocument; // Assuming ToDoListDocument wraps ToDoListState

  beforeEach(() => {
    document = utils.createDocument(); // Gets initial state
  });

  it('should handle addTodoItem operation', () => {
    const input = { id: '1', text: 'Buy milk' };
    const action = creators.addTodoItem(input); // Use action creator

    // Assuming your main reducer takes the whole document and action
    const updatedDocument = reducer(document, action);

    expect(updatedDocument.state.global.items).toHaveLength(1);
    expect(updatedDocument.state.global.items[0].text).toBe('Buy milk');
    // Also check that document.state.global.items is different from updatedDocument.state.global.items (immutability)
  });
});
```

The generator typically creates a test file skeleton (e.g., `document-models/<YourModelName>/src/reducers/tests/<your-model-name>.test.ts`) to get you started. **Thoroughly testing your reducers is paramount for a robust document model.**

## Reducers and the Event Sourcing Model

Every time a reducer processes an operation and returns a new state, Powerhouse records the original operation (the "event") in an append-only log associated with the document instance. The current state of the document is effectively a "fold" or "reduction" of all past events, applied sequentially by the reducers.

This is why purity and immutability are so critical:
*   **Purity** ensures that replaying the same sequence of events will always yield the exact same final state.
*   **Immutability** ensures that each event clearly defines a discrete state transition, making it easy to audit changes and understand the document's history.

## Conclusion

Implementing document reducers is where you breathe life into your document model's specification. By adhering to the principles of purity and immutability, and by leveraging the type safety provided by Powerhouse's code generation, you can build predictable, testable, and maintainable business logic. These reducers form the immutable backbone of your document's state management, perfectly aligning with the event sourcing architecture that underpins Powerhouse.

With your reducers implemented and tested, your document model is now functionally complete from a data manipulation perspective. The next stages often involve building user interfaces or integrations that interact with this model by dispatching the operations you've now so carefully implemented.
