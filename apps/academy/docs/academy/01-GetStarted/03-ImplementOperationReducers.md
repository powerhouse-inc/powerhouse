# Implement the document model reducers

:::tip Tutorial Repository
📦 **Reference Code**: [step-3-implement-reducer-operation-handlers](https://github.com/powerhouse-inc/todo-tutorial/tree/step-3-implement-reducer-operation-handlers)

This step focuses on implementing the reducer logic for add, update, and delete operations.
:::

<details>
<summary>📖 How to use this tutorial</summary>

### Compare your reducer implementation

After implementing your reducers:

```bash
# Compare your reducers with the reference
git diff tutorial/step-3-implement-reducer-operation-handlers -- document-models/todo-list/src/reducers/

# View the reference reducer implementation
git show tutorial/step-3-implement-reducer-operation-handlers:document-models/todo-list/src/reducers/todos.ts
```

### Visual comparison with GitHub Desktop

After committing your work, compare visually:
1. **Branch** menu → **"Compare to Branch..."**
2. Select `tutorial/step-3-implement-reducer-operation-handlers`
3. Review differences in the visual interface

### If you get stuck

View or reset to a specific step:

```bash
# View the reducer code
git show tutorial/step-3-implement-reducer-operation-handlers:document-models/todo-list/src/reducers/todos.ts

# Reset to this step (WARNING: loses your changes)
git reset --hard tutorial/step-3-implement-reducer-operation-handlers
```

</details>

In this section, we will implement the operation reducers for the **To-do List** document model. In the previous step Vetra imported our document specification and scaffolded our directory through code generation. If not, you can revisit the [Define TodoList Document Model](/academy/GetStarted/DefineToDoListDocumentModel) section.

## Understanding reducers in document models

Reducers are a core concept in Powerhouse document models. They implement the state transition logic for each operation defined in your schema.

:::info
**Connection to schema definition language (SDL)**: The reducers directly implement the operations you defined in your SDL. Remember how we defined `AddTodoItemInput`, `UpdateTodoItemInput`, and `DeleteTodoItemInput` in our schema?  
The reducers provide the actual implementation of what happens when those operations are performed.
:::

## Explore the generated reducer file

Navigate to `/document-models/todo-list/src/reducers/todos.ts` and open it. You should see scaffolding code that needs to be filled for the three operations you specified:

```typescript
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    // TODO: Implement "addTodoItemOperation" reducer
    throw new Error('Reducer "addTodoItemOperation" not yet implemented');
  },
  updateTodoItemOperation(state, action) {
    // TODO: Implement "updateTodoItemOperation" reducer
    throw new Error('Reducer "updateTodoItemOperation" not yet implemented');
  },
  deleteTodoItemOperation(state, action) {
    // TODO: Implement "deleteTodoItemOperation" reducer
    throw new Error('Reducer "deleteTodoItemOperation" not yet implemented');
  },
};
```

## Implement the operation reducers

Let's implement each reducer one by one.

### Step 1: Add the import

First, add the `generateId` import at the top of the file:

```typescript
// added-line
import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";
```

### Step 2: Implement addTodoItemOperation

Replace the boilerplate `addTodoItemOperation` with the actual implementation:

```typescript
export const todoListTodosOperations: TodoListTodosOperations = {
  // removed-start
  addTodoItemOperation(state, action) {
    // TODO: Implement "addTodoItemOperation" reducer
    throw new Error('Reducer "addTodoItemOperation" not yet implemented');
  },
  // removed-end
  // added-start
  addTodoItemOperation(state, action) {
    const id = generateId();
    state.items.push({ ...action.input, id, checked: false });
  },
  // added-end
  updateTodoItemOperation(state, action) {
    // ...
  },
  deleteTodoItemOperation(state, action) {
    // ...
  },
};
```

**What's happening here:**
- We generate a unique ID using `generateId()` from `document-model/core`
- We push a new item to the `items` array with the input text, new ID, and `checked: false`
- Under the hood, Powerhouse uses Immer.js, so this "mutation" is actually immutable

### Step 3: Implement updateTodoItemOperation

Replace the boilerplate `updateTodoItemOperation`:

```typescript
  // removed-start
  updateTodoItemOperation(state, action) {
    // TODO: Implement "updateTodoItemOperation" reducer
    throw new Error('Reducer "updateTodoItemOperation" not yet implemented');
  },
  // removed-end
  // added-start
  updateTodoItemOperation(state, action) {
    const item = state.items.find((item) => item.id === action.input.id);
    if (!item) return;
    item.text = action.input.text ?? item.text;
    item.checked = action.input.checked ?? item.checked;
  },
  // added-end
```

**What's happening here:**
- We find the item by its ID
- We return early if the item is not found
- We use nullish coalescing (`??`) to only update fields that are provided

### Step 4: Implement deleteTodoItemOperation

Replace the boilerplate `deleteTodoItemOperation`:

```typescript
  // removed-start
  deleteTodoItemOperation(state, action) {
    // TODO: Implement "deleteTodoItemOperation" reducer
    throw new Error('Reducer "deleteTodoItemOperation" not yet implemented');
  },
  // removed-end
  // added-start
  deleteTodoItemOperation(state, action) {
    state.items = state.items.filter((item) => item.id !== action.input.id);
  },
  // added-end
```

**What's happening here:**
- We filter out the item with the matching ID
- This creates a new array without the deleted item

## Complete reducer file

Here's the complete implementation:

<details>
<summary>Complete todos.ts</summary>

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

</details>

:::tip Check your work

To make sure everything works as expected:

```bash
# Check types compile correctly
pnpm tsc

# Check linting passes
pnpm lint

# Compare with reference implementation
git diff tutorial/step-3-implement-reducer-operation-handlers -- document-models/todo-list/src/reducers/
```

:::

## Up next: Writing tests

In the next chapter, you'll write comprehensive tests to verify your reducer implementations work correctly.
