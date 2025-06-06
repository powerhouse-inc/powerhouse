# Implement Document Model Tests

## Ensuring Robustness and Reliability

In the previous sections, we've meticulously defined our document model's state schema, specified its operations, used the generator to scaffold our codebase, and implemented the core reducer logic. Now, we reach a critical stage that underpins the reliability and correctness of our entire document model: **Implementing Document Model Tests**.

Testing is not merely an afterthought; it's an integral part of the development lifecycle, especially in systems like Powerhouse where data integrity, predictable state transitions, and auditable histories are paramount. Well-crafted tests serve as a safety net, allowing you to refactor and extend your document model with confidence, ensuring that it behaves as expected under all conditions.

This document will provide a deep dive into testing Powerhouse document models, focusing on the testing of reducer logic, which forms the heart of your model's behavior.

## The Importance of Testing Document Model Reducers

Document model reducers, as explored in "[Implement Document Reducers](05-ImplementDocumentReducers.md)", are pure functions responsible for calculating the next state of a document based on its current state and a given operation. Their purity and deterministic nature make them inherently testable. Testing reducers thoroughly ensures:

1.  **Correctness of Business Logic**: Verifies that each operation transforms the document state according to the defined business rules.
2.  **State Immutability**: Confirms that reducers do not mutate the original state, a cornerstone of Powerhouse's event sourcing architecture.
3.  **Integrity of Operation History**: While reducers focus on state, tests can also implicitly verify that operations are being correctly structured for the event log (as seen in example tests in `01-GetStarted/03-ImplementOperationReducers.md`).
4.  **Regression Prevention**: Protects against accidental breakage of existing functionality when new features are added or existing code is refactored.
5.  **Living Documentation**: Well-written tests can serve as examples of how operations are intended to be used and how they affect the document state.

## Setting Up the Test Environment

Powerhouse projects, when initialized using `ph init` (as detailed in "[Standard Document Model Workflow](../01-BuilderEnvironment/02-StandardDocumentModelWorkflow.md)"), typically come pre-configured with a testing framework like Jest. You'll find that test files often end with `.test.ts` (e.g., `your-model-name.test.ts`) and are co-located with the code they test, often in a `tests/` subdirectory within the `src/reducers/` folder.

The Document Model Generator (`ph generate YourModelName.phdm.zip`) usually creates a skeleton test file for your reducers (e.g., `document-models/YourModelName/src/reducers/tests/your-model-name.test.ts`). This provides a great starting point.

Key tools and concepts you'll encounter in these test files include:

*   **`describe(name, fn)`**: Creates a block that groups together several related tests.
*   **`it(name, fn)`** or **`test(name, fn)`**: This is your actual test case.
*   **`beforeEach(fn)`**: A function that runs before each test case in a `describe` block. Useful for setting up a common initial state for each test.
*   **`expect(value)`**: Used with "matcher" functions to assert that a certain value meets expectations. Common matchers include `toBe()`, `toEqual()`, `toHaveLength()`, `toThrow()`, etc.

## Core Components for Testing Document Model Reducers

When testing your document model reducers, you'll primarily interact with artifacts generated by the Powerhouse Document Model Generator and the reducer logic you've written:

1.  **Initial Document State (`utils.createDocument()`):**
    *   The `gen/utils.ts` file (or similar) often exports a `createDocument()` function. This utility, derived from your state schema (including default values), is crucial for creating a fresh, predictable starting state for your document model instance before each test.
    *   Example: `document = utils.createDocument();`

2.  **Action Creators (`creators` or `operations`):**
    *   The `gen/operations.ts` or `gen/creators.ts` file exports action creator functions for each operation defined in your schema. Using these functions (e.g., `creators.addTodoItem(input)`) instead of manually constructing action objects is highly recommended because they ensure your actions are correctly typed and structured, reducing the chance of errors in your tests.
    *   Example: `const action = creators.addTodoItem({ id: '1', text: 'Test item' });`

3.  **The Main Reducer (`reducer`):**
    *   The primary export from your reducer implementation file (e.g., `document-models/YourModelName/src/reducers/your-model-name.ts`) is the main reducer object or function that combines all your individual operation handlers. This is what you'll call with the current state and an action to get the new state.
    *   In some generated setups (like the `ToDoList` example from `01-GetStarted`), there might be a top-level `reducer` function exported from `gen/reducer.ts` that wraps your custom reducer logic and handles the overall document structure (state, operations history).
    *   Example: `const updatedDocument = reducer(document, action);`

4.  **Generated Types (`types.ts`):**
    *   Using the TypeScript types from `gen/types.ts` (e.g., `ToDoListState`, `ToDoItem`, input types) in your test setup and assertions helps maintain type safety and clarity in your tests.

## Writing Effective Test Cases for Reducers

Let's draw inspiration from the `ToDoList` example tests found in `01-GetStarted/03-ImplementOperationReducers.md` and expand on the principles.

