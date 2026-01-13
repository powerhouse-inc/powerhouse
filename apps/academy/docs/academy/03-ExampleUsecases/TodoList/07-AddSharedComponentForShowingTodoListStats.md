# Step 7 - Add shared component for showing TodoList stats

So far we've been creating components that live in the same directories as the editors that use them. But sometimes we want to use the same component across multiple editors.

Let's create a component for showing statistics about our todos. We'd like this component to work with any set of todos or todo lists, so that we can use the same one in our document editor or in our drive editor or a folder.

## Creating the `<Stats />` component

Create a new directory at `editors/components` and create two new files inside it: 

`editors/components/Stats.tsx` with this content:

```jsx
import type {
  TodoItem,
  TodoListDocument,
} from "todo-tutorial/document-models/todo-list";

type Props = {
  todos: TodoItem[] | undefined;
  todoListDocuments?: TodoListDocument[] | undefined;
  createdAtUtcIso?: string;
  lastModifiedAtUtcIso?: string;
};

/** Generic component for showing statistics about todo lists and the todos they contain */
export function Stats({
  todos,
  todoListDocuments,
  createdAtUtcIso,
  lastModifiedAtUtcIso,
}: Props) {
  const totalTodos = todos?.length ?? 0;
  const totalChecked = todos?.filter((todo) => todo.checked).length ?? 0;
  const totalUnchecked = todos?.filter((todo) => !todo.checked).length ?? 0;
  const percentageChecked = Math.round(
    calculatePercentage(totalTodos, totalChecked),
  );
  const percentageUnchecked = Math.round(
    calculatePercentage(totalTodos, totalUnchecked),
  );
  const createdAt = createdAtUtcIso ? new Date(createdAtUtcIso) : null;
  const hasCreatedAt = createdAt !== null;
  const lastModified = lastModifiedAtUtcIso
    ? new Date(lastModifiedAtUtcIso)
    : null;
  const hasLastModified = lastModified !== null;
  const createdAtFormattedDate = createdAt
    ? createdAt.toLocaleDateString()
    : null;
  const lastModifiedFormattedDate = lastModified
    ? lastModified.toLocaleDateString()
    : null;
  const createdAtFormattedTime = createdAt
    ? createdAt.toLocaleTimeString()
    : null;
  const lastModifiedFormattedTime = lastModified
    ? lastModified.toLocaleTimeString()
    : null;
  const totalTodoListDocuments = todoListDocuments?.length ?? 0;
  const hasTodoLists = todoListDocuments !== undefined;

  return (
    <div className="w-[400px] rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
        Statistics
      </div>
      <ul className="flex flex-col gap-2">
        {hasTodoLists && (
          <li className="flex justify-between items-center rounded-lg border border-gray-200 p-3">
            <span className="text-sm text-gray-600">Todo Lists</span>
            <span className="text-sm font-medium text-gray-900">{totalTodoListDocuments}</span>
          </li>
        )}
        <li className="flex justify-between items-center rounded-lg border border-gray-200 p-3">
          <span className="text-sm text-gray-600">Todos</span>
          <span className="text-sm font-medium text-gray-900">{totalTodos}</span>
        </li>
        <li className="flex justify-between items-center rounded-lg border border-gray-200 p-3">
          <span className="text-sm text-gray-600">Checked</span>
          <span className="text-sm font-medium text-gray-900">
            {totalChecked} ({percentageChecked}%)
          </span>
        </li>
        <li className="flex justify-between items-center rounded-lg border border-gray-200 p-3">
          <span className="text-sm text-gray-600">Unchecked</span>
          <span className="text-sm font-medium text-gray-900">
            {totalUnchecked} ({percentageUnchecked}%)
          </span>
        </li>
        {hasCreatedAt && (
          <li className="flex justify-between items-center rounded-lg border border-gray-200 p-3">
            <span className="text-sm text-gray-600">Created</span>
            <span className="text-sm font-medium text-gray-900">
              {createdAtFormattedDate} {createdAtFormattedTime}
            </span>
          </li>
        )}
        {hasLastModified && (
          <li className="flex justify-between items-center rounded-lg border border-gray-200 p-3">
            <span className="text-sm text-gray-600">Last modified</span>
            <span className="text-sm font-medium text-gray-900">
              {lastModifiedFormattedDate} {lastModifiedFormattedTime}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

function calculatePercentage(total: unknown, value: unknown) {
  if (typeof total !== "number" || typeof value !== "number") {
    return 0;
  }
  const ratio = value / total;
  if (isNaN(ratio)) {
    return 0;
  }
  return ratio * 100;
}

```

