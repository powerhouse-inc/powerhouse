# Step 3 — Adding our own tests for the document model actions

Similarly to the operation handler logic, when you add a new module to your document model, we generate some boilerplate tests for your code.

Take a look in `document-models/todo-list/src/tests/todos.test.ts`

You will see that we have some basic "sanity check" style tests for you already. These make sure that your operations are at least able to result in a valid document model state. You should copy these boilerplate checks in your other tests to ensure that your outputs are valid.

```ts
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

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
    // the `createDocument` utility function from your document model creates
    // an a new empty document, i.e. one with your default initial state
    const document = utils.createDocument();

    // the generate mock function takes one of your generated input schemas
    // and creates an object populated with random values for each field
    const input = generateMock(AddTodoItemInputSchema());

    // we call your document model's reducer with the new document we just created
    // and the action we want to test, `addTodoItem` in this case
    // the reducer returns a new object, which is the document with the action applied
    // if successful, there will be an operation which corresponds to this action
    // in the updated document's operations list
    const updatedDocument = reducer(document, addTodoItem(input));

    // when you generate a document model, we give you some validation utilities like
    // `isTodoListDocument` which confirms the document is of the correct form in a way
    // that typescript recognizes
    expect(isTodoListDocument(updatedDocument)).toBe(true);

    // at the start a document will have 0 operations, so after applying this action
    // there should now be one operation
    expect(updatedDocument.operations.global).toHaveLength(1);

    // the operation added to the list should correspond to the correct action type
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_TODO_ITEM",
    );

    // the operation added should have used the correct input
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );

    // the index of the operation should be 0, since it is the first and only operation
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle updateTodoItem operation", () => {
    // ...
  });
  it("should handle deleteTodoItem operation", () => {
    // ...
  });
});
```

Since testing the `addTodoItemOperation` is such a simple case, we have not added further testing here. You are welcome to add a more test cases for it if you want.

## Tests for update operations

### Test updating the todo item text

Let's add some more sophisticated tests for our `updateTodoItem` operation. We want to know that we can update todos successfully, and that we we do so it only changes the values we want to change, while leaving the rest as is.

Delete the existing "should handle updateTodoItem operation" test.

```typescript
// removed-start
it("should handle updateTodoItem operation", () => {
  const document = utils.createDocument();
  const input = generateMock(UpdateTodoItemInputSchema());
  const updatedDocument = reducer(document, updateTodoItem(input));
  expect(isTodoListDocument(updatedDocument)).toBe(true);
  expect(updatedDocument.operations.global).toHaveLength(1);
  expect(updatedDocument.operations.global[0].action.type).toBe(
    "UPDATE_TODO_ITEM",
  );
  expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
    input,
  );
  expect(updatedDocument.operations.global[0].index).toEqual(0);
});
// removed-end
```

Let's test that the text of a todo item is updated correctly first. Put this code in the place where you just deleted the existing test case:

```ts
  it("should handle updateTodoItem operation to update text", () => {
    // we need there to already be a todo item in the document,
    // since we want to test updating an existing document
    const mockItem = generateMock(UpdateTodoItemInputSchema());

    // we also need to generate a mock input for the update operation we are testing
    const input: UpdateTodoItemInput = generateMock(
      UpdateTodoItemInputSchema(),
    );

    // since the mocks are generated with random values, we need to set the `id` on our mock input
    // to match the `id` of the existing mock input
    input.id = mockItem.id;

    // we want to easily check if the item's text was updated to be our new value,
    // so we assign a variable and use that for the mock input's text field
    const newText = "new text";
    input.text = newText;

    // we are only testing updating the text here, so we want the checked field on the input
    // to be undefined, i.e. it should not change anything on the existing item
    input.checked = undefined;

    // we can pass a different initial state to the `createDocument` utility,
    // so in this case we pass in an `items` array with our existing item already in it
    const document = utils.createDocument({
      global: {
        items: [mockItem as TodoItem],
      },
    });

    /* The following checks are copied from the boilerplate */

    // create an updated document by applying the reducer with the action and input
    const updatedDocument = reducer(document, updateTodoItem(input));

    // there should now be one operation in the operations list
    expect(updatedDocument.operations.global).toHaveLength(1);

    // the operation applied should correspond to an action of the correct type
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO_ITEM",
    );

    // the operation applied should have used the correct input
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );

    // the operation applied should be the first operation in the list
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    /* The following checks are unique to this test case */

    // find the updated item in the items list by its `id`
    const updatedItem = updatedDocument.state.global.items.find(
      (item) => item.id === input.id,
    );

    // the item's text should now be updated to be our new text
    expect(updatedItem?.text).toBe(newText);

    // the item's `checked` field should be unchanged.
    expect(updatedItem?.checked).toBe(mockItem.checked);
  });
```