A typical test file structure:
```typescript
import utils from '../../gen/utils'; // For createDocument
import { reducer } from '../../gen/reducer'; // The main reducer
import * as creators from '../../gen/creators'; // Action creators
import { ToDoListDocument, ToDoListState, ToDoItem } from '../../gen/types'; // Your model's types

describe('ToDoList Document Model Operations', () => {
  let initialDocument: ToDoListDocument; // Or your specific document type

  beforeEach(() => {
    // Start with a fresh, empty document for each test
    initialDocument = utils.createDocument();
  });

  // Test suite for ADD_TODO_ITEM operation
  describe('addTodoItemOperation', () => {
    it('should add a new item to an empty list', () => {
      const input = { id: 'task1', text: 'Buy groceries' };
      const action = creators.addTodoItem(input);

      const updatedDocument = reducer(initialDocument, action);
      const state = updatedDocument.state.global; // Accessing the specific state slice

      expect(state.items).toHaveLength(1);
      expect(state.items[0]).toEqual({
        id: 'task1',
        text: 'Buy groceries',
        checked: false, // Assuming default
      });
      // Verify immutability: the new items array should be a different instance
      expect(state.items).not.toBe(initialDocument.state.global.items);
    });

    it('should add a new item to an existing list', () => {
      // First, add an initial item
      const firstItemInput = { id: 'task1', text: 'First task' };
      let currentDocument = reducer(initialDocument, creators.addTodoItem(firstItemInput));

      // Now, add the second item
      const secondItemInput = { id: 'task2', text: 'Second task' };
      const action = creators.addTodoItem(secondItemInput);
      currentDocument = reducer(currentDocument, action);

      const state = currentDocument.state.global;
      expect(state.items).toHaveLength(2);
      expect(state.items[1]).toEqual({
        id: 'task2',
        text: 'Second task',
        checked: false,
      });
    });
  });

  // Test suite for UPDATE_TODO_ITEM operation
  describe('updateTodoItemOperation', () => {
    let docWithItem: ToDoListDocument;
    const initialItemId = 'item-to-update';

    beforeEach(() => {
      // Setup: add an item that can be updated in subsequent tests
      const addAction = creators.addTodoItem({ id: initialItemId, text: 'Original Text' });
      docWithItem = reducer(initialDocument, addAction);
    });

    it('should update the text of an existing item', () => {
      const updateInput = { id: initialItemId, text: 'Updated Text' };
      const action = creators.updateTodoItem(updateInput);

      const updatedDocument = reducer(docWithItem, action);
      const item = updatedDocument.state.global.items.find(i => i.id === initialItemId);

      expect(item).toBeDefined();
      expect(item?.text).toBe('Updated Text');
      // The 'checked' status should remain unchanged if not provided
      expect(item?.checked).toBe(false);
      // Verify immutability for the updated item and the items array
      expect(updatedDocument.state.global.items).not.toBe(docWithItem.state.global.items);
      expect(item).not.toBe(docWithItem.state.global.items.find(i => i.id === initialItemId));
    });

    it('should update the checked status of an existing item', () => {
      const updateInput = { id: initialItemId, checked: true };
      const action = creators.updateTodoItem(updateInput);

      const updatedDocument = reducer(docWithItem, action);
      const item = updatedDocument.state.global.items.find(i => i.id === initialItemId);

      expect(item?.checked).toBe(true);
      // The 'text' should remain unchanged
      expect(item?.text).toBe('Original Text');
    });

    it('should update both text and checked status', () => {
      const updateInput = { id: initialItemId, text: 'New Text Again', checked: true };
      const action = creators.updateTodoItem(updateInput);

      const updatedDocument = reducer(docWithItem, action);
      const item = updatedDocument.state.global.items.find(i => i.id === initialItemId);

      expect(item?.text).toBe('New Text Again');
      expect(item?.checked).toBe(true);
    });

    it('should throw an error or not change state if item to update is not found', () => {
      const updateInput = { id: 'non-existent-id', text: 'Wont matter' };
      const action = creators.updateTodoItem(updateInput);

      // Depending on your reducer's error handling for "item not found":
      // Option 1: Reducer throws an error (as in 01-GetStarted/03-ImplementOperationReducers.md example)
      expect(() => reducer(docWithItem, action)).toThrowError('Item with id non-existent-id not found');
      
      // Option 2: Reducer returns original state (if it handles errors gracefully by not changing state)
      // const updatedDocument = reducer(docWithItem, action);
      // expect(updatedDocument.state.global).toEqual(docWithItem.state.global);
    });
  });

  // Test suite for DELETE_TODO_ITEM operation
  describe('deleteTodoItemOperation', () => {
    let docWithItems: ToDoListDocument;
    const item1Id = 'item1';
    const item2Id = 'item2';

    beforeEach(() => {
      // Setup: add multiple items
      const addAction1 = creators.addTodoItem({ id: item1Id, text: 'Item One' });
      let tempDoc = reducer(initialDocument, addAction1);
      const addAction2 = creators.addTodoItem({ id: item2Id, text: 'Item Two' });
      docWithItems = reducer(tempDoc, addAction2);
    });

    it('should delete an existing item', () => {
      const deleteInput = { id: item1Id };
      const action = creators.deleteTodoItem(deleteInput);

      const updatedDocument = reducer(docWithItems, action);
      const state = updatedDocument.state.global;

      expect(state.items).toHaveLength(1);
      expect(state.items.find(item => item.id === item1Id)).toBeUndefined();
      expect(state.items[0].id).toBe(item2Id);
      // Verify immutability
      expect(state.items).not.toBe(docWithItems.state.global.items);
    });

    it('should not change state if item to delete is not found', () => {
      const deleteInput = { id: 'non-existent-id' };
      const action = creators.deleteTodoItem(deleteInput);
      
      const updatedDocument = reducer(docWithItems, action);
      expect(updatedDocument.state.global.items).toHaveLength(2);
      expect(updatedDocument.state.global).toEqual(docWithItems.state.global); // Or check for array instance equality
    });
  });

  // Testing Operation History (as shown in 01-GetStarted/03-ImplementOperationReducers.md)
  it('should record operations in the document history', () => {
    const addAction = creators.addTodoItem({ id: 'hist1', text: 'History Test' });
    let doc = reducer(initialDocument, addAction);

    expect(doc.operations.global).toHaveLength(1);
    expect(doc.operations.global[0].type).toBe('ADD_TODO_ITEM'); // Ensure this matches actual operation type string

    const updateAction = creators.updateTodoItem({ id: 'hist1', checked: true });
    doc = reducer(doc, updateAction);

    expect(doc.operations.global).toHaveLength(2);
    expect(doc.operations.global[1].type).toBe('UPDATE_TODO_ITEM');
  });
});
```

