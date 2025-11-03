# Build a to-do list editor

:::tip Tutorial Repository
📦 **Reference Code**: 
- **Editor Scaffolding**: [step-5-generate-todo-list-document-editor](https://github.com/powerhouse-inc/todo-tutorial/tree/step-5-generate-todo-list-document-editor)
- **Complete Editor UI**: [step-6-add-basic-todo-editor-ui-components](https://github.com/powerhouse-inc/todo-tutorial/tree/step-6-add-basic-todo-editor-ui-components)

This tutorial covers two steps:
1. **Step 5**: Generating the editor template with `ph generate --editor`
2. **Step 6**: Building a complete, interactive UI with components for adding, editing, and deleting todos

Compare implementations: `git diff step-5-generate-todo-list-document-editor step-6-add-basic-todo-editor-ui-components`
:::

<details>
<summary>📖 How to use this tutorial</summary>

This tutorial shows building from **generated scaffolding** (step-5) to **complete UI** (step-6).

### Compare your generated editor

After running `ph generate --editor`:

```bash
# Compare generated scaffolding with step-5
git diff tutorial/step-5-generate-todo-list-document-editor -- editors/

# View the generated editor template
git show tutorial/step-5-generate-todo-list-document-editor:editors/todo-list-editor/editor.tsx
```

### Compare your custom components

After building your UI:

```bash
# Compare your complete editor with step-6
git diff tutorial/step-6-add-basic-todo-editor-ui-components -- editors/

# See what was added from scaffolding to complete UI
git diff tutorial/step-5-generate-todo-list-document-editor..tutorial/step-6-add-basic-todo-editor-ui-components
```

### Browse the complete implementation

Explore the production-ready component structure:

```bash
# List all components in step-6
git ls-tree -r --name-only tutorial/step-6-add-basic-todo-editor-ui-components editors/todo-list-editor/components/

# View a specific component
git show tutorial/step-6-add-basic-todo-editor-ui-components:editors/todo-list-editor/components/TodoList.tsx
```

</details>

In this chapter we will continue with the interface or editor implementation of the **To-do List** document model. This means you will create a simple user interface for the **To-do List** document model which will be used inside the Connect app to create, update and delete your ToDoList items.

## Generate the editor template

Run the command below to generate the editor template for the **To-do List** document model.  
This command reads the **To-do List** document model definition from the `document-models` folder and generates the editor template in the `editors/todo-list-editor` folder.

Notice the `--editor` flag which specifies the editor name, and the `--document-types` flag defines the document type `powerhouse/todo-list`.

```bash
ph generate --editor todo-list --document-types powerhouse/todo-list
```

Once complete, you'll have a new directory structure:

```
editors/todo-list-editor/
├── components/
│   └── EditName.tsx          # Auto-generated component for editing document name
├── editor.tsx                # Main editor component (to be customized)
└── module.ts                 # Editor module configuration
```

Navigate to the `editors/todo-list-editor/editor.tsx` file and open it in your editor. You'll see a basic template ready for customization.

### Editor implementation options

When building your editor component within the Powerhouse ecosystem, you have several options for styling, allowing you to leverage your preferred methods:

1.  **Default HTML Styling:** Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default styles offered through the boilerplate.
2.  **Tailwind CSS:** Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes for rapid, consistent styling without writing separate CSS files.
3.  **Custom CSS Files:** You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.

Connect Studio provides a dynamic local environment, by running `ph connect` to visualize your components instantly as you build them, regardless of the styling method you choose.  
Manual build steps are typically only needed when publishing packages.

## To-do List editor

We'll build the editor using a component-based approach for better organization and reusability. The complete implementation (step-6) includes separate components for different UI features.

### Component-based architecture

The final editor structure in step-6 includes:
- `TodoList.tsx` - Main container component
- `AddTodo.tsx` - Component for adding new todos
- `Todo.tsx` - Individual todo item component with edit/delete functionality
- `Todos.tsx` - List wrapper for rendering all todos
- `TodoListName.tsx` - Component for displaying/editing the list name
- `CloseButton.tsx` - Button to close the editor
- `UndoRedoButtons.tsx` - Navigation through operation history

### Simple editor implementation

For this tutorial, we'll create a simplified version. Replace the content of `editors/todo-list-editor/editor.tsx` with:

<details>
<summary>Complete ToDoList Editor Example (using Tailwind CSS)</summary>

```typescript
import { EditorProps } from 'document-model';
import {
    ToDoListState,
    ToDoListAction,
    ToDoListLocalState,
    ToDoItem,
    actions,
    ToDoListDocument,
} from '../../document-models/to-do-list/index.js';
import { useState } from 'react';

// EditorProps is a generic type that provides the document and a dispatch function.
// The dispatch function is used to send actions to the document's reducer to update the state.
export type IProps = EditorProps<ToDoListDocument>;

export default function Editor(props: IProps) {
    // Destructure document and dispatch from props.
    const { document, dispatch } = props;
    // Get the global state from the document. This state is shared across all editors of this document.
    const {
        state: { global: state },
    } = document;

    // React's useState hook is used for local component state.
    // This state is not shared with other components.
    // `todoItem` stores the text of the new to-do item being added.
    const [todoItem, setTodoItem] = useState('');
    // `editingItemId` stores the ID of the item currently being edited.
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    // `editedText` stores the text of the item while it's being edited.
    const [editedText, setEditedText] = useState('');

    return (
        <div className="p-4 font-sans max-w-lg mx-auto">
            <h1 className="text-2xl font-bold mb-4 text-center">To-do List</h1>
            <div className="w-96 mx-auto">
                <div className="flex mb-4">
                    <input
                        className="border border-gray-300 p-2 rounded-l-md flex-grow"
                        placeholder="Insert task here..."
                        value={todoItem}
                        onChange={e => setTodoItem(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                // Dispatch an action to add a new to-do item.
                                // `actions.addTodoItem` is an action creator from our document model.
                                dispatch(
                                    actions.addTodoItem({
                                        id: Math.random().toString(), // In a real app, use a more robust ID generation.
                                        text: todoItem,
                                    })
                                );
                                setTodoItem('');
                            }
                        }}
                    />
                    <button
                        className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-r-md"
                        onClick={() => {
                            // Also add item on button click.
                            dispatch(
                                actions.addTodoItem({
                                    id: Math.random().toString(),
                                    text: todoItem,
                                })
                            );
                            setTodoItem('');
                        }}
                    >
                        Add
                    </button>
                </div>
                <ul className="list-none p-0">
                    {/* Map over the items in the global state to render each to-do item. */}
                    {state.items.map((item: ToDoItem) => (
                        <li
                            key={item.id}
                            className="flex items-center p-2 relative border-b border-gray-200"
                        >
                            <input
                                type="checkbox"
                                checked={item.checked}
                                className="mr-3"
                                onChange={() => {
                                    // Dispatch an action to update the checked status of an item.
                                    dispatch(
                                        actions.updateTodoItem({
                                            id: item.id,
                                            checked: !item.checked,
                                        })
                                    );
                                }}
                            />
                            {/* Conditional rendering: show an input field if the item is being edited, otherwise show the text. */}
                            {editingItemId === item.id ? (
                                <input
                                    value={editedText}
                                    onChange={e =>
                                        setEditedText(e.target.value)
                                    }
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            // Dispatch an action to update the item's text.
                                            dispatch(
                                                actions.updateTodoItem({
                                                    id: item.id,
                                                    text: editedText,
                                                })
                                            );
                                            // Exit editing mode.
                                            setEditingItemId(null);
                                        }
                                    }}
                                    className="flex-grow"
                                    autoFocus // Automatically focus the input when it appears.
                                />
                            ) : (
                                <div className="flex items-center flex-grow gap-1">
                                    <span
                                        onClick={() => {
                                            // Enter editing mode when the text is clicked.
                                            setEditingItemId(item.id);
                                            setEditedText(item.text);
                                        }}
                                        className={`cursor-pointer ${
                                            item.checked
                                                ? 'line-through text-gray-500'
                                                : ''
                                        }`}
                                    >
                                        {item.text}
                                    </span>
                                    <span
                                        onClick={() =>
                                            dispatch(
                                                actions.deleteTodoItem({
                                                    id: item.id,
                                                })
                                            )
                                        }
                                        className="text-gray-400 cursor-pointer opacity-40 transition-all duration-200 text-base font-bold inline-flex items-center pl-1 hover:opacity-100 hover:text-red-500"
                                    >
                                        ×
                                    </span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
```

</details>

Now you can run the Connect app and see the **To-do List** editor in action.

```bash
ph connect
```

In Connect, in the bottom right corner you'll find a new Document Model that you can create: **To-do List**.  
Click on it to create a new To-do List document.

:::info
The editor will update dynamically, so you can play around with your editor styling while seeing your results appear in Connect Studio.
:::

Congratulations!
If you managed to follow this tutorial until this point, you have successfully implemented the **To-do List** document model with its reducer operations and editor.

## View the complete implementation

The tutorial repository's step-6 branch shows a production-ready implementation with:

**Component structure:**
```
editors/todo-list-editor/components/
├── TodoList.tsx          # Main orchestrating component
├── AddTodo.tsx           # Form for adding new todos
├── Todo.tsx              # Individual todo with inline editing
├── Todos.tsx             # List renderer
├── TodoListName.tsx      # Editable document name
├── CloseButton.tsx       # Editor close functionality
└── UndoRedoButtons.tsx   # Operation history navigation
```

**Key features demonstrated:**
- Modular component architecture
- Document model hooks (`useSelectedTodoListDocument`)
- Action dispatching (`addTodoItem`, `updateTodoItem`, `deleteTodoItem`)
- Inline editing with local state management
- Integration with document metadata (creation/modification times)

To explore the complete implementation:

```bash
# Browse all component files
git ls-tree -r --name-only tutorial/step-6-add-basic-todo-editor-ui-components editors/todo-list-editor/components/

# View a specific component
git show tutorial/step-6-add-basic-todo-editor-ui-components:editors/todo-list-editor/components/TodoList.tsx
```

### Up next: Mastery Track

In the [Mastery Track chapter: Document Model Creation](/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel) we guide you through the theoretics of the previous steps while creating a more advanced version of the To-do List.

You will learn:

- The in's & out's of a document model.
- How to use UI & Scalar components from the Document Engineering system.
- How to build Custom Drive Apps or Drive Explorers.
