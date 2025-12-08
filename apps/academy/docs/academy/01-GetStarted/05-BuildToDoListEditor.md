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

### Visual comparison with GitHub Desktop

After committing your editor code:
1. **Branch** menu → **"Compare to Branch..."**
2. Select `tutorial/step-5-generate-todo-list-document-editor` or `tutorial/step-6-add-basic-todo-editor-ui-components`
3. See all your custom components vs. the reference implementation

See step 1 for detailed GitHub Desktop instructions.

</details>

In this chapter we will continue with the interface or editor implementation of the **To-do List** document model. This means you will create a simple user interface for the **To-do List** document model which will be used inside the Connect app to create, update and delete your ToDoList items.

## Add a document editor specification in Vetra Studio. 

Go back to Vetra Studio and click the 'Add new specification' button in the User Experiences column under 'Editors'. This will create an editor template for your document model. 

Give the editor the name `todo-list-editor` and select the correct document model. In our case that's the `powerhouse/todo-list`

### Editor implementation options

When building your editor component within the Powerhouse ecosystem, you have several options for styling, allowing you to leverage your preferred methods:

1.  **Default HTML Styling:** Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default styles offered through the boilerplate.
2.  **Tailwind CSS:** Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes for rapid, consistent styling without writing separate CSS files.
3.  **Custom CSS Files:** You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.

Vetra Studio Preview provides a dynamic local environment, by running `ph vetra --watch` you can visualize your components instantly as you build them, regardless of the styling method you choose.  
Manual build steps are typically only needed when publishing packages.

## Build the editor with components

We'll build the editor using a component-based approach for better organization and reusability. We'll create separate components for different UI features, making the code more maintainable and easier to understand.

### Component-based architecture

The editor structure we'll build includes:
- `editor.tsx` - Main editor wrapper (imports TodoList)
- `TodoList.tsx` - Main container component that orchestrates all other components
- `AddTodo.tsx` - Form component for adding new todos
- `Todo.tsx` - Individual todo item component with edit/delete functionality
- `Todos.tsx` - List wrapper component for rendering all todos

:::tip
The tutorial repository (step-6) includes additional components like `TodoListName`, `CloseButton`, and `UndoRedoButtons`. We'll focus on the core components here, but you can explore the complete implementation using the git commands shown above.
:::

### Step 1: Update the main editor file

First, update `editors/todo-list-editor/editor.tsx` to import and render the main `TodoList` component:

```tsx
// removed-line
import { EditTodoListName } from "./components/EditName.js";
// added-line
import { TodoList } from "./components/TodoList.js";

/** Editor component for the Todo List document type */
export function Editor() {
  return (
    <div className="py-4 px-8">
      // removed-line
      <EditTodoListName />
      // added-line
      <TodoList />
    </div>
  );
}
```

### Step 2: Create the TodoList container component

Create `editors/todo-list-editor/components/TodoList.tsx`. This is the main orchestrator that brings together all child components:

```tsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { TodoListName } from "./TodoListName.js";
import { Todos } from "./Todos.js";
import { AddTodo } from "./AddTodo.js";

/** Displays the selected todo list */
export function TodoList() {
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  const todos = selectedTodoList.state.global.items;

  return (
    <div>
      <section className="mb-4">
        <TodoListName />
      </section>
      <section className="mb-4">
        <Todos todos={todos} />
      </section>
      <section>
        <AddTodo />
      </section>
    </div>
  );
}
```

:::info Key Concept: useSelectedTodoListDocument hook
The `useSelectedTodoListDocument` hook is generated by the Powerhouse CLI. It provides:
1. The current document state (`selectedTodoList`)
2. A dispatch function to send actions to the reducer

This hook connects your React components to the document model's state and operations.
:::

### Step 3: Create the AddTodo form component

Create `editors/todo-list-editor/components/AddTodo.tsx` to handle adding new todo items:

```tsx
import type { FormEventHandler } from "react";
import { addTodoItem } from "todo-tutorial/document-models/todo-list";
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";

/** Component for adding a new todo item to the selected todo list */
export function AddTodo() {
  // The hooks for getting documents also return a dispatch function
  // for dispatching actions to modify the document.
  // This is the same pattern you will have seen in React's `useReducer` hook,
  // except you don't need to pass the initial state.
  // The document we are working with _is_ the initial state.
  const [todoList, dispatch] = useSelectedTodoListDocument();

  if (!todoList) return null;

  const onSubmitAddTodo: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const addTodoInput = form.elements.namedItem("addTodo") as HTMLInputElement;
    const text = addTodoInput.value;
    if (!text) return;

    // Dispatch the addTodoItem action - this will call the reducer
    // we implemented earlier and update the document state
    dispatch(addTodoItem({ text }));

    form.reset();
  };

  return (
    <form onSubmit={onSubmitAddTodo} className="flex mx-auto min-w-fit gap-2">
      <input
        className="py-1 px-2 grow min-w-fit placeholder:text-gray-600 rounded border border-gray-600 text-gray-800"
        type="text"
        name="addTodo"
        placeholder="What needs to be done?"
        autoFocus
      />
      <button
        type="submit"
        className="text-gray-600 rounded border border-gray-600 px-3 py-1"
      >
        Add
      </button>
    </form>
  );
}
```

**What's happening here:**
- We use a form with `onSubmit` handler for better UX (Enter key support)
- We extract the text value from the input field
- We dispatch the `addTodoItem` action (generated from our SDL)
- We reset the form after submission

### Step 4: Create the Todos list component

Create `editors/todo-list-editor/components/Todos.tsx` to render the list of todos:

```tsx
import type { TodoItem } from "todo-tutorial/document-models/todo-list";
import { Todo } from "./Todo.js";

type Props = {
  todos: TodoItem[];
};

/** Shows a list of the todo items in the selected todo list */
export function Todos({ todos }: Props) {
  const hasTodos = todos.length > 0;

  if (!hasTodos) {
    return <p>Start adding things to your todo list</p>;
  }

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <Todo todo={todo} />
        </li>
      ))}
    </ul>
  );
}
```

**What's happening here:**
- We accept `todos` as a prop (passed from `TodoList` parent)
- We show a helpful message if the list is empty
- We map over todos and render a `Todo` component for each item

### Step 5: Create the Todo item component

Create `editors/todo-list-editor/components/Todo.tsx` for individual todo items with edit and delete functionality:

```tsx
import {
  useState,
  type ChangeEventHandler,
  type FormEventHandler,
  type MouseEventHandler,
} from "react";
import {
  deleteTodoItem,
  updateTodoItem,
} from "todo-tutorial/document-models/todo-list";
import type { TodoItem } from "todo-tutorial/document-models/todo-list";
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";

type Props = {
  todo: TodoItem;
};

/** Displays a single todo item in the selected todo list
 *
 * Allows checking/unchecking the todo item.
 * Allows editing the todo item text.
 * Allows deleting the todo item.
 */
export function Todo({ todo }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Even though this component is for a single todo item and not the whole list,
  // we can use the exact same hook for dispatching updates to it.
  // The dispatch function works for any action supported by a TodoList document.
  const [todoList, dispatch] = useSelectedTodoListDocument();

  if (!todoList) return null;

  const todoId = todo.id;
  const todoText = todo.text;
  const todoChecked = todo.checked;

  const onSubmitUpdateTodoText: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const textInput = form.elements.namedItem("todoText") as HTMLInputElement;
    const text = textInput.value;
    if (!text) return;
    
    // We can use the dispatch function for any of the actions
    // supported by a TodoList document
    dispatch(updateTodoItem({ id: todo.id, text }));
    setIsEditing(false);
  };

  const onChangeTodoChecked: ChangeEventHandler<HTMLInputElement> = (event) => {
    dispatch(
      updateTodoItem({
        id: todo.id,
        checked: event.target.checked,
      }),
    );
  };

  const onClickDeleteTodo: MouseEventHandler<HTMLButtonElement> = () => {
    dispatch(deleteTodoItem({ id: todoId }));
  };

  const onClickEditTodo: MouseEventHandler<HTMLButtonElement> = () => {
    setIsEditing(true);
  };

  const onClickCancelEditTodo: MouseEventHandler<HTMLButtonElement> = () => {
    setIsEditing(false);
  };

  if (isEditing)
    return (
      <form
        className="flex gap-2 items-center justify-between"
        onSubmit={onSubmitUpdateTodoText}
      >
        <input
          className="p-1 grow"
          type="text"
          name="todoText"
          defaultValue={todoText}
          autoFocus
        />
        <div className="flex gap-2 grow-0">
          <button type="submit" className="text-sm text-gray-600">
            Save
          </button>
          <button
            className="text-sm text-red-800"
            onClick={onClickCancelEditTodo}
          >
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2 p-1">
        <input
          type="checkbox"
          checked={todoChecked}
          onChange={onChangeTodoChecked}
        />
        <span className={todoChecked ? "line-through" : ""}>{todoText}</span>
      </div>
      <span className="flex place-items-center gap-2 text-sm">
        <button className="text-gray-600" onClick={onClickEditTodo}>
          Edit
        </button>
        <button className="text-red-800" onClick={onClickDeleteTodo}>
          Delete
        </button>
      </span>
    </div>
  );
}
```

