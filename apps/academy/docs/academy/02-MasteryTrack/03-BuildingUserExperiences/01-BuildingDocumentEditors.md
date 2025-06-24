# Build document editors

## Build with react on powerhouse

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

For example, to generate an editor for a `To-do List` document model with a document type `powerhouse/todolist`:
```bash
ph generate --editor ToDoList --document-types powerhouse/todolist
```
This will create the template in the `editors/to-do-list/editor.tsx` folder.

### Styling your editor

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

### State management in editors

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

## Powerhouse component library

Powerhouse provides a rich set of reusable UI components through the **`@powerhousedao/document-engineering/scalars`** package. These components are designed for consistency, efficiency, and seamless integration with the Powerhouse ecosystem, with many based on GraphQL scalar types.

### Exploring components
You can explore available components, see usage examples, and understand their properties (props) using our Storybook instance:
[https://storybook.powerhouse.academy](https://storybook.powerhouse.academy)

Storybook allows you to:
*   Visually inspect each component.
*   Interact with different states and variations.
*   View code snippets for basic implementation.
*   Consult the props table for detailed configuration options.

### Using components
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

<details>
<summary>Tutorial: Implementing the `To-do List` Editor</summary>

## Build a To-do List editor

In this final part of our tutorial we will continue with the interface or editor implementation of the **To-do List** document model. This means you will create a simple user interface for the **To-do List** document model which will be used inside the Connect app to create, update and delete your To-do List items, but also dispaly the statistics we've implemented in our reducers. 

## Generate the editor template

Run the command below to generate the editor template for the **To-do List** document model.   
This command reads the **To-do List** document model definition from the `document-models` folder and generates the editor template in the `editors/to-do-list` folder as `editor.tsx`.

Notice the `--editor` flag which specifies the **To-do List** document model, and the `--document-types` flag defines the document type `powerhouse/todolist`.

```bash
ph generate --editor ToDoList --document-types powerhouse/todolist
```

Once complete, navigate to the `editors/to-do-list/editor.tsx` file and open it in your editor.


### Editor implementation options

When building your editor component within the Powerhouse ecosystem, you have several options for styling, allowing you to leverage your preferred methods:

1.  **Default HTML Styling:** Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default styles offered through the boilerplate. 
2.  **Tailwind CSS:** Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes for rapid, consistent styling without writing separate CSS files.
3.  **Custom CSS Files:** You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.

Connect Studio provides a dynamic local environment (`ph connect`) to visualize your components instantly as you build them, regardless of the styling method you choose. Manual build steps are typically only needed when publishing packages.

---

## To-do List editor

:::tip Implementing components
The editor we are about to implement makes use of some components from **Powerhouse Document Engineering**. 
When you add the editor code, you'll see it makes use of two components, the `Checkbox` and `InputField`.
These are imported from the Powerhouse Document Engineering design system (`@powerhousedao/document-engineering/scalars`) which you should find under 'devdependencies' in your package.json file.   

This system provides a library of reusable components to ensure consistency and speed up development.  
You can explore available components, see usage examples, and understand their properties (props) using our Storybook instance. For a detailed guide on how to leverage the Document Engineering design system and Storybook, see [Using the Powerhouse Document Engineering](/academy/ComponentLibrary/DocumentEngineering) page.

For this tutorial, create a `components` folder inside `editors/to-do-list`. Then, within this new `components` folder, create the files for the `Checkbox` and `InputField` components (e.g., `checkbox.tsx` and `inputfield.tsx`) with the following code:
:::

<details>
<summary>Checkbox</summary>
```typescript
import { Form, BooleanField } from "@powerhousedao/document-engineering/scalars";

interface CheckboxProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export const Checkbox = ({ value, onChange }: CheckboxProps) => {
  return (
    <Form onSubmit={() => {}}>
      <BooleanField 
        name="checked"
        description="Check this box to mark the todo as completed"
        value={value}
        onChange={onChange}
      />
    </Form>
  );
};
```
</details>

<details>
<summary>Inputfield</summary>
```typescript
import { Form, StringField } from "@powerhousedao/document-engineering/scalars";

interface InputFieldProps {
  input: string;
  value: string;
  label?: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export const InputField = (props: InputFieldProps) => {
  const { input, value, label, onKeyDown, handleInputChange } = props;

  return (
    <Form
      defaultValues={{
        input: input,
      }}
      onSubmit={() => {}}
      resetOnSuccessfulSubmit
    >
      <StringField
        style={{
          color: "black",
        }}
        label={label}
        name="input"
        value={value}
        onKeyDown={onKeyDown}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          handleInputChange(e);
        }}
      />
    </Form>
  );
};
```
</details>


Below is the complete code for the To-Do List editor. It primarily uses Tailwind CSS for styling and imports the local `Checkbox` and `InputField` components you created in the previous step. These local components, in turn, utilize elements from the Powerhouse Document Engineering design system.

<details>
<summary>Complete To-do List Editor Example (using Tailwind CSS)</summary>

```typescript
import { EditorProps } from 'document-model'; // Core type for editor components.
import {
    ToDoListState,       // Type for the global state of the ToDoList.
    ToDoListAction,      // Type for actions that can modify the ToDoList state.
    ToDoListLocalState,  // Type for local (non-shared) editor state (if needed).
    ToDoItem,            // Type for a single item in the list.
    actions,             // Object containing action creators for dispatching changes.
    ToDoListDocument     // The complete document structure including state and metadata.
} from '../../document-models/to-do-list/index.js'; // Path to your document model definition.
import { useState } from 'react'; // React hook for managing component-local state.
import { Checkbox } from './components/checkbox.js'; // Custom Checkbox component.
import { InputField } from './components/inputfield.js'; // Custom InputField component.

// Define the props expected by this Editor component. It extends EditorProps with our specific document type.
export type IProps = EditorProps<ToDoListDocument>;

// Define the main Editor component function.
export default function Editor(props: IProps) {
    // Destructure props for easier access.
    const { document, dispatch } = props;
    // Access the global state from the document object.
    const { state: { global: state } } = document;

    // --- Component State ---
    // State for the text input field where new tasks are typed.
    const [todoItem, setTodoItem] = useState('');
    // State to track which item is currently being edited (null if none). Stores the item's ID.
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    // State to hold the text of the item currently being edited.
    const [editedText, setEditedText] = useState('');

    // Sort items to show unchecked items first
    const sortedItems: ToDoItem[] = [...state.items].sort((a, b) => {
        return (a.checked ? 1 : 0) - (b.checked ? 1 : 0);
    });

    // --- JSX Structure (What gets rendered) ---
    return (
        // Main container div.
        // `container`: Sets max-width based on viewport breakpoints.
        // `mx-auto`: Centers the container horizontally.
        // `p-4`: Adds padding on all sides (4 units, typically 1rem).
        // `max-w-sm`: Sets a maximum width (small size).
        <div className="container mx-auto p-4 max-w-xs">
            {/* Heading for the editor */}
            {/* `text-2xl`: Sets font size to extra-large. */}
            {/* `font-bold`: Makes the text bold. */}
            {/* `mb-4`: Adds margin to the bottom. */}
            <h1 className="text-2xl font-bold mb-4">To-do List</h1>

            {/* Stats Section */}
            {state.items.length >= 2 && (
                <div className="mb-4 bg-white rounded-lg px-3 py-2 shadow-md">
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <div className="text-xs text-slate-500 mb-0.5">Total</div>
                            <div className="text-lg font-semibold text-slate-800">{state.stats.total}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-0.5">Completed</div>
                            <div className="text-lg font-semibold text-green-600">{state.stats.checked}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-0.5">Remaining</div>
                            <div className="text-lg font-semibold text-orange-600">{state.stats.unchecked}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Container for the input field and "Add" button */}
            {/* `flex items-end`: Enables flexbox layout for children with bottom alignment. */}
            {/* `gap-2`: Adds a small gap between flex items. */}
            {/* `mb-4`: Adds margin to the bottom. */}
            <div className="flex items-end gap-2 mb-4">
                {/* Custom InputField component */}
                <div className="flex-grow">
                    <InputField
                        label="New Task" // Prop for accessibility/placeholder.
                        input={todoItem} // Current value from state.
                        value={todoItem} // Controlled component value.
                        handleInputChange={(e) => setTodoItem(e.target.value)} // Update state on change.
                        onKeyDown={(e) => { // Handle "Enter" key press to add item.
                            if (e.key === 'Enter' && todoItem.trim()) { // Check if key is Enter and input is not empty
                                dispatch(actions.addTodoItem({ // Dispatch action to add item.
                                    id: Math.random().toString(), // Generate a simple unique ID (use a better method in production!).
                                    text: todoItem,
                                }));
                                setTodoItem(''); // Clear the input field.
                            }
                        }}
                    />
                </div>
                {/* "Add" button */}
                {/* `bg-blue-500`: Sets background color to blue. */}
                {/* `hover:bg-blue-600`: Changes background color on hover. */}
                {/* `text-white`: Sets text color to white. */}
                {/* `px-4`: Adds horizontal padding (4 units). */}
                {/* `py-1.5`: Adds vertical padding (1.5 units). */}
                {/* `rounded`: Applies rounded corners. */}
                {/* `transition-colors`: Smoothly animates color changes. */}
                <button
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded transition-colors"
                    onClick={() => { // Handle button click to add item.
                        if (todoItem.trim()) { // Check if input is not empty
                            dispatch(actions.addTodoItem({ // Dispatch action to add item.
                                id: Math.random().toString(), // Simple unique ID.
                                text: todoItem,
                            }));
                            setTodoItem(''); // Clear the input field.
                        }
                    }}
                >
                    Add
                </button>
            </div>

            {/* Unordered list to display the to-do items */}
            {/* `list-none`: Removes default list bullet points. */}
            {/* `p-0`: Removes default padding. */}
            <ul className="list-none p-0">
                {/* Map over the items array in the global state to render each item */}
                {sortedItems.map((item: ToDoItem) => (
                    // List item element for each to-do.
                    // `key={item.id}`: React requires a unique key for list items for efficient updates.
                    // `flex`: Enables flexbox layout (checkbox, text, delete icon in a row).
                    // `items-center`: Aligns items vertically in the center.
                    // `p-2`: Adds padding.
                    // `relative`: Needed for positioning the delete icon absolutely (if we were doing that).
                    // `border-b`: Adds a bottom border.
                    // `border-gray-100`: Sets border color to light gray.
                    <li
                        key={item.id}
                        className="flex items-center p-2 relative border-b border-gray-100"
                    >
                        {/* Custom Checkbox component */}
                        <Checkbox
                            value={item.checked} // Bind checked state to item's checked property.
                            onChange={() => { // Handle checkbox click.
                                dispatch(actions.updateTodoItem({ // Dispatch action to update item.
                                    id: item.id,
                                    checked: !item.checked, // Toggle the checked state.
                                }));
                            }}
                        />

                        {/* Conditional Rendering: Show input field or text based on editing state */}
                        {editingItemId === item.id ? (
                            // --- Editing State ---
                            // Input field shown when this item is being edited.
                            // `ml-2`: Adds left margin.
                            // `flex-grow`: Allows input to take available horizontal space.
                            // `p-1`: Adds small padding.
                            // `border`: Adds a default border.
                            // `rounded`: Applies rounded corners.
                            // `focus:outline-none`: Removes the default browser focus outline.
                            // `focus:ring-1 focus:ring-blue-500`: Adds a custom blue ring when focused.
                            <input
                                className="ml-2 flex-grow p-1 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={editedText} // Controlled input value from editedText state.
                                onChange={(e) => setEditedText(e.target.value)} // Update editedText state.
                                onKeyDown={(e) => { // Handle "Enter" key to save changes.
                                    if (e.key === 'Enter') {
                                        dispatch(actions.updateTodoItem({ // Dispatch update action.
                                            id: item.id,
                                            text: editedText, // Save the edited text.
                                        }));
                                        setEditingItemId(null); // Exit editing mode.
                                    }
                                }}
                                autoFocus // Automatically focus the input when it appears.
                            />
                        ) : (
                            // --- Display State ---
                            // Container for the item text and delete icon when not editing.
                            // `ml-2`: Adds left margin.
                            // `flex items-center`: Aligns text and icon vertically.
                            // `flex-grow`: Allows this container to take available space.
                            // `gap-1`: Adds a small gap between text and icon.
                            <div className="ml-2 flex items-center flex-grow gap-1">
                                {/* The actual to-do item text */}
                                {/* `cursor-pointer`: Shows a pointer cursor on hover, indicating clickability. */}
                                {/* Conditional class: Apply line-through and gray text if item is checked. */}
                                {/* `line-through`: Strikes through the text. */}
                                {/* `text-gray-500`: Sets text color to gray. */}
                                <span
                                    className={`cursor-pointer ${item.checked ? 'line-through text-gray-500' : ''}`}
                                    onClick={() => { // Handle click to enter editing mode.
                                        setEditingItemId(item.id); // Set the ID of the item being edited.
                                        setEditedText(item.text); // Initialize the input with current text.
                                    }}
                                >
                                    {item.text} {/* Display the item's text */}
                                </span>
                                {/* Delete "button" (using a span styled as a button) */}
                                {/* `text-gray-400`: Sets default text color to light gray. */}
                                {/* `cursor-pointer`: Shows pointer cursor. */}
                                {/* `opacity-40`: Makes it semi-transparent by default. */}
                                {/* `transition-all duration-200`: Smoothly animates all changes (opacity, color). */}
                                {/* `text-base font-bold`: Sets text size and weight. */}
                                {/* `inline-flex items-center`: Needed for proper alignment if using an icon font/SVG. */}
                                {/* `pl-1`: Adds small left padding. */}
                                {/* `hover:opacity-100`: Makes it fully opaque on hover. */}
                                {/* `hover:text-red-500`: Changes text color to red on hover. */}
                                <span
                                    className="text-gray-400 cursor-pointer opacity-40 transition-all duration-200 text-base font-bold inline-flex items-center pl-1 hover:opacity-100 hover:text-red-500"
                                    onClick={() => dispatch(actions.deleteTodoItem({ id: item.id }))} // Dispatch delete action on click.
                                >
                                    × {/* Simple multiplication sign used as delete icon */}
                                </span>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
```
</details>

Now you can run the Connect app and see the **To-do List** editor in action.

```bash
ph connect
```

In Connect, in the bottom right corner you'll find a new Document Model that you can create: **To-do List**. Click on it to create a new To-do List document.

:::tip Connect as your dynamic development environment
The editor will update dynamically, so you can play around with your editor styling while seeing your results appear in Connect Studio. 
:::

</details>

Congratulations!
If you managed to follow this tutorial until this point, you have successfully implemented the **To-do List** document model with its reducer operations and editor. 

Now you can move on to creating a [custom drive explorer](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer) for your To-do List document.    
Imagine you have many To-do Lists sitting in a drive. A custom drive explorer will allow you to organize and track them at a glance, opening up a new world of possibilities to increase the functionality of your documents!