#### Check your work

Running `pnpm tsc && pnpm lint && pnpm test` should pass

### Test updating the todo item checked state

Now let's do the same thing, but for the checked state of an item. This test is essentially just the same as the above, but we update the `checked` field while leaving the `text` field `undefined`.

Add this code below the test case we just added:

```ts
  it("should handle updateTodoItem operation to update checked", () => {
    // generate a mock existing item
    const mockItem = generateMock(UpdateTodoItemInputSchema());

    // generate a mock input
    const input: UpdateTodoItemInput = generateMock(
      UpdateTodoItemInputSchema(),
    );

    // set the mock input's `id` to the mock item's `id`
    input.id = mockItem.id;

    // we want the new `checked` field value to be the opposite of the randomly generated value from the mock
    const newChecked = !mockItem.checked;
    input.checked = newChecked;

    // leave the `text` field unchanged
    input.text = undefined;

    // create a document with the existing item in it
    const document = utils.createDocument({
      global: {
        items: [mockItem as TodoItem],
      },
    });

    // apply the reducer with the action and the mock input
    const updatedDocument = reducer(document, updateTodoItem(input));

    /* The following checks are copied from the boilerplate */

    // check your operations
    expect(updatedDocument.operations.global).toHaveLength(1);

    // check the operation's action type
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO_ITEM",
    );

    // check the operation's input
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );

    // check the operation's index
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    /* The following checks are unique to this test case */

    // get the updated item by it's `id`
    const updatedItem = updatedDocument.state.global.items.find(
      (item) => item.id === input.id,
    );

    // the item's `text` field should remain unchanged
    expect(updatedItem?.text).toBe(mockItem.text);

    // the item's `checked` field should be updated to our new checked value
    expect(updatedItem?.checked).toBe(newChecked);
  });
  ```

#### Check your work

Running `pnpm tsc && pnpm lint && pnpm test` should pass

## Test for deleting todo items

You will have seen that the tests for the `deleteTodoItem` operation passed, even though we didn't set up an existing item to delete. This is because the boilerplate just checks that the operation was applied with the correct inputs, which it technically was. Checking that it actually had the _result_ we want is our job.

Update the `deleteTodoItem` operation test case to also create an existing item and then check that is was actually deleted:

```typescript
  it("should handle deleteTodoItem operation", () => {
    // generate a mock existing item
    const mockItem = generateMock(UpdateTodoItemInputSchema());

    const document = utils.createDocument({
      global: {
        items: [mockItem as TodoItem],
      },
    });

    const input = generateMock(DeleteTodoItemInputSchema());
    input.id = mockItem.id;

    const updatedDocument = reducer(document, deleteTodoItem(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "DELETE_TODO_ITEM",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    const updatedItems = updatedDocument.state.global.items;
    expect(updatedItems).toHaveLength(0);
  });
```

#### Check your work

Running `pnpm tsc && pnpm lint && pnpm test` should pass

## Final result

After these updates, your `document-models/todo-list/src/tests/todos.test.ts` file should look like this:

```ts
import { generateMock } from "@powerhousedao/codegen";
import { describe, expect, it } from "vitest";
import {
  reducer,
  utils,
  isTodoListDocument,
  addTodoItem,
  updateTodoItem,
  deleteTodoItem,
  AddTodoItemInputSchema,
  UpdateTodoItemInputSchema,
  DeleteTodoItemInputSchema,
  type UpdateTodoItemInput,
  type TodoItem,
} from "todo-tutorial/document-models/todo-list";

describe("TodosOperations", () => {
  it("should handle addTodoItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddTodoItemInputSchema());

    const updatedDocument = reducer(document, addTodoItem(input));

    expect(isTodoListDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_TODO_ITEM",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateTodoItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(UpdateTodoItemInputSchema());

    const updatedDocument = reducer(document, updateTodoItem(input));

    expect(isTodoListDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO_ITEM",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateTodoItem operation to update text", () => {
    // we need there to already be a todo item in the document,
    // since we want to test updating an existing document
    const mockItem = generateMock(UpdateTodoItemInputSchema());

    // we also need to generate a mock input for the update operation we are testing
    const input: UpdateTodoItemInput = generateMock(
      UpdateTodoItemInputSchema(),
    );

    // since the mocks are generated with random values, we need to set the `id` on our mock input
    // to match the `id` of the existing mock input
    input.id = mockItem.id;

    // we want to easily check if the item's text was updated to be our new value,
    // so we assign a variable and use that for the mock input's text field
    const newText = "new text";
    input.text = newText;

    // we are only testing updating the text here, so we want the checked field on the input
    // to be undefined, i.e. it should not change anything on the existing item
    input.checked = undefined;

    // we can pass a different initial state to the `createDocument` utility,
    // so in this case we pass in an `items` array with our existing item already in it
    const document = utils.createDocument({
      global: {
        items: [mockItem as TodoItem],
      },
    });

    /* The following checks are copied from the boilerplate */

    // create an updated document by applying the reducer with the action and input
    const updatedDocument = reducer(document, updateTodoItem(input));

    // there should now be one operation in the operations list
    expect(updatedDocument.operations.global).toHaveLength(1);

    // the operation applied should correspond to an action of the correct type
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO_ITEM",
    );

    // the operation applied should have used the correct input
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );

    // the operation applied should be the first operation in the list
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    /* The following checks are unique to this test case */

    // find the updated item in the items list by its `id`
    const updatedItem = updatedDocument.state.global.items.find(
      (item) => item.id === input.id,
    );

    // the item's text should now be updated to be our new text
    expect(updatedItem?.text).toBe(newText);

    // the item's `checked` field should be unchanged.
    expect(updatedItem?.checked).toBe(mockItem.checked);
  });

  it("should handle updateTodoItem operation to update checked", () => {
    // generate a mock existing item
    const mockItem = generateMock(UpdateTodoItemInputSchema());

    // generate a mock input
    const input: UpdateTodoItemInput = generateMock(
      UpdateTodoItemInputSchema(),
    );

    // set the mock input's `id` to the mock item's `id`
    input.id = mockItem.id;

    // we want the new `checked` field value to be the opposite of the randomly generated value from the mock
    const newChecked = !mockItem.checked;
    input.checked = newChecked;

    // leave the `text` field unchanged
    input.text = undefined;

    // create a document with the existing item in it
    const document = utils.createDocument({
      global: {
        items: [mockItem as TodoItem],
      },
    });

    // apply the reducer with the action and the mock input
    const updatedDocument = reducer(document, updateTodoItem(input));

    /* The following checks are copied from the boilerplate */

    // check your operations
    expect(updatedDocument.operations.global).toHaveLength(1);

    // check the operation's action type
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO_ITEM",
    );

    // check the operation's input
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );

    // check the operation's index
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    /* The following checks are unique to this test case */

    // get the updated item by it's `id`
    const updatedItem = updatedDocument.state.global.items.find(
      (item) => item.id === input.id,
    );

    // the item's `text` field should remain unchanged
    expect(updatedItem?.text).toBe(mockItem.text);

    // the item's `checked` field should be updated to our new checked value
    expect(updatedItem?.checked).toBe(newChecked);
  });

  it("should handle deleteTodoItem operation", () => {
    // generate a mock existing item
    const mockItem = generateMock(UpdateTodoItemInputSchema());

    const document = utils.createDocument({
      global: {
        items: [mockItem as TodoItem],
      },
    });

    const input = generateMock(DeleteTodoItemInputSchema());
    input.id = mockItem.id;

    const updatedDocument = reducer(document, deleteTodoItem(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "DELETE_TODO_ITEM",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    const updatedItems = updatedDocument.state.global.items;
    expect(updatedItems).toHaveLength(0);
  });
});

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
run: `git diff your-branch-name step-3-complete-implemented-tests-for-todo-operations`

### Up next: generating an editor for our `TodoList` documents

Up next, we'll generate a boilerplate document editor for our `TodoList` documents.