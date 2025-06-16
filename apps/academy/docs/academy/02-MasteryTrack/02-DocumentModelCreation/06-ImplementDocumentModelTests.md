# Implement Document Model Tests

## Ensuring Robustness and Reliability

In the previous chapter, we implemented the core reducer logic for our document model. Now, we reach a critical stage that underpins the reliability and correctness of our entire model: **Implementing Document Model Tests**.

Testing is not an afterthought; it's an integral part of the development lifecycle, especially in systems like Powerhouse where data integrity and predictable state transitions are paramount. Well-crafted tests serve as a safety net, allowing you to refactor and extend your document model with confidence.

This document provides a practical, hands-on tutorial for testing the `ToDoList` document model reducers you have just built.

## Practical Implementation: Writing and Running the ToDoList Tests

This tutorial assumes you have implemented the `ToDoList` reducers as described in the previous chapter and that the code generator has created a test file skeleton at `document-models/to-do-list/src/reducers/tests/to-do-list.test.ts`.

<details>
<summary>Tutorial: Implementing and Running the `ToDoList` Reducer Tests</summary>

### 1. Implement the Reducer Tests

With the reducer logic in place, it's critical to test it. Navigate to the generated test file at `document-models/to-do-list/src/reducers/tests/to-do-list.test.ts` and replace its contents with the following test suite.

This suite tests each operation, verifying not only that the `items` array is correct, but also that our `stats` object is updated as expected and that the operation itself is recorded properly in the document's history.

```typescript
import utils from '../../gen/utils.js';
import { reducer } from '../../gen/reducer.js';
import * as creators from '../../gen/creators.js';
import { ToDoListDocument } from '../../gen/types.js';

describe('Todolist Operations', () => {
    let document: ToDoListDocument;

    beforeEach(() => {
        // REMARKS: We start with a fresh, empty document for each test.
        // The `createDocument` utility initializes the state with an empty 'items' array
        // and a 'stats' object with all counts set to 0.
        document = utils.createDocument();
    });

    it('should handle addTodoItem operation', () => {
        const input = { id: '1', text: 'Buy milk' };
        
        // REMARKS: We apply the 'addTodoItem' operation.
        const updatedDocument = reducer(document, creators.addTodoItem(input));

        // REMARKS: We verify the operation was recorded in the document's history.
        // Powerhouse records every operation in an array.
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_TODO_ITEM');
        // REMARKS: We also check that the input data and index are recorded correctly.
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);

        // REMARKS: Finally, we verify the state was updated according to our reducer logic.
        expect(updatedDocument.state.global.items).toHaveLength(1);
        expect(updatedDocument.state.global.stats.total).toBe(1);
        expect(updatedDocument.state.global.stats.unchecked).toBe(1);
    });

    it('should handle updateTodoItem operation', () => {
        // REMARKS: For an update, we first need to add an item.
        const addInput = { id: '1', text: 'Buy milk' };
        const updateInput = { id: '1', checked: true }; // We'll test checking the item.

        // REMARKS: Operations are applied sequentially to build up document state.
        const createdDocument = reducer(document, creators.addTodoItem(addInput));
        const updatedDocument = reducer(createdDocument, creators.updateTodoItem(updateInput));

        // REMARKS: Now we should have 2 operations in the history.
        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.operations.global[1].type).toBe('UPDATE_TODO_ITEM');
        expect(updatedDocument.operations.global[1].input).toStrictEqual(updateInput);
        
        // REMARKS: We check that the state reflects the update, including our stats.
        expect(updatedDocument.state.global.items[0].checked).toBe(true);
        expect(updatedDocument.state.global.stats.total).toBe(1);
        expect(updatedDocument.state.global.stats.unchecked).toBe(0);
        expect(updatedDocument.state.global.stats.checked).toBe(1);
    });

    it('should handle deleteTodoItem operation', () => {
        const addInput = { id: '1', text: 'Buy milk' };
        const deleteInput = { id: '1' };

        const createdDocument = reducer(document, creators.addTodoItem(addInput));
        const updatedDocument = reducer(createdDocument, creators.deleteTodoItem(deleteInput));

        // REMARKS: After deletion, we still have 2 operations in history,
        // but the items array is now empty and the stats are back to zero.
        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.operations.global[1].type).toBe('DELETE_TODO_ITEM');
        expect(updatedDocument.state.global.items).toHaveLength(0);
        expect(updatedDocument.state.global.stats.total).toBe(0);
        expect(updatedDocument.state.global.stats.unchecked).toBe(0);
    });
});
```

### 2. Run the Tests

Now, run the tests from your project's root directory to verify your implementation.

```bash
pnpm run test
```

If all tests pass, you have successfully verified the core logic of your `ToDoList` document model. This ensures that the reducers you wrote behave exactly as expected.

</details>

## Best Practices for Document Model Tests

While the tutorial provides a concrete example, keep these general best practices in mind when writing your tests:

*   **Isolate Tests**: Each `it` block should ideally test one specific aspect or scenario. `beforeEach` is crucial for resetting state between tests.
*   **Descriptive Names**: Name your `describe` and `it` blocks clearly so they explain what's being tested.
*   **AAA Pattern (Arrange, Act, Assert)**:
    *   **Arrange**: Set up the initial state and any required test data (e.g., using `utils.createDocument()` and defining `input` objects).
    *   **Act**: Execute the operation by calling the `reducer` with an action from a `creator`.
    *   **Assert**: Check if the outcome is as expected using `expect()`.
*   **Test Immutability**: A key assertion is to ensure the state is not mutated directly. You can check that a new array or object was created: `expect(newState.items).not.toBe(oldState.items);`.
*   **Cover Edge Cases**: Test what happens when an operation receives invalid input (e.g., trying to update an item that doesn't exist). Your test should confirm the reducer either throws an error or returns the state unchanged, depending on your implementation.
*   **Run Tests Frequently**: Integrate testing into your development workflow. Run tests after making changes to ensure you haven't broken anything. The `pnpm run test` command is your friend.

## Conclusion: The Payoff of Diligent Testing

Implementing comprehensive tests for your document model reducers is an investment that pays dividends in the long run. It leads to:

*   **Higher Quality Models**: More reliable and robust document models with fewer bugs.
*   **Increased Confidence**: Ability to make changes and refactor code without fear of breaking existing functionality.
*   **Easier Debugging**: When tests fail, they pinpoint the exact operation and scenario that's problematic.
*   **Better Collaboration**: Tests clarify the intended behavior of the document model for all team members.

By following the tutorial and applying these best practices, you can build a strong suite of tests that safeguard the integrity and functionality of your document models. This diligence is a hallmark of a "Mastery Track" developer, ensuring that the solutions you build are not just functional but also stable, maintainable, and trustworthy.

## Up Next
In the next chapter of the Mastery Track you will learn how to implement an editor for your document model so you can see a simple user interface for the **ToDoList** document model in action.
For a complete, working example, you can always refer to the [Example ToDoList Repository](./ExampleToDoListRepository.md) which contains the full implementation of the concepts discussed in this Mastery Track.