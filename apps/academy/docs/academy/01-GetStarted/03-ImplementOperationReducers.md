# Implement the Document Model

In this section, we will implement and test the operation reducers for the **ToDoList** document model. For this, you have to export the document model specification from the Connect application and import it into your Powerhouse project directory. 

To export the document model specification, follow the steps in the [Define ToDoList Document Model](/academy/GetStarted/DefineToDoListDocumentModel) section.

## Understanding Reducers in Document Models

Reducers are a core concept in Powerhouse document models. They implement the state transition logic for each operation defined in your schema.

:::info
**Connection to Schema Definition Language (SDL)**: The reducers directly implement the operations you defined in your SDL. Remember how we defined `AddTodoItemInput`, `UpdateTodoItemInput`, and `DeleteTodoItemInput` in our schema?   
The reducers provide the actual implementation of what happens when those operations are performed.
:::

To import the document model specification into your Powerhouse project, you can either: 
- Copy and paste the file directly into the root of your Powerhouse project.
- Or drag and drop the file into the Powerhouse project directory in the VSCode editor as seen in the image below:

Either step will import the document model specification into your Powerhouse project.

![vscode image](./images/vscode.png)

## In your Project Directory

The next steps will take place in the VSCode editor. Make sure to have it open and the terminal window inside VSCode open as well. 


To write the operation reducers of the **ToDoList** document model, you need to generate the document model code from the document model specification file you have exported into the Powerhouse project directory.

To do this, run the following command in the terminal:

```bash
ph generate ToDoList.phdm.zip
```

Now you can navigate to `/document-models/to-do-list/src/reducers/to-do-list.ts` and start writing the operation reducers.

Open the `to-do-list.ts` file and you should see the code that needs to be filled for the three operations you have specified earlier. The image below shows the code that needs to be filled:

![to-do-list ts file](./images/reducers.png)

## Write the Operation Reducers

1. Copy and paste the code below into the `to-do-list.ts` file in the `reducers` folder.
2. Save the file.


<details>
<summary>Operation Reducers</summary>
```typescript
import { ToDoListToDoListOperations } from '../../gen/to-do-list/operations.js';

// REMARKS: This is our main reducer object that implements all operations defined in the schema.
// The ToDoListToDoListOperations type is auto-generated from our SDL and ensures type safety.
export const reducer: ToDoListToDoListOperations = {
  // REMARKS: The addTodoItemOperation adds a new item to our todolist.
  // - state: The current document state that we can modify
  // - action: Contains the operation type and input data from the client
  // - dispatch: Function to trigger additional operations (not used here)
  addTodoItemOperation(state, action, dispatch) {
    // REMARKS: While this looks like we're directly mutating state, Powerhouse
    // handles immutability behind the scenes, creating a new state object.
    state.items.push({
      id: action.input.id,      // Using the client-provided ID
      text: action.input.text,  // Setting the todo text from input
      checked: false,           // New items always start unchecked
    });
  },

  // REMARKS: The updateTodoItemOperation modifies an existing todo item.
  // It handles partial updates, allowing only specific fields to be updated.
  updateTodoItemOperation(state, action, dispatch) {
    // REMARKS: First find the item we want to update by its ID
    const item = state.items.find(item => item.id === action.input.id);
    
    // REMARKS: Proper error handling if item doesn't exist
    if (!item) {
      throw new Error(`Item with id ${action.input.id} not found`);
    }
    
    // REMARKS: We only update fields that were included in the input
    // This allows for partial updates (only update what was provided)
    if (action.input.text) {
      item.text = action.input.text;
    }
    if (typeof action.input.checked === 'boolean') {
      item.checked = action.input.checked;
    }
  },

  // REMARKS: The deleteTodoItemOperation removes an item from the list.
  // This showcases functional programming with array filters for immutable updates.
  deleteTodoItemOperation(state, action, dispatch) {
    // REMARKS: Create a new array containing only items that don't match the ID
    // This is a common pattern for immutable array updates in JavaScript
    state.items = state.items.filter(item => item.id !== action.input.id);
  },
};
```
</details>

## Write the Operation Reducers Tests

In order to make sure the operation reducers are working as expected, you need to write tests for them.

Navigate to `/document-models/to-do-list/src/reducers/tests/to-do-list.test.ts` and copy and paste the code below into the file. Save the file.

Here are the tests for the three operations implemented in the reducers file. This test file creates an empty ToDoList document model, then adds a todo item, updates it and deletes it.

<details>
<summary>Operation Reducers Tests</summary>
```typescript
import utils from '../../gen/utils';
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/creators';
import { ToDoListDocument } from '../../gen/types';

// REMARKS:
// These tests demonstrate the event sourcing principles of our document model.
// Each operation is recorded in the document's operations list and affects the state.

describe('Todolist Operations', () => {
    let document: ToDoListDocument;

    beforeEach(() => {
        // REMARKS: We start with a fresh, empty document for each test
        document = utils.createDocument();
    });

    it('should handle addTodoItem operation', () => {
        // REMARKS: We create an input object matching our AddTodoItemInput schema
        const input = { id: '1', text: 'Buy milk' };
        
        // REMARKS: We apply the operation to get a new document state
        // Note how we use the creators to generate the operation action
        const updatedDocument = reducer(document, creators.addTodoItem(input));

        // REMARKS: We verify that:
        // 1. The operation was recorded in the document's operation history
        // 2. The state was updated according to our reducer implementation
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_TODO_ITEM');
        expect(updatedDocument.state.global.items).toHaveLength(1);
        expect(updatedDocument.state.global.items[0].text).toBe('Buy milk');
    });

    it('should handle updateTodoItem operation', () => {
        // REMARKS: For update, we first need to add an item, then update it
        // This demonstrates the sequential application of operations
        const addInput = { id: '1', text: 'Buy milk' };
        const updateInput = { id: '1', text: 'Buy bread' };

        // REMARKS: Operations are applied in sequence, building up document state
        const createdDocument = reducer(document, creators.addTodoItem(addInput));
        const updatedDocument = reducer(createdDocument, creators.updateTodoItem(updateInput));

        // REMARKS: Now we have 2 operations in history, and the state reflects both
        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.state.global.items[0].text).toBe('Buy bread');
    });

    it('should handle deleteTodoItem operation', () => {
        // REMARKS: Similar pattern - add an item, then delete it
        const addInput = { id: '1', text: 'Buy milk' };
        const deleteInput = { id: '1' };

        const createdDocument = reducer(document, creators.addTodoItem(addInput));
        const updatedDocument = reducer(createdDocument, creators.deleteTodoItem(deleteInput));

        // REMARKS: After deletion, we still have 2 operations in history,
        // but the items array is now empty again in the final state
        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.state.global.items).toHaveLength(0);
    });
});
```
</details>

Now you can run the tests to make sure the operation reducers are working as expected.

```bash
pnpm run test
```

Output should be as follows:

```bash
 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  12:04:57
   Duration  417ms (transform 79ms, setup 0ms, collect 174ms, tests 12ms, environment 0ms, prepare 158ms)
```

If you got the same output, you have successfully implemented the operation reducers and tests for the **ToDoList** document model. Congratulations, you've successfully set up the backbone for a simple **ToDoList** document. 

## Up Next: ToDoListEditor
In the next chapter of this introduction track you will learn how to implement an editor for your document model so you can see a simple user interface for the **ToDoList** document model in action.