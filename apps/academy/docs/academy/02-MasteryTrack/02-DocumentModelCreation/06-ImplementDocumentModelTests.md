# Implement document model tests

## Ensuring robustness and reliability

In the previous chapter, we implemented the core reducer logic for our document model. Now, we reach a critical stage that underpins the reliability and correctness of our entire model: **Implementing Document Model Tests**.

Testing is not an afterthought; it's an integral part of the development lifecycle, especially in systems like Powerhouse where data integrity and predictable state transitions are paramount. Well-crafted tests serve as a safety net, allowing you to refactor and extend your document model with confidence.

This document provides a practical, hands-on tutorial for testing the `TodoList` document model reducers you have just built.

## Practical implementation: Writing and running the TodoList tests

This tutorial assumes you have implemented the `TodoList` reducers as described in the previous chapter and that the code generator has created a test file skeleton at `document-models/todo-list/src/tests/todos.test.ts`.

<details>
<summary>Tutorial: Implementing and running the TodoList reducer tests</summary>

### 1. Implement the reducer tests

With the reducer logic in place, it's critical to test it. Navigate to the generated test file at `document-models/todo-list/src/tests/todos.test.ts` and replace its contents with comprehensive tests.

This suite tests each operation, verifying not only that the `items` array is correct, but also that the operation itself is recorded properly in the document's history.

**Basic tests (matching Get Started):**

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

    // Verify the operation was recorded
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

    // Verify the operation was recorded
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("UPDATE_TODO_ITEM");
    
    // Verify the state was updated correctly
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

    // Verify the operation was recorded
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("DELETE_TODO_ITEM");
    
    // Verify the item was removed from state
    const updatedItems = updatedDocument.state.global.items;
    expect(updatedItems).toHaveLength(0);
  });
});
```

**Advanced tests (with stats verification):**

:::info Advanced Feature
If you implemented the advanced version with statistics tracking, add these additional tests to verify the stats are updated correctly.
:::

```typescript
describe("Todos Operations with Stats", () => {
  it("should update stats when adding a todo item", () => {
    const document = utils.createDocument();
    const input = { text: "Buy milk" };

    const updatedDocument = reducer(document, addTodoItem(input));

    expect(updatedDocument.state.global.items).toHaveLength(1);
    expect(updatedDocument.state.global.stats.total).toBe(1);
    expect(updatedDocument.state.global.stats.unchecked).toBe(1);
    expect(updatedDocument.state.global.stats.checked).toBe(0);
  });

  it("should update stats when checking a todo item", () => {
    const document = utils.createDocument();
    
    // Add an item first
    const addedDocument = reducer(document, addTodoItem({ text: "Buy milk" }));
    const itemId = addedDocument.state.global.items[0].id;
    
    // Now check it
    const updatedDocument = reducer(
      addedDocument,
      updateTodoItem({ id: itemId, checked: true })
    );

    expect(updatedDocument.state.global.stats.total).toBe(1);
    expect(updatedDocument.state.global.stats.unchecked).toBe(0);
    expect(updatedDocument.state.global.stats.checked).toBe(1);
  });

  it("should update stats when deleting an unchecked todo item", () => {
    const document = utils.createDocument();
    
    // Add an item
    const addedDocument = reducer(document, addTodoItem({ text: "Buy milk" }));
    const itemId = addedDocument.state.global.items[0].id;
    
    // Delete it
    const updatedDocument = reducer(
      addedDocument,
      deleteTodoItem({ id: itemId })
    );

    expect(updatedDocument.state.global.items).toHaveLength(0);
    expect(updatedDocument.state.global.stats.total).toBe(0);
    expect(updatedDocument.state.global.stats.unchecked).toBe(0);
    expect(updatedDocument.state.global.stats.checked).toBe(0);
  });

  it("should update stats when deleting a checked todo item", () => {
    const document = utils.createDocument();
    
    // Add and check an item
    const addedDocument = reducer(document, addTodoItem({ text: "Buy milk" }));
    const itemId = addedDocument.state.global.items[0].id;
    const checkedDocument = reducer(
      addedDocument,
      updateTodoItem({ id: itemId, checked: true })
    );
    
    // Delete it
    const updatedDocument = reducer(
      checkedDocument,
      deleteTodoItem({ id: itemId })
    );

    expect(updatedDocument.state.global.items).toHaveLength(0);
    expect(updatedDocument.state.global.stats.total).toBe(0);
    expect(updatedDocument.state.global.stats.checked).toBe(0);
  });
});
```

### 2. Run the tests

Now, run the tests from your project's root directory to verify your implementation.

```bash
pnpm run test
```

Or with npm:

```bash
npm test
```

If all tests pass, you have successfully verified the core logic of your `TodoList` document model. This ensures that the reducers you wrote behave exactly as expected.

</details>

## Best practices for document model tests

While the tutorial provides a concrete example, keep these general best practices in mind when writing your tests:

- **Isolate Tests**: Each `it` block should ideally test one specific aspect or scenario. `beforeEach` is crucial for resetting state between tests.
- **Descriptive Names**: Name your `describe` and `it` blocks clearly so they explain what's being tested.
- **AAA Pattern (Arrange, Act, Assert)**:
  - **Arrange**: Set up the initial state and any required test data (e.g., using `utils.createDocument()` and defining `input` objects).
  - **Act**: Execute the operation by calling the `reducer` with an action from a `creator`.
  - **Assert**: Check if the outcome is as expected using `expect()`.
- **Test Immutability**: A key assertion is to ensure the state is not mutated directly. You can check that a new array or object was created: `expect(newState.items).not.toBe(oldState.items);`.
- **Cover Edge Cases**: Test what happens when an operation receives invalid input (e.g., trying to update an item that doesn't exist). Your test should confirm the reducer either throws an error or returns the state unchanged, depending on your implementation.
- **Run Tests Frequently**: Integrate testing into your development workflow. Run tests after making changes to ensure you haven't broken anything. The `pnpm run test` (or `npm test`) command is your friend.

## Conclusion: The payoff of diligent testing

Implementing comprehensive tests for your document model reducers is an investment that pays dividends in the long run. It leads to:

- **Higher Quality Models**: More reliable and robust document models with fewer bugs.
- **Increased Confidence**: Ability to make changes and refactor code without fear of breaking existing functionality.
- **Easier Debugging**: When tests fail, they pinpoint the exact operation and scenario that's problematic.
- **Better Collaboration**: Tests clarify the intended behavior of the document model for all team members.

By following the tutorial and applying these best practices, you can build a strong suite of tests that safeguard the integrity and functionality of your document models. This diligence is a hallmark of a "Mastery Track" developer, ensuring that the solutions you build are not just functional but also stable, maintainable, and trustworthy.

## Up next

In the next chapter of the Mastery Track - Building User Experiences you will learn how to implement an [editor](/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors) for your document model so you can see a simple user interface for the **TodoList** document model in action.

For a complete, working example, you can always have a look at the [Example TodoList Repository](/academy/MasteryTrack/DocumentModelCreation/ExampleToDoListRepository) which contains the full implementation of the concepts discussed in this Mastery Track.
