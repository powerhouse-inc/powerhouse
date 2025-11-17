# Step 2 — Implement the `TodoList` document model reducer operation handlers

## Adding the logic for handling operations with reducers

Your document model update's the state of a given document by applying a set of append-only actions. Once these have been applied to the document, we call them operations.

The document model does this with a reducer — a function which takes the existing state and a given action, and then returns the new state with the action applied.

## What we have so far

The operation handler logic for each module is found in `document-models/SOME-DOCUMENT-MODEL/src/reducers/SOME-MODULE-NAME.ts`.

So for our todos module, we will implement our handler logic in `document-models/todo-list/src/reducers/todos.ts`

When you generated your document model code, we created a boilerplate implementation of the reducer logic for each of the operations we defined in step 1. You will see that there are functions for handling each of the operations, but all they do is throw "not implemented" errors.

```ts
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

Let's add the handler logic for each operation in the same order we defined them in the previous step.

To handle the `addTodoItemOperation`, all we need to do is create an `id` for our new operation, and then push an object with that `id` and the rest of the action input into the `items` array in our state.

Update your `addTodoItemOperation` like so:

```diff
import type { TodoListTodosOperations } from "todo-tutorial/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
-  addTodoItemOperation(state, action) {
-    // TODO: Implement "addTodoItemOperation" reducer
-    throw new Error('Reducer "addTodoItemOperation" not yet implemented');
-  },
+ addTodoItemOperation(state, action) {
+    const id = generateId();
+    state.items.push({ ...action.input, id, checked: false });
+  },
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

Under the hood, we use a library for making the functions always create and return new copies of the state, i.e. they are always _immutable_. This is why you don't actually have to return your new state, the newly created copy of the state is used automatically.

The `updateTodoOperation` works in much the same way, except this time instead of creating a new `id`, we find the item in the items array which has the given id. Then we spread out the rest of the values we get from the action input, same as when creating.

Update your `updateTodoOperation` to be like so:

```diff
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
    }
};
```

```diff
export const todoListTodosOperations: TodoListTodosOperations = {
    addTodoItemOperation(state, action) {
      const id = generateId();
      state.items.push({ ...action.input, id, checked: false });
    },
-   updateTodoItemOperation(state, action) {
-       // TODO: Implement "updateTodoItemOperation" reducer
-       throw new Error('Reducer "updateTodoItemOperation" not yet implemented');
-   },
+    updateTodoItemOperation(state, action) {
+      const item = state.items.find((item) => item.id === action.input.id);
+      if (!item) return;
+      item.text = action.input.text ?? item.text;
+      item.checked = action.input.checked ?? item.checked;
+    },
    deleteTodoItemOperation(state, action) {
        // TODO: Implement "deleteTodoItemOperation" reducer
        throw new Error('Reducer "deleteTodoItemOperation" not yet implemented');
    }
};
```

The delete operation is the simplest of the three. All we need to do is filter the items array so that it no longer contains the item with the given id.

```diff
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
- deleteTodoItemOperation(state, action) {
-   state.items = state.items.filter((item) => item.id !== action.input.id);
- },
+ deleteTodoItemOperation(state, action) {
+   state.items = state.items.filter((item) => item.id !== action.input.id);
+ },
};
```

With that all done, your final result should look like this:

```ts
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

## Check your work

To make sure all works as expected, we should:

- check types
run: `pnpm tsc`

- check linting
run: `pnpm lint`

- check tests
run: `pnpm test`

- make sure your code matches the code in the completed step branch
run: `git diff your-branch-name step-2-complete-implemented-todo-list-document-model-reducer-operation-handlers`

### Up next: tests for our new operation handlers

Up next, you'll implement some custom tests to check the behavior of our new code.