And `editors/components/index.ts` with this content:

```ts
export { Stats } from "./Stats.js";
```

The index file lets us use a nice neat import path like `todo-tutorial/editors/components` in all of our editor components.

Don't be too concerned with the math and time related code you see here — those are just implementation details.

## Using the  `<Stats />` component in our `TodoListEditor`

Now let's use the `<Stats />` component in our `<TodoList />` component `editors/todo-list-editor/components/TodoList.tsx`:

```tsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { AddTodo } from "./AddTodo.js";
import { Todos } from "./Todos.js";

// added-start
import { Stats } from "todo-tutorial/editors/components";
// added-end

/** Displays the selected todo list */
export function TodoList() {
  // this hook returns the currently selected TodoList document
  const [selectedTodoListDocument] = useSelectedTodoListDocument();

  if (!selectedTodoListDocument) return null;

  const todos = selectedTodoListDocument.state.global.items;
  // added-start
  const createdAtUtcIso = selectedTodoListDocument.header.createdAtUtcIso;
  const lastModifiedAtUtcIso =
    selectedTodoListDocument.header.lastModifiedAtUtcIso;
  // added-end

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-6">
      // added-start
      <Stats
        todos={todos}
        createdAtUtcIso={createdAtUtcIso}
        lastModifiedAtUtcIso={lastModifiedAtUtcIso}
      />
      // added-end
      <AddTodo />
      <Todos todos={todos} />
    </div>
  );
}

```

With this, you will now see statistics about the todo items in a todo list document.

And now we can also show off the flexibility of our new `<Stats />` component. Since drives are also just documents themselves, we can derive the same information about a drive too. This means we can use this same component in our drive editor as well.

## Using the `<Stats />` component in our `TodoDriveExplorer`

Let's add this to our `<DriveContents />` component `editors/todo-drive-app/components/DriveContents.tsx`, along with some conditional logic that either shows stats for the selected folder (if one is selected) or the selected drive otherwise.

```tsx
// added-start
import {
  useSelectedDrive,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
// added-end
import { CreateDocument } from "./CreateDocument.js";
import { EmptyState } from "./EmptyState.js";
import { Files } from "./Files.js";
import { Folders } from "./Folders.js";
import { NavigationBreadcrumbs } from "./NavigationBreadcrumbs.js";
// added-start
import { Stats } from "todo-tutorial/editors/components";
import {
  useTodoListDocumentsInSelectedDrive,
  useTodoListDocumentsInSelectedFolder,
  type TodoItem,
  type TodoListDocument,
} from "todo-tutorial/document-models/todo-list";

/** Small helper function to get all todo items from all todo lists */
export function getAllTodoItemsFromTodoLists(
  todoLists: TodoListDocument[] | undefined,
): TodoItem[] {
  return todoLists?.flatMap((todoList) => todoList.state.global.items) ?? [];
}
// added-end

/** Shows the documents and folders in the selected drive */
export function DriveContents() {
  // added-start
  const selectedFolder = useSelectedFolder();
  const hasSelectedFolder = selectedFolder !== undefined;
  // added-end
  return (
    <div className="space-y-6 px-6">
      <NavigationBreadcrumbs />
      // added-line
      {hasSelectedFolder ? <FolderStats /> : <DriveStats />}
      <Folders />
      <Files />
      <EmptyState />
      <CreateDocument />
    </div>
  );
}

// added-start
/** Shows the statistics for the selected drive */
function DriveStats() {
  const todoListDocumentsInSelectedDrive =
    useTodoListDocumentsInSelectedDrive();
  const allTodos = getAllTodoItemsFromTodoLists(
    todoListDocumentsInSelectedDrive,
  );
  const [selectedDrive] = useSelectedDrive();
  const driveCreatedAt = selectedDrive.header.createdAtUtcIso;
  const driveLastModified = selectedDrive.header.lastModifiedAtUtcIso;

  return (
    <Stats
      todos={allTodos}
      todoListDocuments={todoListDocumentsInSelectedDrive}
      createdAtUtcIso={driveCreatedAt}
      lastModifiedAtUtcIso={driveLastModified}
    />
  );
}

/** Shows the statistics for the selected folder */
function FolderStats() {
  const todoListDocumentsInSelectedFolder =
    useTodoListDocumentsInSelectedFolder();
  const allTodos = getAllTodoItemsFromTodoLists(
    todoListDocumentsInSelectedFolder,
  );

  return (
    <Stats
      todos={allTodos}
      todoListDocuments={todoListDocumentsInSelectedFolder}
    />
  );
}
// added-end
```

