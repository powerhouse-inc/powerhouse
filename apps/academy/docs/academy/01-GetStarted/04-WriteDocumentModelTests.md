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
    // The `createDocument` utility function from your document model creates
    // a new empty document, i.e. one with your default initial state
    const document = utils.createDocument();

    // The generateMock function takes one of your generated input schemas
    // and creates an object populated with random values for each field
    const input = generateMock(AddTodoItemInputSchema());

    // We call your document model's reducer with the new document we just created
    // and the action we want to test, `addTodoItem` in this case.
    // The reducer returns a new object, which is the document with the action applied.
    // If successful, there will be an operation which corresponds to this action
    // in the updated document's operations list.
    const updatedDocument = reducer(document, addTodoItem(input));

    // When you generate a document model, we give you validation utilities like
    // `isTodoListDocument` which confirms the document is of the correct form
    // in a way that TypeScript recognizes
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    // At the start a document will have 0 operations, so after applying this action
    // there should now be one operation
    expect(updatedDocument.operations.global).toHaveLength(1);
    
    // The operation added to the list should correspond to the correct action type
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
  // We need there to already be a todo item in the document,
  // since we want to test updating an existing item
  const mockItem = generateMock(TodoItemSchema());

  // We also need to generate a mock input for the update operation we are testing
  const input: UpdateTodoItemInput = generateMock(UpdateTodoItemInputSchema());
  
  // Since the mocks are generated with random values, we need to set the `id`
  // on our mock input to match the `id` of the existing mock item
  input.id = mockItem.id;

  // We want to easily check if the item's text was updated to our new value,
  // so we assign a variable and use that for the mock input's text field
  const newText = "new text";
  input.text = newText;

  // We are only testing updating the text here, so we want the checked field
  // on the input to be undefined, i.e. it should not change anything on the existing item
  input.checked = undefined;
  
  // We can pass a different initial state to the `createDocument` utility,
  // so in this case we pass in an `items` array with our existing item already in it
  const document = utils.createDocument({
    global: {
      items: [mockItem],
    },
  });

  // Create an updated document by applying the reducer with the action and input
  const updatedDocument = reducer(document, updateTodoItem(input));

  // Use our validator to check that the document conforms to the document model schema
  expect(isTodoListDocument(updatedDocument)).toBe(true);

  // There should now be one operation in the operations list
  expect(updatedDocument.operations.global).toHaveLength(1);
  expect(updatedDocument.operations.global[0].action.type).toBe("UPDATE_TODO_ITEM");
  
  // Find the updated item in the items list by its `id`
  const updatedItem = updatedDocument.state.global.items.find(
    (item) => item.id === input.id,
  );

  // The item's text should now be updated to be our new text
  expect(updatedItem?.text).toBe(newText);

  // The item's `checked` field should be unchanged
  expect(updatedItem?.checked).toBe(mockItem.checked);
});
```

**Add the new test for updating checked state:**

```typescript
it("should handle updateTodoItem operation to update checked", () => {
  // Generate a mock existing item
  const mockItem = generateMock(TodoItemSchema());

  // Generate a mock input
  const input: UpdateTodoItemInput = generateMock(UpdateTodoItemInputSchema());
  
  // Set the mock input's `id` to the mock item's `id`
  input.id = mockItem.id;

  // We want the new `checked` field value to be the opposite of the
  // randomly generated value from the mock
  const newChecked = !mockItem.checked;
  input.checked = newChecked;

  // Leave the `text` field unchanged
  input.text = undefined;
  
  // Create a document with the existing item in it
  const document = utils.createDocument({
    global: {
      items: [mockItem],
    },
  });

  // Apply the reducer with the action and the mock input
  const updatedDocument = reducer(document, updateTodoItem(input));

  // Validate your document
  expect(isTodoListDocument(updatedDocument)).toBe(true);

  // Get the updated item by its `id`
  const updatedItem = updatedDocument.state.global.items.find(
    (item) => item.id === input.id,
  );

  // The item's `text` field should remain unchanged
  expect(updatedItem?.text).toBe(mockItem.text);

  // The item's `checked` field should be updated to our new checked value
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

In the next chapter, you'll learn how to implement a user interface (editor) for your document model so you can interact with it visually. 

