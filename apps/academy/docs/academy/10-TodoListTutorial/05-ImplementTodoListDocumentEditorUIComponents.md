# Step 5 — Implement `TodoList` document editor UI components

Out of the box, we have a component for updating our `TodoList` documents' names, but we would like to create, read, update, and delete all of the data in our documents.

## Add a component for showing our todo list in the document editor

Let's start by adding a <TodoList /> component that will be the main container we show when you open a TodoList document.

Create a new file at `editors/todo-list-editor/components/TodoList.tsx` and add this:

```jsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { EditTodoListName } from "./EditName.js";

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  return (
    <div>
     <EditTodoListName />
      <pre>
       {JSON.stringify(selectedTodoListDocument)}
      </pre>
    </div>
  );
}
```

We've moved the <EditTodoListName /> component here, so replace it in `editors/todo-list-editor/editor.tsx` with this component we just created.

```diff
- import { EditTodoListName } from "./components/EditName.js";
+ import { TodoList } from "./components/TodoList.js";

export default function Editor() {
  return (
    <div className="py-4 px-8">
-      <EditTodoListName />
+      <TodoList />
    </div>
  );
}
```

Now when you open a TodoList document in Connect, you will see an (albeit ugly for now) representation of your whole document in JSON.

## Add a component for adding todo items to a todo list

Next, let's add a component for adding todos to a todo list.

Create a new file at `editors/todo-list-editor/components/AddTodo.tsx` and add this to it:

```jsx
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

We have provided some basic Tailwind styles but you are welcome to style your components however you wish. This hooks and functions also work with other component libraries like Radix etc.

Let's add this component to our <TodoList /> component.

```diff
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { EditTodoListName } from "./EditName.js";
+ import { AddTodo } from "./AddTodo.js";

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  return (
    <div>
     <EditTodoListName />
+    <AddTodo />
      <pre>
       {JSON.stringify(selectedTodoListDocument)}
      </pre>
    </div>
  );
}
```

Now when you open a TodoList document in Connect, you can add more todos.

## Add a button for closing the open `TodoList` document

Of course it's all well and good to be able to open TodoList documents, but we would also like to be able to close them.

Let's add a <CloseButton /> component that closes the selected document when clicked.

Create a new file at `editors/todo-list-editor/components/CloseButton.tsx` and add this content:

```jsx
import { setSelectedNode } from "@powerhousedao/reactor-browser";
import type { MouseEventHandler } from "react";

/** Closes the selected todo list document editor */
export function CloseButton() {
  const onCloseButtonClick: MouseEventHandler<HTMLButtonElement> = () => {
    // this function sets the selected node in Connect.
    // a node can be either a file or a folder, and the same function works for both.
    // notably, this is not a hook and therefore does not need to abide by the rules of hooks.
    setSelectedNode(undefined);
  };

  return (
    <button onClick={onCloseButtonClick} className="text-sm text-gray-600">
      Close
    </button>
  );
}
```

Let's add this component to our <TodoList /> component:

```diff
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { EditTodoListName } from "./EditName.js";
import { AddTodo } from "./AddTodo.js";
+ import { CloseButton } from "./CloseButton.js";

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  return (
    <div>
     <EditTodoListName />
+    <CloseButton />
     <AddTodo />
      <pre>
       {JSON.stringify(selectedTodoListDocument)}
      </pre>
    </div>
  );
}
```

Now you have a button you can click to close the selected document.

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

And replace the content of your `TodoList.tsx` file with this:

```jsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { EditTodoListName } from "./EditName.js";
import { Todos } from "./Todos.js";
import { AddTodo } from "./AddTodo.js";
import { CloseButton } from "./CloseButton.js";

/** Displays the selected todo list */
export function TodoList() {
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  const todos = selectedTodoList.state.global.items;

  return (
    <div>
      <section className="mb-4 flex gap-2 items-center">
        <div className="grow">
          <EditTodoListName />
        </div>
        <div className="flex-none">
          <CloseButton />
        </div>
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

```
editors/todo-list-editor/
├── components/
│   └── EditName.tsx          # Auto-generated component for editing document name
├── editor.tsx                # Main editor component (do not change this)
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