The final result should look like this:

```jsx
import {
  useSelectedDrive,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";

import { CreateDocument } from "./CreateDocument.js";
import { EmptyState } from "./EmptyState.js";
import { Files } from "./Files.js";
import { Folders } from "./Folders.js";
import { NavigationBreadcrumbs } from "./NavigationBreadcrumbs.js";

import { Stats } from "todo-tutorial/editors/components";
import {
  useTodoListDocumentsInSelectedDrive,
  useTodoListDocumentsInSelectedFolder,
  type TodoItem,
  type TodoListDocument,
} from "todo-tutorial/document-models/todo-list";

/** Small helper function to get all todo items from all todo lists */
export function getAllTodoItemsFromTodoLists(
  todoLists: TodoListDocument[] | undefined,
): TodoItem[] {
  return todoLists?.flatMap((todoList) => todoList.state.global.items) ?? [];
}

/** Shows the documents and folders in the selected drive */
export function DriveContents() {
  const selectedFolder = useSelectedFolder();
  const hasSelectedFolder = selectedFolder !== undefined;

  return (
    <div className="space-y-6 px-6">
      <NavigationBreadcrumbs />
      {hasSelectedFolder ? <FolderStats /> : <DriveStats />}
      <Folders />
      <Files />
      <EmptyState />
      <CreateDocument />
    </div>
  );
}

/** Shows the statistics for the selected drive */
function DriveStats() {
  const todoListDocumentsInSelectedDrive =
    useTodoListDocumentsInSelectedDrive();
  const allTodos = getAllTodoItemsFromTodoLists(
    todoListDocumentsInSelectedDrive,
  );
  const [selectedDrive] = useSelectedDrive();
  const driveCreatedAt = selectedDrive.header.createdAtUtcIso;
  const driveLastModified = selectedDrive.header.lastModifiedAtUtcIso;

  return (
    <Stats
      todos={allTodos}
      todoListDocuments={todoListDocumentsInSelectedDrive}
      createdAtUtcIso={driveCreatedAt}
      lastModifiedAtUtcIso={driveLastModified}
    />
  );
}

/** Shows the statistics for the selected folder */
function FolderStats() {
  const todoListDocumentsInSelectedFolder =
    useTodoListDocumentsInSelectedFolder();
  const allTodos = getAllTodoItemsFromTodoLists(
    todoListDocumentsInSelectedFolder,
  );

  return (
    <Stats
      todos={allTodos}
      todoListDocuments={todoListDocumentsInSelectedFolder}
    />
  );
}
```

With this update, you can now see the statistics for the todo lists and todo items for the selected drive, folder or document depending on which you select.

 ## Check your work

To make sure all works as expected, we should:

- check types
run: `pnpm tsc`

- check linting
run: `pnpm lint`

- check tests
run: `pnpm test`

- test in connect
run: `pnpm connect` — you should now be able to see the `<Stats />` component showing the data for your drives, folder and documents.

- make sure your code matches the code in the completed step branch
run: `git diff step-7-complete-added-shared-component-for-showing-todo-list-stats`

## The end

Congratulations! You now have a working `TodoList` document model, and editor for those documents, and a drive editor for managing those documents. This will make a good starting point for creating your own new implementations. 

We're excited to see what you build!