### Key Assertions to Make:

1.  **State Changes**:
    *   Verify that the relevant parts of the state are updated correctly (e.g., an item is added to an array, a field is changed).
    *   Use `toEqual()` for deep equality checks on objects and arrays.
    *   Check array lengths, specific property values, etc.

2.  **Immutability**:
    *   **Crucial**: Always assert that your reducers return *new* state objects/arrays when changes occur, rather than mutating the original ones.
    *   For objects: `expect(newState).not.toBe(oldState);`
    *   For arrays: `expect(newState.items).not.toBe(oldState.items);`
    *   For modified items within an array: `expect(updatedItem).not.toBe(originalItem);`

3.  **Operation History (if applicable at this testing layer)**:
    *   As seen in `01-GetStarted/03-ImplementOperationReducers.md`, the top-level reducer provided by Powerhouse might also update an `operations` log in the document. If your tests involve this encompassing reducer, you can assert that operations are correctly recorded.
    *   `expect(updatedDocument.operations.global).toHaveLength(expectedCount);`
    *   `expect(updatedDocument.operations.global[index].type).toBe('EXPECTED_OPERATION_TYPE');`

4.  **Edge Cases and Error Handling**:
    *   Test what happens when an operation receives invalid input (e.g., trying to update/delete an item that doesn't exist).
    *   If your reducer is designed to throw errors, use `expect(() => reducer(...)).toThrowError('Expected error message');`.
    *   If it handles errors by returning the original state or a specific error state, test for that outcome.

## Best Practices for Document Model Tests

*   **Isolate Tests**: Each `it` block should ideally test one specific aspect or scenario. `beforeEach` can help reset state for this.
*   **Descriptive Names**: Name your `describe` and `it` blocks clearly so they explain what's being tested.
*   **AAA Pattern (Arrange, Act, Assert)**:
    *   **Arrange**: Set up the initial state and any required test data.
    *   **Act**: Execute the operation (call the reducer).
    *   **Assert**: Check if the outcome is as expected.
*   **Test Pure Logic**: Focus on testing the input/output behavior of your reducers. Avoid testing implementation details if possible.
*   **Cover All Operations**: Ensure every defined document operation has corresponding tests.
*   **Cover All State Transitions**: For each operation, test different scenarios that lead to different state changes or outcomes.
*   **Refactor Tests with Code**: As your reducer logic evolves, update your tests accordingly. Outdated tests are worse than no tests.
*   **Run Tests Frequently**: Integrate testing into your development workflow. Run tests after making changes to ensure you haven't broken anything. The `pnpm run test` command is your friend.

## Conclusion: The Payoff of Diligent Testing

Implementing comprehensive tests for your document model reducers is an investment that pays dividends in the long run. It leads to:

*   **Higher Quality Models**: More reliable and robust document models with fewer bugs.
*   **Increased Confidence**: Ability to make changes and refactor code without fear of breaking existing functionality.
*   **Easier Debugging**: When tests fail, they pinpoint the exact operation and scenario that's problematic.
*   **Better Collaboration**: Tests clarify the intended behavior of the document model for all team members.

By following the principles and practices outlined in this document, and by drawing on the generated code and examples provided by Powerhouse, you can build a strong suite of tests that safeguard the integrity and functionality of your document models. This diligence is a hallmark of a "Mastery Track" developer, ensuring that the solutions you build are not just functional but also stable, maintainable, and trustworthy.
