# Build Document Editors (WIP)

## Build with React on Powerhouse

At Powerhouse, frontend development for document editors follows a simple and familiar flow, leveraging the power and flexibility of React.

### Development Environment

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

### Generating Your Editor Template

To kickstart your editor development, Powerhouse provides a command to generate a basic editor template. This command reads your document model specifications and creates the initial `editor.tsx` file.
If you want a refresher on how to define your document model specification please read the chapter on [specifying the State Schema](/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema)

For example, to generate an editor for a `ToDoList` document model with a document type `powerhouse/todolist`:
```bash
ph generate --editor ToDoList --document-types powerhouse/todolist
```
This will create the template in the `editors/to-do-list/editor.tsx` folder.

### Styling Your Editor

You have several options for styling your editor components:

1.  **Default HTML Styling**: Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default browser styles or any base styling provided by the Connect environment. This is suitable for basic structure and quick prototyping.

2.  **Tailwind CSS**: Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes in your JSX for rapid and consistent styling without writing separate CSS files.
    *Example (from the ToDoList Editor):*
    ```typescript
    <div className="container mx-auto p-4 max-w-md">
        <h1 className="text-2xl font-bold mb-4">To-do List</h1>
        {/* ... more Tailwind styled elements */}
    </div>
    ```

3.  **Custom CSS Files**: You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.
    *Create an `editor.css` file in your editor's directory:*
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
    *Import and use it in your `editor.tsx`:*
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

### State Management in Editors

When you build an editor in Powerhouse, your main editor component receives `EditorProps`. These props are crucial for interacting with the document:

*   **`document`**: This object contains the entire document structure, including its current state. You'll typically access the global document state via `document.state.global`.
*   **`dispatch`**: This function is your gateway to modifying the document's state. You call `dispatch` with an action object (usually created by action creators from your document model's generated code) to signal an intended change.

**Local vs. Global State:**
*   **Local Component State**: For UI-specific state that doesn't need to be part of the persisted document model (e.g., the current text in an input field before submission, visibility of a dropdown), use React's `useState` hook.
    ```typescript
    const [inputValue, setInputValue] = useState('');
    // ...
    <input value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
    ```
*   **Global Document State**: For data that is part of the document itself and should be saved (e.g., the items in a to-do list), you modify it by dispatching actions. The `document.state.global` object provides read-only access to this state within your editor.

**Dispatching Actions:**
Your document model's generated code (e.g., in `document-models/your-model/index.js` or `document-models/your-model/gen/operations.js`) will provide action creators.
```typescript
// Assuming 'actions' are imported from your document model
// import { actions } from '../../document-models/to-do-list/index.js';

// Inside your editor component:
// function Editor({ document, dispatch }: IProps) {
//   ...
//   const handleAddItem = () => {
//     if (todoItem.trim()) {
//       dispatch(actions.addTodoItem({ // Dispatch action to add item.
//         id: Math.random().toString(), // Generate a simple unique ID
//         text: todoItem,
//       }));
//       setTodoItem(''); // Clear local input state
//     }
//   };
// }
```
The actual state modification logic resides in your document model's reducers, ensuring that all changes are consistent and follow the defined operations.

## Powerhouse Component Library

Powerhouse provides a rich set of reusable UI components through the **`@powerhousedao/document-engineering/scalars`** package. These components are designed for consistency, efficiency, and seamless integration with the Powerhouse ecosystem, with many based on GraphQL scalar types.

### Exploring Components
You can explore available components, see usage examples, and understand their properties (props) using our Storybook instance:
[https://storybook.powerhouse.academy](https://storybook.powerhouse.academy)

Storybook allows you to:
*   Visually inspect each component.
*   Interact with different states and variations.
*   View code snippets for basic implementation.
*   Consult the props table for detailed configuration options.

### Using Components
1.  **Import**: Add an import statement at the top of your editor file:
    ```typescript
    import { Checkbox, StringField, Form } from '@powerhousedao/document-engineering/scalars';
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

### Creating Local Wrapper Components
Sometimes, you might want to create local wrapper components in your editor's project to encapsulate specific configurations or behaviors for library components. This was demonstrated in the "Build a ToDoList Editor" tutorial with `Checkbox.tsx` and `InputField.tsx` components, which internally used `BooleanField` and `StringField` from the `@powerhousedao/document-engineering/scalars` library.

**Example: Local `Checkbox` Wrapper (conceptual)**
```typescript
// editors/to-do-list/components/checkbox.tsx
import { Form, BooleanField } from "@powerhousedao/document-engineering/scalars";

interface CustomCheckboxProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string; // Added custom prop or passed through
}

export const Checkbox = ({ value, onChange, label }: CustomCheckboxProps) => {
  return (
    <Form onSubmit={() => { /* May not be needed for simple checkbox */ }}>
      <BooleanField 
        name="customChecked" // Internal name for the form field
        description={label || "Toggle state"} // Use label for description
        value={value}
        onChange={onChange}
      />
    </Form>
  );
};
```
This pattern helps keep your main editor file cleaner and allows for more complex compositions.

## Conceptual Example: Building a ToDoList Editor

Let's consider key aspects of building an editor like the `ToDoList` example:

1.  **Input for New Items**:
    *   Use a local `useState` to manage the text of the new to-do item.
    *   Use an `InputField` (or a `StringField` from the library) for text entry.
    *   On "Add" button click or "Enter" key press, `dispatch` an `addTodoItem` action with the current input value.

2.  **Displaying List Items**:
    *   Map over `document.state.global.items`.
    *   For each item, display its `text` and a `Checkbox`.
    *   The `Checkbox` `value` should be bound to `item.checked`.
    *   Its `onChange` handler should `dispatch` an `updateTodoItem` action to toggle the `checked` status.

3.  **Editing Items**:
    *   Implement local state (`editingItemId`, `editedText`) to manage which item is being edited and its current text.
    *   Conditionally render either the item text (display mode) or an input field (edit mode).
    *   When entering edit mode, populate `editedText` with the item's current text.
    *   On saving the edit (e.g., "Enter" key in the input), `dispatch` an `updateTodoItem` action with the new text.

4.  **Deleting Items**:
    *   Provide a delete button/icon next to each item.
    *   Its `onClick` handler should `dispatch` a `deleteTodoItem` action with the item's `id`.

By combining local React state for UI control with dispatched actions for document state mutations, and leveraging the Powerhouse Component Library, you can build powerful and interactive document editors. Always refer to your document model's defined operations and state schema as the source of truth for how data should be structured and modified.