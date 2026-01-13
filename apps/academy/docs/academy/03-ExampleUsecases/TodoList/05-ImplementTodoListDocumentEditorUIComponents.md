# Step 5 — Implement `TodoList` document editor UI components

Out of the box, we have a component for updating our `TodoList` documents' names, but we would like to create, read, update, and delete all of the data in our documents.

## Add a component for showing our todo list in the document editor

Let's start by adding a `<TodoList />` component that will be the main container we show when you open a TodoList document.

Create a new file at `editors/todo-list-editor/components/TodoList.tsx` and add this:

```jsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoListDocument] = useSelectedTodoListDocument();

  if (!selectedTodoListDocument) return null;

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-md h-[300px] rounded-xl bg-white p-6 shadow-sm flex flex-col">
        <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
          Todo List Document
        </div>
        <div className="overflow-auto flex-1">
          <pre className="text-sm text-gray-900">
            {JSON.stringify(selectedTodoListDocument, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
```

Now in `editors/todo-list-editor/editor.tsx` add this new component (TodoList) at the 

```tsx
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { setName } from "document-model";
import { useState } from "react";
import type { FormEvent } from "react";
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
// added-start
import { TodoList } from "./components/TodoList.js";
// added-end

export default function Editor() {
  ...

  return (
    <div className="min-h-screen bg-gray-50">
      <DocumentToolbar />
      <div className="flex justify-center px-4 py-8">
        ...
      </div>
      ...
      
      // added-start
      <TodoList />
      // added-end
    </div>
  );
}

```

Now when you open a TodoList document in Connect, you will see an (albeit ugly for now) representation of your whole document in JSON.

## Add a component for adding todo items to a todo list

Next, let's add a component for adding todos to a todo list.

Create a new file at `editors/todo-list-editor/components/AddTodo.tsx` and add this to it:

```jsx
import { generateId } from "@powerhousedao/design-system/connect/components/drop-zone/utils";
import type { FormEventHandler } from "react";
import { addTodoItem } from "todo-tutorial/document-models/todo-list";
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";

export function AddTodo() {
  // The hooks for getting documents also return a dispatch function for dispatching actions to modify the document.

  // This is the same pattern you will have seen in React's `useReducer` hook, except you don't need to pass the initial state.

  // The document we are working with _is_ the initial state.
  const [todoList, dispatch] = useSelectedTodoListDocument();

  if (!todoList) return null;

  const onSubmitAddTodo: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const addTodoInput = form.elements.namedItem("addTodo") as HTMLInputElement;
    const text = addTodoInput.value;
    if (!text) return;

    dispatch(addTodoItem({ text, id: generateId() }));

    form.reset();
  };

  return (
    <div className="w-[400px] rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
        Add Todo
      </div>
      <form onSubmit={onSubmitAddTodo} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-lg font-semibold text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          type="text"
          name="addTodo"
          placeholder="What needs to be done?"
          autoFocus
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Add
        </button>
      </form>
    </div>
  );
}

```

We have provided some basic Tailwind styles but you are welcome to style your components however you wish. This hooks and functions also work with other component libraries like Radix etc.

Let's add this component to our `<TodoList />` component. `./editors/todo-list-editor/components/TodoList.tsx`
```tsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { AddTodo } from "./AddTodo.js";

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoListDocument] = useSelectedTodoListDocument();

  if (!selectedTodoListDocument) return null;

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-6">
      <AddTodo />
      <div className="w-[400px] h-[300px] rounded-xl bg-white p-6 shadow-sm flex flex-col">
        <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
          Todo List Document
        </div>
        <div className="overflow-auto flex-1">
          <pre className="text-sm text-gray-900">
            {JSON.stringify(selectedTodoListDocument, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

```

Now when you open a TodoList document in Connect, you can add more todos.

## Add components for todo items and the list of todo items

Finally, let's add a component for showing and editing and individual todo item in a todo list, and another one for showing the list of todo items.

Create a new file at `editors/todo-list-editor/components/Todo.tsx` and add this content:

```jsx
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
  // even though this component is for a todo item and not a whole list, we can use the exact same hook for dispatching updates to it.
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
    // we can use this dispatch function for any of the actions supported by a TodoList document
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
        className="flex gap-2 items-center rounded-lg border border-gray-200 p-3"
        onSubmit={onSubmitUpdateTodoText}
      >
        <input
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          type="text"
          name="todoText"
          defaultValue={todoText}
          autoFocus
        />
        <div className="flex gap-2 shrink-0">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Save
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            onClick={onClickCancelEditTodo}
          >
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex justify-between items-center rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <input
          type="checkbox"
          checked={todoChecked}
          onChange={onChangeTodoChecked}
          className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span
          className={`text-sm truncate ${todoChecked ? "line-through text-gray-400" : "text-gray-900"}`}
        >
          {todoText}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          onClick={onClickEditTodo}
        >
          Edit
        </button>
        <button
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          onClick={onClickDeleteTodo}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

Now create another new file at `editors/todo-list-document/Todos.tsx` and give it this content:

```jsx
import type { TodoItem } from "todo-tutorial/document-models/todo-list";
import { Todo } from "./Todo.js";

type Props = {
  todos: TodoItem[];
};

/** Shows a list of the todo items in the selected todo list */
export function Todos({ todos }: Props) {
  const hasTodos = todos.length > 0;

  return (
    <div className="w-[400px] rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
        Todos
      </div>
      {!hasTodos ? (
        <p className="text-sm text-gray-500">
          Start adding things to your todo list
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => (
            <li key={todo.id}>
              <Todo todo={todo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

And replace the content of your `TodoList.tsx` file with this:

```jsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { AddTodo } from "./AddTodo.js";
import { Todos } from "./Todos.js";

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoListDocument] = useSelectedTodoListDocument();

  if (!selectedTodoListDocument) return null;

  const todos = selectedTodoListDocument.state.global.items;

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-6">
      <AddTodo />
      <Todos todos={todos} />
    </div>
  );
}

```

```
editors/todo-list-editor/
├── components/
│   └── AddTodo.tsx           # Component for adding a new todo
│   └── Todo.tsx              # Renders an individual Todo item
│   └── TodoList.tsx          # main Todo Component, renders the Todos and AddTodo Component
│   └── Todos.tsx             # Renders the list of todos
├── editor.tsx                # Main editor component
└── module.ts                 # Editor module export (do not change this)
```

 ## Check your work

To make sure all works as expected, we should:

- check types
run: `pnpm tsc`

- check linting
run: `pnpm lint`

- check tests
run: `pnpm test`

- test in connect
run: `pnpm connect` — you should now be able to open a `TodoList` document and update all of the fields we defined in the `TodoList` document model schema

- make sure your code matches the code in the completed step branch
run: `git diff your-branch-name step-5-complete-added-basic-todo-list-document-editor-ui-components`

## Up next: generating a custom drive explorer for managing our `TodoList` documents

Next, we will generate a special kind of editor called a "drive editor" which we will use instead of the generic drive explorer.