**What's happening here:**
- We use local state (`isEditing`) to toggle between view and edit modes
- We dispatch `updateTodoItem` for both checking and text editing
- We dispatch `deleteTodoItem` to remove items
- We use TypeScript event handlers for type safety

### Step 6: Create the TodoListName component

Finally, create `editors/todo-list-editor/components/TodoListName.tsx` for displaying and editing the document name:

```tsx
import { useState, type FormEventHandler } from "react";
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { setName } from "document-model/document";

/** Allows editing the name of the selected todo list */
export function TodoListName() {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTodoList, dispatch] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  const documentName = selectedTodoList.name;

  const onSubmitEditName: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const name = nameInput.value;

    if (name) {
      dispatch(setName(name));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={onSubmitEditName}>
        <input
          name="name"
          defaultValue={documentName}
          className="text-xl font-bold"
          autoFocus
        />
      </form>
    );
  }

  return (
    <h1
      className="text-xl font-bold cursor-pointer"
      onClick={() => setIsEditing(true)}
    >
      {documentName}
    </h1>
  );
}
```

**What's happening here:**
- We use the `setName` action from `document-model/document` (a built-in action)
- We toggle between viewing and editing the name
- Click the name to edit it

## Test your editor

Now you can run the Vetra Studio Preview and see the **To-do List** editor in action:

```bash
ph vetra --watch 
```

In the bottom right corner you'll find a new Document Model that you can create: **To-do List**.  
Click on it to create a new To-do List document.

:::info Live Development
The editor will update dynamically as you make changes, so you can experiment with styling and functionality while seeing your results appear in Vetra Studio in real-time.
:::

**Try it out:**
1. Add some todo items using the input form
2. Click on the document name to edit it
3. Check/uncheck items to mark them as complete
4. Click "Edit" on any item to modify its text
5. Click "Delete" to remove items

Congratulations! 🎉  
If you managed to follow this tutorial until this point, you have successfully implemented the **To-do List** document model with its reducer operations and editor.

## Compare with the reference implementation

The tutorial repository's step-6 branch includes additional enhancements you can explore:

**Additional components in step-6:**
```
editors/todo-list-editor/components/
├── CloseButton.tsx       # Editor close functionality
├── UndoRedoButtons.tsx   # Operation history navigation
└── Stats.tsx             # Display metadata (creation/modification times)
```

**View individual components from the reference:**

```bash
# See the enhanced TodoList component with all features
git show tutorial/step-6-add-basic-todo-editor-ui-components:editors/todo-list-editor/components/TodoList.tsx

# Explore the UndoRedoButtons component
git show tutorial/step-6-add-basic-todo-editor-ui-components:editors/todo-list-editor/components/UndoRedoButtons.tsx

# Compare your implementation with the reference
git diff tutorial/step-6-add-basic-todo-editor-ui-components -- editors/todo-list-editor/
```

:::tip Check your work

To make sure everything works as expected:

```bash
# Check types compile correctly
pnpm tsc

# Check linting passes
pnpm lint

# Run tests
pnpm test

# Test in Connect Studio
ph connect

# Compare with reference implementation
git diff tutorial/step-6-add-basic-todo-editor-ui-components -- editors/todo-list-editor/
```

In Connect, you should be able to:
- Create a new To-do List document
- Add, edit, and delete todo items
- Check/uncheck items to mark them complete

:::

## Key concepts learned

In this tutorial you've learned:

✅ **Component-based architecture** - Breaking down complex UIs into reusable components  
✅ **Document model hooks** - Using `useSelectedTodoListDocument` to connect React to your document state  
✅ **Action dispatching** - How to dispatch operations (`addTodoItem`, `updateTodoItem`, `deleteTodoItem`) from your UI  
✅ **Type-safe development** - Leveraging TypeScript with generated types from your SDL  
✅ **Form handling** - Using React forms with proper event handlers  
✅ **Local vs. document state** - When to use React `useState` vs. document model state  

### Up next: Mastery Track

In the [Mastery Track chapter: Document Model Creation](/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel) we guide you through the theoretics of the previous steps while creating a more advanced version of the To-do List.

You will learn:

- The in's & out's of a document model.
- How to use UI & Scalar components from the Document Engineering system.
- How to build Custom Drive Apps or Drive Explorers.

