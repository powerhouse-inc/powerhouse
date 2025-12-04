# Build document editors

## Build with React on Powerhouse

At Powerhouse, frontend development for document editors follows a simple and familiar flow, leveraging the power and flexibility of React.

### Development environment

Connect Studio is your primary tool for development.  
When you run `ph connect`, it provides a dynamic, local environment where you can define and preview your document models and their editors live. This replaces the need for tools like Storybook for editor development, though Storybook remains invaluable for exploring the [Powerhouse Component Library](#powerhouse-component-library).

Key aspects of the Powerhouse development environment:

- **React Foundation**: Build your editor UIs using React components, just as you would in any standard React project.
- **Automatic Build Processes**: Tailwind CSS is installed by default and fully managed by Connect Studio. There's no need to manually configure or run Tailwind or other build processes during development. Connect Studio handles CSS generation and other necessary build steps automatically, especially when you publish a package.
- **Styling Flexibility**: You are not limited to Tailwind. Regular CSS (`.css` files), inline styles, and any React-compatible styling method work exactly as you would expect.

Powerhouse aims to keep your developer experience clean, familiar, and focused:

- Build React components as you normally would.
- Use styling approaches you're comfortable with.
- Trust Connect Studio to handle the setup and build processes for you.

### Generating your editor template

To kickstart your editor development, Powerhouse provides a command to generate a basic editor template. This command reads your document model specifications and creates the initial `editor.tsx` file.
If you want a refresher on how to define your document model specification please read the chapter on [specifying the State Schema](/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema)

For example, to generate an editor for a TodoList document model with a document type `powerhouse/todo-list`:

```bash
ph generate --editor todo-list-editor --document-types powerhouse/todo-list
```

This will create the template in the `editors/todo-list-editor/editor.tsx` folder.

### Styling your editor

You have several options for styling your editor components:

1.  **Default HTML Styling**: Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default browser styles or any base styling provided by the Connect environment. This is suitable for basic structure and quick prototyping.

2.  **Tailwind CSS**: Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes in your JSX for rapid and consistent styling without writing separate CSS files.
    _Example (from the TodoList Editor):_

    ```typescript
    <div className="container mx-auto p-4 max-w-md">
        <h1 className="text-2xl font-bold mb-4">TodoList</h1>
        {/* ... more Tailwind styled elements */}
    </div>
    ```

3.  **Custom CSS Files**: You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.
    _Create an `editor.css` file in your editor's directory:_

    ```css
    /* editors/your-editor/editor.css */
    .editor-container {
      padding: 1rem;
      border: 1px solid #ccc;
    }
    .editor-title {
      color: navy;
      font-size: 1.8rem;
    }
    ```

    _Import and use it in your `editor.tsx`:_

    ```typescript
    import './editor.css'; // Import the CSS file

    export default function Editor(props: IProps) {
        return (
            <div className="editor-container">
                <h1 className="editor-title">My Document Title</h1>
                {/* ... */}
            </div>
        );
    }
    ```

Choose the method or combination of methods that best suits your project needs and team preferences. Connect Studio (`ph connect`) will allow you to see your styles applied in real-time.

:::warning **Best practices for consistent reliable styles**

In any package the styles are being generated through the styles.css file with the help of the tailwindcss/cli package.

**1. Centralize style imports**

- Do not import styles directly in .tsx files.
- This works in development mode but will not be picked up in static production builds.
- Move all style imports into your main styles.css file.

**2. Use file imports instead of URL imports**

- @import url("...") → **Incorrect**, Ignored by tailwindcss/cli
- @import "..." → **Correct**, resolves from local files or node_modules
- Always prefer the file import syntax.

**Using `ph install` includes package styles automatically**

- When installing a package with `ph install` on any instance, package styles are automatically added to styles.css. This ensures production builds always include the required package styles.
  :::

## State management in editors: Hooks vs Props

When you build an editor in Powerhouse, there are **two ways** to access and modify document state. Understanding the difference is important for choosing the right approach for your component.

### Understanding the two approaches

<details>
<summary>ℹ️ For Non-Technical Readers</summary>

Think of it like ordering food at a restaurant:

**Hooks Approach** 🪝: Like having a direct line to the kitchen. Any component can call the kitchen directly to get the current menu (state) or place an order (dispatch an action). It's independent and self-sufficient.

**Props Approach** 📦: Like a waiter passing you a menu and taking your order. The main component receives everything and passes it down to child components. Children can only work with what they're given.

**Which is better?** For Powerhouse editors, we recommend the **Hooks approach** because:
- Components are more independent
- Easier to move components around
- Less "prop drilling" (passing data through many layers)
- Matches modern React best practices

</details>

### Method 1: Using Hooks (Recommended) 🪝

The **hook-based approach** uses `useSelectedTodoListDocument` — a React hook that Powerhouse generates for your document model. Any component can call this hook to get the current document state and a function to dispatch changes.

  ```typescript
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { addTodoItem } from "todo-tutorial/document-models/todo-list";

export function AddTodo() {
  // The hook returns [document, dispatch]
  const [todoList, dispatch] = useSelectedTodoListDocument();

  if (!todoList) return null;

  const handleAdd = (text: string) => {
    dispatch(addTodoItem({ text }));
  };

  return (
    <button onClick={() => handleAdd("New task")}>
      Add Todo
    </button>
  );
}
```

**Why hooks are recommended:**
- ✅ **Self-contained components**: Each component gets its own connection to the document
- ✅ **Less boilerplate**: No need to pass props through multiple levels
- ✅ **Easier refactoring**: Move components around without rewiring props
- ✅ **Modern React pattern**: Follows React's recommended approach for state management

### Method 2: Using Props 📦

The **props-based approach** receives the document and dispatch function as properties passed from a parent component.

```typescript
import { EditorProps } from 'document-model';
import { TodoListDocument } from '../../document-models/todo-list/index.js';

export type IProps = EditorProps<TodoListDocument>;

export default function Editor(props: IProps) {
    const { document, dispatch } = props;
    const state = document.state.global;

    // Now you'd pass state and dispatch to child components as props
    return (
        <div>
            <TodoList items={state.items} dispatch={dispatch} />
        </div>
    );
}
```

**When props might be useful:**
- When you need strict control over which components can access state
- When building components that should work outside of Powerhouse context
- For testing purposes where you want to inject mock state

### Which should you use?

| Scenario | Recommended Approach |
|----------|---------------------|
| Building a standard Powerhouse editor | **Hooks** 🪝 |
| Component needs document state | **Hooks** 🪝 |
| Building reusable UI components (buttons, inputs) | **Props** 📦 |
| Need to test components in isolation | **Props** 📦 |

**Bottom line**: Use hooks for most Powerhouse editor development. It's simpler, cleaner, and matches the patterns used in the [todo-demo repository](https://github.com/powerhouse-inc/todo-demo).

## Local vs. Global State

When building editors, you'll work with two types of state:

- **Global Document State**: Data that is part of the document itself and should be saved. This is accessed via hooks (`useSelectedTodoListDocument`) or props (`document.state.global`). You modify it by dispatching actions.

- **Local Component State**: UI-specific state that doesn't need to be saved (e.g., "is the dropdown open?", "what's in the input field before submission?"). Use React's `useState` hook for this.

```typescript
import { useState } from 'react';
import { useSelectedTodoListDocument, addTodoItem } from "todo-tutorial/document-models/todo-list";

export function AddTodo() {
  // Local state - just for this component's UI
  const [inputValue, setInputValue] = useState('');
  
  // Global document state - saved in the document
  const [todoList, dispatch] = useSelectedTodoListDocument();

  const handleSubmit = () => {
    if (inputValue.trim()) {
      dispatch(addTodoItem({ text: inputValue })); // Updates global state
      setInputValue(''); // Clears local state
    }
  };

  return (
    <div>
      <input 
        value={inputValue} 
        onChange={(e) => setInputValue(e.target.value)} 
      />
      <button onClick={handleSubmit}>Add</button>
    </div>
  );
}
```

## Powerhouse component library

Powerhouse provides a rich set of reusable UI components through the **`@powerhousedao/document-engineering/scalars`** package. These components are designed for consistency, efficiency, and seamless integration with the Powerhouse ecosystem, with many based on GraphQL scalar types. For more information read our chapter on the [Component Library](/academy/ComponentLibrary/DocumentEngineering)

### Exploring components

You can explore available components, see usage examples, and understand their properties (props) using our Storybook instance:
[https://storybook.powerhouse.academy](https://storybook.powerhouse.academy)

Storybook allows you to:

- Visually inspect each component.
- Interact with different states and variations.
- View code snippets for basic implementation.
- Consult the props table for detailed configuration options.

### Using components

1.  **Import**: Add an import statement at the top of your editor file:
    ```typescript
    import {
      Checkbox,
      StringField,
      Form,
    } from "@powerhousedao/document-engineering/scalars";
    ```
2.  **Implement**: Use the component in your JSX, configuring it with props:
    ```typescript
    // Example using StringField for an input
    <Form onSubmit={() => { /* Handle submission */ }}>
      <StringField
        name="taskName"
        label="New Task"
        value={taskText} // From local state
        onChange={(e) => setTaskText(e.target.value)}
      />
    </Form>
    ```

<details>
<summary>Tutorial: Implementing the TodoList Editor</summary>

## Build a TodoList editor

In this final part of our tutorial we will continue with the interface or editor implementation of the **TodoList** document model. This means you will create a simple user interface for the **TodoList** document model which will be used inside the Connect app to create, update and delete your TodoList items, and also display the statistics we've implemented in our reducers (if you followed the advanced version).

## Generate the editor template

Run the command below to generate the editor template for the **TodoList** document model.  
This command reads the **TodoList** document model definition from the `document-models` folder and generates the editor template in the `editors/todo-list-editor` folder as `editor.tsx`.

Notice the `--editor` flag which specifies the editor name, and the `--document-types` flag defines the document type `powerhouse/todo-list`.

```bash
ph generate --editor todo-list-editor --document-types powerhouse/todo-list
```

Once complete, navigate to the `editors/todo-list-editor/editor.tsx` file and open it in your editor.

### Editor implementation options

When building your editor component within the Powerhouse ecosystem, you have several options for styling, allowing you to leverage your preferred methods:

1.  **Default HTML Styling:** Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default styles offered through the boilerplate.
2.  **Tailwind CSS:** Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes for rapid, consistent styling without writing separate CSS files.
3.  **Custom CSS Files:** You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.

Connect Studio provides a dynamic local environment (`ph connect`) to visualize your components instantly as you build them, regardless of the styling method you choose. Manual build steps are typically only needed when publishing packages.

---

## TodoList editor using hooks (Recommended)

This approach uses the `useSelectedTodoListDocument` hook, which is the same pattern used in the Get Started tutorial and the [todo-demo repository](https://github.com/powerhouse-inc/todo-demo).

### Main editor file

```typescript
// editors/todo-list-editor/editor.tsx
import { TodoList } from "./components/TodoList.js";

export function Editor() {
  return (
    <div className="py-4 px-8">
      <TodoList />
    </div>
  );
}
```

### TodoList container component

```typescript
// editors/todo-list-editor/components/TodoList.tsx
import { useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import { Todos } from "./Todos.js";
import { AddTodo } from "./AddTodo.js";

export function TodoList() {
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  const todos = selectedTodoList.state.global.items;

return (
    <div>
      <h1 className="text-2xl font-bold mb-4">TodoList</h1>
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

### AddTodo component

```typescript
// editors/todo-list-editor/components/AddTodo.tsx
import type { FormEventHandler } from "react";
import { addTodoItem, useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";

export function AddTodo() {
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

### Todo item component

```typescript
// editors/todo-list-editor/components/Todo.tsx
import { useState, type ChangeEventHandler, type FormEventHandler, type MouseEventHandler } from "react";
import { deleteTodoItem, updateTodoItem, useSelectedTodoListDocument } from "todo-tutorial/document-models/todo-list";
import type { TodoItem } from "todo-tutorial/document-models/todo-list";

type Props = {
  todo: TodoItem;
};

export function Todo({ todo }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [todoList, dispatch] = useSelectedTodoListDocument();

  if (!todoList) return null;

  const onChangeTodoChecked: ChangeEventHandler<HTMLInputElement> = (event) => {
    dispatch(updateTodoItem({ id: todo.id, checked: event.target.checked }));
  };

  const onClickDeleteTodo: MouseEventHandler<HTMLButtonElement> = () => {
    dispatch(deleteTodoItem({ id: todo.id }));
  };

  const onSubmitUpdateTodoText: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const textInput = form.elements.namedItem("todoText") as HTMLInputElement;
    const text = textInput.value;
    if (!text) return;
    dispatch(updateTodoItem({ id: todo.id, text }));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form className="flex gap-2 items-center" onSubmit={onSubmitUpdateTodoText}>
        <input className="p-1 grow" type="text" name="todoText" defaultValue={todo.text} autoFocus />
        <button type="submit" className="text-sm text-gray-600">Save</button>
        <button className="text-sm text-red-800" onClick={() => setIsEditing(false)}>Cancel</button>
      </form>
    );
  }

  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2 p-1">
        <input type="checkbox" checked={todo.checked} onChange={onChangeTodoChecked} />
        <span className={todo.checked ? "line-through" : ""}>{todo.text}</span>
      </div>
      <span className="flex place-items-center gap-2 text-sm">
        <button className="text-gray-600" onClick={() => setIsEditing(true)}>Edit</button>
        <button className="text-red-800" onClick={onClickDeleteTodo}>Delete</button>
      </span>
    </div>
  );
}
```

---

## Advanced: Adding stats display

:::info Advanced Feature
If you implemented the advanced version with statistics tracking, you can add a stats component to display the todo counts.
:::

```typescript
// Add to TodoList.tsx
export function TodoList() {
  const [selectedTodoList] = useSelectedTodoListDocument();

  if (!selectedTodoList) return null;

  const { items, stats } = selectedTodoList.state.global;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">TodoList</h1>
      
      {/* Stats section (only show if there are items) */}
      {items.length >= 2 && (
                <div className="mb-4 bg-white rounded-lg px-3 py-2 shadow-md">
                    <div className="grid grid-cols-3 gap-3">
                        <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-lg font-semibold">{stats.total}</div>
                        </div>
                        <div>
              <div className="text-xs text-slate-500">Completed</div>
              <div className="text-lg font-semibold text-green-600">{stats.checked}</div>
                        </div>
                        <div>
              <div className="text-xs text-slate-500">Remaining</div>
              <div className="text-lg font-semibold text-orange-600">{stats.unchecked}</div>
                        </div>
                    </div>
                </div>
            )}

      <section className="mb-4">
        <Todos todos={items} />
      </section>
      <section>
        <AddTodo />
      </section>
        </div>
    );
}
```

---

## Test your editor

Now you can run the Connect app and see the **TodoList** editor in action:

```bash
ph connect
```

In Connect, in the bottom right corner you'll find a new Document Model that you can create: **TodoList**. Click on it to create a new TodoList document.

:::tip Connect as your dynamic development environment
The editor will update dynamically, so you can play around with your editor styling while seeing your results appear in Connect Studio.
:::

</details>

Congratulations!
If you managed to follow this tutorial until this point, you have successfully implemented the **TodoList** document model with its reducer operations and editor.

## Up Next

Now you can move on to creating a [custom drive explorer](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer) for your TodoList document.  
Imagine you have many TodoLists sitting in a drive. A custom drive explorer will allow you to organize and track them at a glance, opening up a new world of possibilities to increase the functionality of your documents!
