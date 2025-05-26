# Build a Todo-list Editor

In this chapter we will continue with the interface or editor implementation of the **ToDoList** document model editor. This means you will create a simple user interface for the **ToDoList** document model which will be used inside the Connect app to create, update and delete your ToDoList items.

## Generate the editor template

Run the command below to generate the editor template for the **ToDoList** document model. This command reads the **ToDoList** document model definition from the `document-models` folder and generates the editor template in the `editors/to-do-list/editor.tsx` folder.

Notice the `--editor` flag which defines the **ToDoList** document model. And the `--document-types` flag which defines the document type `powerhouse/todolist`.

```bash
ph generate --editor ToDoList --document-types powerhouse/todolist
```

Once complete, navigate to the `editors/to-do-list/editor.tsx` file and open it in your editor.


### Editor Implementation Options

When building your editor component within the Powerhouse ecosystem, you have several options for styling, allowing you to leverage your preferred methods:

1.  **Default HTML Styling:** Standard HTML tags (`<h1>`, `<p>`, `<button>`, etc.) will render with default browser styles or any base styling provided by the Connect environment. This is the simplest approach for basic structure.
2.  **Tailwind CSS:** Connect Studio comes with Tailwind CSS integrated. You can directly use Tailwind utility classes for rapid, consistent styling without writing separate CSS files.
3.  **Custom CSS Files:** You can import traditional CSS files (`.css`) to apply custom styles or integrate existing style libraries.

Connect Studio provides a dynamic local environment (`ph connect`) to visualize your components instantly as you build them, regardless of the styling method you choose. Manual build steps are typically only needed when publishing packages.

Let's look at a simple example component structure and how each styling method can be applied.

**Example Component Structure (Base HTML with inline styles)**

<details>
<summary>Base HTML Example</summary>

Here's a basic editor structure using only standard HTML tags.    
This demonstrates how elements look with very minimal default styling:

```typescript
import { EditorProps } from 'document-model';
// Assuming a simple document model for demonstration
// import { ExampleDocument, actions } from '../../document-models/example'; 

// Replace with your actual document type props if needed
export type IProps = EditorProps<any>; 

export default function Editor({ document, dispatch }: IProps) {
    return (
        <div>
            <h1 style={{ fontWeight: 'bold' }}>Document Title</h1>
            <h2>Document Subtitle</h2>
            <input 
                type="text" 
                placeholder="Small text input"
                style={{ border: '1px solid gray', marginBottom: '0.5rem' }}
            />
            <textarea 
                placeholder="Large text area" 
                rows={4}
                style={{ border: '1px solid gray', display: 'block', marginBottom: '0.5rem' }}
            />
            <button style={{ backgroundColor: 'yellow' }}>
                Submit
            </button>
        </div>
    );
}
```
</details>

*Run `ph connect` to see the default styles applied to components in real-time.*

**Styling with Tailwind CSS**

<details>
<summary>Tailwind CSS Example</summary>

Now, let's add Tailwind utility classes to the same structure for styling:

```typescript
import { EditorProps } from 'document-model';
// import { ExampleDocument, actions } from '../../document-models/example';

export type IProps = EditorProps<any>;

export default function Editor({ document, dispatch }: IProps) {
    return (
        <div className="p-4 space-y-4"> {/* Add padding and spacing */}
            <h1 className="text-2xl font-bold">Document Title</h1> {/* Style heading */}
            <h2 className="text-lg text-gray-600 mb-4">Document Subtitle</h2> {/* Style subheading */}
            <input 
                type="text" 
                placeholder="Small text input"
                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" // Style input
            />
            <textarea 
                placeholder="Large text area" 
                rows={4}
                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500" // Style textarea
            />
            <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"> {/* Style button */}
                Submit
            </button>
        </div>
    );
}
```
</details>

*Run `ph connect` to see these Tailwind styles applied in real-time.*

**Styling with a Custom CSS File**

<details>
<summary>Custom CSS File Example</summary>

You can also import a standard CSS file.

1.  Create a CSS file (e.g., `editor.css`) in the same directory as your `editor.tsx`:

    ```css
        /* editors/your-editor/editor.css */
    .editor-container {
        padding: 1rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    .editor-title {
        color: rgb(51, 51, 54);
        font-size: 2rem;
        margin-bottom: 4px;
    }

    .editor-subtitle {
        color: rgb(51, 51, 54);
        font-size: 1.5rem;
        margin-bottom: 4px;
    }

    .editor-button {
        background-color: green;
        color: white;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .editor-button:hover {
        background-color: darkgreen;
    }
    ```

