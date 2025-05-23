# Powerhouse Design System

The reusable components are a set of of front-end components based on graphQL scalars. 
Powerhouse also has a set of custom scalars that are not part of the graphQL standard but are specific to the web3 ecosystem.
These components are offered through the **Powerhouse Design System** with the help of storybook & the Academy documentation. 

It provides a collection of pre-built, reusable UI components designed for consistency and efficiency across Powerhouse applications and editors. Think of it as a toolkit of standard UI elements like buttons, inputs, and checkboxes with many of these components based on graphql scalars. 

:::info
A GraphQL scalar is essentially a primitive, indivisible value in the GraphQL type system. 
Here are the key points to understand:

- **Basic Building Blocks:** Scalars are the basic data types—like String, Int, Float, Boolean, and ID—that represent atomic values.
- **Leaf Nodes:** Scalars are the "leaves" of a GraphQL query. They can't have any sub-fields, meaning once you hit a scalar in a query, that's the final value.
- **Custom Scalars:** Besides the built-in scalars, you can define custom scalars (e.g., a Date type) if you need to handle more specific formats or validations. Powerhouse does this specific for the web3 ecosystem. 
:::

In the next few chapters of our documentation, we will start with the simplest scalar components first, then move on to more complex, Powerhouse-specific components, and combine these in the Layout components.

## **3 types of components**

1. **Simple Component** has a scalar value as input 
    - Component, Composition of smaller UI controls (e.g. Scalar component)
    
2. **Complex Component** has an object/array value 
    - Group of components (e.g. sidebar tree view)
    
3. **Layout Component** will contain other components 
    - Containers for other components, Sections (e.g. list of other components, color layouts, etc.)

The documentation of each of the reusable components in the Academy documentation will be structured as follows:

1. **Component Context**
2. **Scalar Definition**
3. **Component Storybook Base Example**
    - Component Code
    - Component Default Props
4. **Component Storybook Usage Examples**

## Exploring Components with Storybook

We use Storybook as an interactive catalog for our design system components. It allows you to visually explore each component, interact with different states, and understand how to integrate them into your projects.

[https://storybook.powerhouse.academy](https://storybook.powerhouse.academy)

**Understanding the Storybook Interface:**

1.  **Visual Demo:** The main panel shows the rendered component (e.g., a `Checkbox`). You can interact with it directly to see different states (checked, unchecked, disabled).
2.  **Usage Snippet:** Below the demo, you'll typically find a basic code example demonstrating how to include the component in your code (e.g., `<Checkbox defaultValue label="Accept terms and conditions" />`). This provides a starting point for implementation.
3.  **Props Table:** Further down, a table lists the properties (`props`) the component accepts. Props are like settings or configuration options. For the `Checkbox`, this table would show props like `label`, `defaultValue`, `value`, `onChange`, etc., often with descriptions of what they control.

## Implementing a Design System Component

Let's walk through the typical workflow for using a component from the design system, using the `Checkbox` from the [To-do List editor](/docs/academy/GetStarted/ToDoList/BuildToDoListEditor).

1.  **Identify the Need:** While building your feature (e.g., the To-do List editor in `editor.tsx`), you determine the need for a standard UI element, like a checkbox.
2.  **Consult the Resuable Components in Academy or in Storybook:**
    *   Open the Powerhouse Storybook instance.
    *   Navigate or search to find the `Checkbox` component.
    *   Review the visual examples and interactive demo.
    *   Examine the "Usage" snippet and the **Props table** to understand the basic implementation and available configuration options (`label`, `value`, `onChange`, etc.).
3.  **Import the Component:** In your code editor, open the relevant file (e.g., `editors/to-do-list/editor.tsx`). Add an import statement at the top to bring the component into your file's scope:
    ```typescript
    import { Checkbox } from '@powerhousedao/design-system/scalars';
    // Or import other components as needed:
    // import { Checkbox, InputField, Button } from '@powerhousedao/design-system/scalars';
    ```
    This line instructs the build process to locate the `Checkbox` component within the installed `@powerhousedao/design-system/scalars` package and make it available for use.
4.  **Use and Configure the Component:** Place the component tag in your JSX where needed. Use the information from Storybook (usage snippet and props table) as a guide, but adapt the props to your specific requirements within `editor.tsx`:
    ```typescript
    // Example from the To-do List Editor:
    <Checkbox
        // Bind the checked state to data within editor.tsx
        value={item.checked} 
        // Provide a function from editor.tsx to handle changes
        onChange={() => { 
            dispatch(actions.updateTodoItem({
                id: item.id,
                checked: !item.checked,
            }));
        }}
        // Other props like 'label' might be omitted or added as needed.
    />
    ```
    You configure the component's appearance and behavior by passing the appropriate values to its props.
5.  **Test and Refine:** Run your application (e.g., using `ph connect`) to see the component in context. Verify its appearance and functionality.

**Storybook vs. Source Code:**

Storybook serves as essential documentation and a usage guide. Our developers write Storybook "stories" to demonstrate components and document their common props. However, the **ultimate source of truth** for a component's capabilities is its actual source code (e.g., the `.tsx` file within the `@powerhousedao/design-system/scalars` package).
While Storybook aims for accuracy, there might occasionally be discrepancies or undocumented props.

Please don't hesitate to reach out in our discord channels with any questions. 
Happy designing! 