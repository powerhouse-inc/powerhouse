# Write document model tests

:::tip Tutorial Repository
📦 **Reference Code**: [step-4-implement-tests-for-todos-operations](https://github.com/powerhouse-inc/todo-tutorial/tree/step-4-implement-tests-for-todos-operations)

This step focuses on writing comprehensive tests for the reducers you implemented in the previous step.
:::

<details>
<summary>📖 How to use this tutorial</summary>

### Compare your tests

After writing tests:

```bash
# Compare your tests with the reference
git diff tutorial/step-4-implement-tests-for-todos-operations -- document-models/todo-list/src/tests/

# View the reference test implementation
git show tutorial/step-4-implement-tests-for-todos-operations:document-models/todo-list/src/tests/todos.test.ts
```

### Visual comparison with GitHub Desktop

After committing your work, compare visually:
1. **Branch** menu → **"Compare to Branch..."**
2. Select `tutorial/step-4-implement-tests-for-todos-operations`
3. Review differences in the visual interface

</details>

In order to make sure the operation reducers are working as expected, you need to write tests for them. When you generated your document model code, we created some boilerplate tests for you. Now we'll enhance them to properly verify our reducer logic.

## Understanding the generated test file

Navigate to `/document-models/todo-list/src/tests/todos.test.ts`. You will see that we have some basic "sanity check" style tests already. These make sure that your operations at least result in a valid document model state.

```typescript
import { describe, it, expect } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import {
  reducer,
  utils,
  isTodoListDocument,
  addTodoItem,
  AddTodoItemInputSchema,
  updateTodoItem,
  UpdateTodoItemInputSchema,
  deleteTodoItem,
  DeleteTodoItemInputSchema,
} from "todo-tutorial/document-models/todo-list";

describe("Todos Operations", () => {
  it("should handle addTodoItem operation", () => {
    // the `createDocument` utility function creates a new empty document
    const document = utils.createDocument();

    // generateMock creates an object with random values for each field
    const input = generateMock(AddTodoItemInputSchema());

    // call the reducer with the document and action
    const updatedDocument = reducer(document, addTodoItem(input));

    // validate the document conforms to the schema
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    // check the operation was recorded
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_TODO_ITEM");
  });
  
  it("should handle updateTodoItem operation", () => {
    // ... boilerplate test
  });
  
  it("should handle deleteTodoItem operation", () => {
    // ... boilerplate test
  });
});
```

## Enhance the tests

The boilerplate tests check that operations are applied, but they don't verify the **actual results**. Let's write more comprehensive tests.

### Test 1: Update the addTodoItem test

The add test is already fairly complete. We just need to add type annotations:

```typescript
it("should handle addTodoItem operation", () => {
  const document = utils.createDocument();
  // added-line
  const input: AddTodoItemInput = generateMock(AddTodoItemInputSchema());

  const updatedDocument = reducer(document, addTodoItem(input));
  expect(isTodoListDocument(updatedDocument)).toBe(true);

  expect(updatedDocument.operations.global).toHaveLength(1);
  expect(updatedDocument.operations.global[0].action.type).toBe("ADD_TODO_ITEM");
  expect(updatedDocument.operations.global[0].action.input).toStrictEqual(input);
  expect(updatedDocument.operations.global[0].index).toEqual(0);
});
```

### Test 2: Replace the updateTodoItem test

Delete the existing boilerplate and add two separate tests - one for updating text, one for updating the checked state:

```typescript
// removed-start
it("should handle updateTodoItem operation", () => {
  const document = utils.createDocument();
  const input = generateMock(UpdateTodoItemInputSchema());
  const updatedDocument = reducer(document, updateTodoItem(input));
  expect(isTodoListDocument(updatedDocument)).toBe(true);
  // ...
});
// removed-end
```

**Add the new test for updating text:**

```typescript
it("should handle updateTodoItem operation to update text", () => {
  // Create an existing item to update
  const mockItem = generateMock(TodoItemSchema());
  const input: UpdateTodoItemInput = generateMock(UpdateTodoItemInputSchema());
  
  // Set the input ID to match our existing item
  input.id = mockItem.id;
  const newText = "new text";
  input.text = newText;
  input.checked = undefined; // Don't change checked state
  
  // Create document with existing item
  const document = utils.createDocument({
    global: {
      items: [mockItem],
    },
  });

  const updatedDocument = reducer(document, updateTodoItem(input));
  expect(isTodoListDocument(updatedDocument)).toBe(true);

  // Verify operation was recorded
  expect(updatedDocument.operations.global).toHaveLength(1);
  expect(updatedDocument.operations.global[0].action.type).toBe("UPDATE_TODO_ITEM");
  
  // Verify state was updated correctly
  const updatedItem = updatedDocument.state.global.items.find(
    (item) => item.id === input.id,
  );
  expect(updatedItem?.text).toBe(newText);
  expect(updatedItem?.checked).toBe(mockItem.checked); // Unchanged
});
```

**Add the new test for updating checked state:**

```typescript
it("should handle updateTodoItem operation to update checked", () => {
  const mockItem = generateMock(TodoItemSchema());
  const input: UpdateTodoItemInput = generateMock(UpdateTodoItemInputSchema());
  
  input.id = mockItem.id;
  const newChecked = !mockItem.checked; // Toggle the checked state
  input.checked = newChecked;
  input.text = undefined; // Don't change text
  
  const document = utils.createDocument({
    global: {
      items: [mockItem],
    },
  });

  const updatedDocument = reducer(document, updateTodoItem(input));
  expect(isTodoListDocument(updatedDocument)).toBe(true);

  const updatedItem = updatedDocument.state.global.items.find(
    (item) => item.id === input.id,
  );
  expect(updatedItem?.text).toBe(mockItem.text); // Unchanged
  expect(updatedItem?.checked).toBe(newChecked);
});
```

### Test 3: Update the deleteTodoItem test

The boilerplate delete test passes even without an existing item to delete. Let's fix that:

```typescript
it("should handle deleteTodoItem operation", () => {
  // removed-start
  const document = utils.createDocument();
  const input = generateMock(DeleteTodoItemInputSchema());
  // removed-end
  // added-start
  // Create an existing item to delete
  const mockItem = generateMock(TodoItemSchema());
  const document = utils.createDocument({
    global: {
      items: [mockItem],
    },
  });
  const input: DeleteTodoItemInput = generateMock(DeleteTodoItemInputSchema());
  input.id = mockItem.id;
  // added-end
  
  const updatedDocument = reducer(document, deleteTodoItem(input));
  expect(isTodoListDocument(updatedDocument)).toBe(true);

  expect(updatedDocument.operations.global).toHaveLength(1);
  expect(updatedDocument.operations.global[0].action.type).toBe("DELETE_TODO_ITEM");
  expect(updatedDocument.operations.global[0].action.input).toStrictEqual(input);
  expect(updatedDocument.operations.global[0].index).toEqual(0);
  
  // added-start
  // Verify the item was actually removed
  const updatedItems = updatedDocument.state.global.items;
  expect(updatedItems).toHaveLength(0);
  // added-end
});
```

## Complete test file

Here's the complete test file with all updates. Don't forget to add the missing imports:

<details>
<summary>Complete todos.test.ts</summary>

```typescript
import { describe, it, expect } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import type {
  AddTodoItemInput,
  DeleteTodoItemInput,
  UpdateTodoItemInput,
} from "todo-tutorial/document-models/todo-list";
import {
  reducer,
  utils,
  isTodoListDocument,
  addTodoItem,
  AddTodoItemInputSchema,
  updateTodoItem,
  UpdateTodoItemInputSchema,
  deleteTodoItem,
  DeleteTodoItemInputSchema,
  TodoItemSchema,
} from "todo-tutorial/document-models/todo-list";

describe("Todos Operations", () => {
  it("should handle addTodoItem operation", () => {
    const document = utils.createDocument();
    const input: AddTodoItemInput = generateMock(AddTodoItemInputSchema());

    const updatedDocument = reducer(document, addTodoItem(input));
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_TODO_ITEM");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateTodoItem operation to update text", () => {
    const mockItem = generateMock(TodoItemSchema());
    const input: UpdateTodoItemInput = generateMock(UpdateTodoItemInputSchema());
    input.id = mockItem.id;
    const newText = "new text";
    input.text = newText;
    input.checked = undefined;
    
    const document = utils.createDocument({
      global: {
        items: [mockItem],
      },
    });

    const updatedDocument = reducer(document, updateTodoItem(input));
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("UPDATE_TODO_ITEM");
    
    const updatedItem = updatedDocument.state.global.items.find(
      (item) => item.id === input.id,
    );
    expect(updatedItem?.text).toBe(newText);
    expect(updatedItem?.checked).toBe(mockItem.checked);
  });

  it("should handle updateTodoItem operation to update checked", () => {
    const mockItem = generateMock(TodoItemSchema());
    const input: UpdateTodoItemInput = generateMock(UpdateTodoItemInputSchema());
    input.id = mockItem.id;
    const newChecked = !mockItem.checked;
    input.checked = newChecked;
    input.text = undefined;
    
    const document = utils.createDocument({
      global: {
        items: [mockItem],
      },
    });

    const updatedDocument = reducer(document, updateTodoItem(input));
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    const updatedItem = updatedDocument.state.global.items.find(
      (item) => item.id === input.id,
    );
    expect(updatedItem?.text).toBe(mockItem.text);
    expect(updatedItem?.checked).toBe(newChecked);
  });

  it("should handle deleteTodoItem operation", () => {
    const mockItem = generateMock(TodoItemSchema());
    const document = utils.createDocument({
      global: {
        items: [mockItem],
      },
    });
    
    const input: DeleteTodoItemInput = generateMock(DeleteTodoItemInputSchema());
    input.id = mockItem.id;
    
    const updatedDocument = reducer(document, deleteTodoItem(input));
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("DELETE_TODO_ITEM");
    
    const updatedItems = updatedDocument.state.global.items;
    expect(updatedItems).toHaveLength(0);
  });
});
```

</details>

:::tip Check your work

To make sure everything works as expected:

```bash
# Check types compile correctly
pnpm tsc

# Check linting passes
pnpm lint

# Run tests
pnpm test

# Compare with reference implementation
git diff tutorial/step-4-implement-tests-for-todos-operations -- document-models/todo-list/src/tests/
```

Expected test output:

```bash
 ✓ document-models/todo-list/src/tests/document-model.test.ts (3 tests) 1ms
 ✓ document-models/todo-list/src/tests/todos.test.ts (4 tests) 8ms

 Test Files  2 passed (2)
      Tests  7 passed (7)
```

:::

## Up next: Building the editor

In the next chapter, you'll learn how to implement a user interface (editor) for your document model so you can interact with it visually in Connect Studio.