2.  Import the CSS file and use the classes in your component:

```typescript
  import { EditorProps } from 'document-model';
// import { ExampleDocument, actions } from '../../document-models/example';
import './editor.css'; // Import the CSS file

export type IProps = EditorProps<any>;

export default function Editor({ document, dispatch }: IProps) {
    return (
        <div className="editor-container"> {/* Use custom class */}
            <h1 className="editor-title">Document Title</h1> {/* Use custom class */}
            <h2 className="editor-subtitle">Document Subtitle</h2> {/* Default or other styles */}
            <input 
                type="text" 
                placeholder="Small text input" 
                className="w-full p-2 border rounded mb-4" // Can mix with Tailwind/defaults
            />
            <textarea 
                placeholder="Large text area" 
                rows={4} 
                className="w-full p-2 border rounded mb-4" // Can mix with Tailwind/defaults
            />
            <button className="editor-button"> {/* Use custom class */}
                Submit
            </button>
        </div>
    );
}  
```
</details>
 
*Run `ph connect` to see your custom CSS styles applied.*

---

## To-do List Editor 

:::tip
### Implementing Components
The editor we are about to implement makes use of some components from the **Powerhouse Design System**.   
When you'll add the editor code you'll see it makes use of two components, the `Checkbox` and `InputField`.    
These are imported from the Powerhouse Design System (`@powerhousedao/design-system/scalars`).   

This system provides a library of reusable components to ensure consistency and speed up development.  
You can explore available components, see usage examples, and understand their properties (props) using our Storybook instance. For a detailed guide on how to leverage the design system and Storybook, see [using the Powerhouse Design System](/docs/academy/ComponentLibrary/PowerhouseDesignSystem) page.

For our tutorial you can now create a `components` folder in the `editors/to-do-list` folder and add the following code to each of the components
:::

<details>
<summary>Checkbox</summary>
```typescript
import { Form, BooleanField } from "@powerhousedao/design-system/scalars";

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
import { Form, StringField } from "@powerhousedao/design-system/scalars";

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


Below is the complete code for the To-do List editor, primarily using Tailwind CSS for styling and importing the components from the Powerhouse Design System. 

<details>
<summary>Complete To-do-list Editor Example (using Tailwind CSS)</summary>

```typescript
// Import necessary types and components.
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
import { InputField } from './components/inputField.js'; // Custom InputField component.

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

    // --- JSX Structure (What gets rendered) ---
    return (
        // Main container div.
        // `container`: Sets max-width based on viewport breakpoints.
        // `mx-auto`: Centers the container horizontally.
        // `p-4`: Adds padding on all sides (4 units, typically 1rem).
        // `max-w-md`: Sets a maximum width (medium size).
        <div className="container mx-auto p-4 max-w-md">
            {/* Heading for the editor */}
            {/* `text-2xl`: Sets font size to extra-large. */}
            {/* `font-bold`: Makes the text bold. */}
            {/* `mb-4`: Adds margin to the bottom (4 units). */}
            <h1 className="text-2xl font-bold mb-4">To-do List</h1>

            {/* Container for the input field and "Add" button */}
            {/* `flex items-end`: Enables flexbox layout for children with bottom alignment. */}
            {/* `gap-2`: Adds a small gap between flex items. */}
            {/* `mb-4`: Adds margin to the bottom. */}
            <div className="flex items-end gap-2 mb-4">
                {/* Custom InputField component */}
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
                {state.items.map((item: ToDoItem) => (
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

Now you can run the Connect app and see the **ToDoList** editor in action.

```bash
ph connect
```

In Connect, in the bottom right corner you'll find a new Document Model that you can create: **ToDoList**.    
Click on it to create a new ToDoList document.

:::info
The editor will update dynamically, so you can play around with your editor styling while seeing your results appear in Connect Studio. 
:::

Congratulations!
If you managed to follow this tutorial until this point, you have successfully implemented the **ToDoList** document model with its reducer operations and editor. 

Now you can move on to creating a [custom drive explorer](/docs/academy/AdvancedTutorial/BuildingUserExperiences/BuildingADriveExplorer) for your ToDoList document.    
Imagine you have many ToDoLists sitting in a drive. A custom drive explorer will allow you to organize and track them at a glance, opening up a new world of possibilities to increase the functionality of your documents!



