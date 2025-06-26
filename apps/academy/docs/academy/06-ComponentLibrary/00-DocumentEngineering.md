# Document-Engineering

The reusable components in the Document-Engineering system are a set of of front-end components based on graphQL scalars. 
Powerhouse also has a set of custom scalars that are not part of the graphQL standard but are specific to the web3 ecosystem.
These components are offered through the **Powerhouse Document-Engineering system** with the help of storybook & the Academy documentation. 

It provides a collection of pre-built, reusable UI components designed for consistency and efficiency across Powerhouse applications and editors. Think of it as a toolkit of standard UI elements like buttons, inputs, and checkboxes with many of these components based on graphql scalars. 

:::info
A GraphQL scalar is essentially a primitive, indivisible value in the GraphQL type system. 
Here are the key points to understand:

- **Basic Building Blocks:** Scalars are the basic data types—like String, Int, Float, Boolean, and ID—that represent atomic values.
- **Leaf Nodes:** Scalars are the "leaves" of a GraphQL query. They can't have any sub-fields, meaning once you hit a scalar in a query, that's the final value.
- **Custom Scalars:** Besides the built-in scalars, you can define custom scalars (e.g., a Date type) if you need to handle more specific formats or validations. Powerhouse does this specific for the web3 ecosystem. 
:::

## Scalars vs. General UI Components

### Scalar Components

Scalars are here to help you define custom fields in your document model schema and speed up the development process.
There are two applications of scalar components in the document model workflow:

1. At the **schema definition** level where you build your schema and write your GraphQL state schema.
2. At the **frontend / react** level where you import it and place it in your UI to represent the scalar field

These are specialized form components, each corresponding to a GraphQL scalar type (e.g., String, Number, Boolean, Currency, PHID). They are built on top of react-hook-form, offering out-of-the-box validation but must be wrapped with a Form component in order to work properly.

**Location:** @powerhousedao/document-engineering/scalars    
https://github.com/powerhouse-inc/document-engineering

**Key Feature**: Must be used within a Form component provided by this library.

### General-Purpose UI Components

This category includes a broader range of UI elements such as simplified versions of the Scalar components (which don't require a Form wrapper but lack built-in validation), as well as other versatile components like Dropdown, Tooltip, Sidebar, ObjectSetTable and more. These are designed for crafting diverse and complex user interfaces.

**Location:** @powerhousedao/document-engineering/ui   
https://github.com/powerhouse-inc/document-engineering

## Exploring Components with Storybook

We use Storybook as an interactive catalog for our design system components. It allows you to visually explore each component, interact with different states, and understand how to integrate them into your projects. [https://storybook.powerhouse.academy](https://storybook.powerhouse.academy)

**Understanding the Storybook Interface:**

1.  **Visual Demo:** The main panel shows the rendered component (e.g., a `Checkbox`). You can interact with it directly to see different states (checked, unchecked, disabled).
2.  **Usage Snippet:** Below the demo, you'll typically find a basic code example demonstrating how to include the component in your code (e.g., `<Checkbox defaultValue label="Accept terms and conditions" />`). This provides a starting point for implementation.
3.  **Props Table:** Further down, a table lists the properties (`props`) the component accepts. Props are like settings or configuration options. For the `Checkbox`, this table would show props like `label`, `defaultValue`, `value`, `onChange`, etc., often with descriptions of what they control.

## **Storybook vs. Source Code:**

Storybook serves as essential documentation and a usage guide. Our developers write Storybook "stories" to demonstrate components and document their common props. However, the **ultimate source of truth** for a component's capabilities is its actual source code (e.g., the `.tsx` file within the `@powerhousedao/document-engineering/scalars` package).
While Storybook aims for accuracy, there might occasionally be discrepancies or undocumented props.

## Implementing a Component

Let's walk through the typical workflow for using a component from the document-engineering system, using the `Checkbox` from the [To-do List editor](/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors).

1.  **Identify the Need:** While building your feature (e.g., the To-do List editor in `editor.tsx`), you determine the need for a standard UI element, like a checkbox.
2.  **Consult the Document Engineering Components in Storybook:**
    *   Open the Powerhouse Storybook instance. [https://storybook.powerhouse.academy](https://storybook.powerhouse.academy)
    *   Navigate or search to find the `Checkbox` component.
    *   Review the visual examples and interactive demo.
    *   Examine the "Usage" snippet and the **Props table** to understand the basic implementation and available configuration options (`label`, `value`, `onChange`, etc.).
3.  **Import the Component:** In your code editor, open the relevant file (e.g., `editors/to-do-list/editor.tsx`). Add an import statement at the top to bring the component into your file's scope:
    ```typescript
    import { Checkbox } from '@powerhousedao/document-engineering/scalars';
    // Or import other components as needed:
    // import { Checkbox, InputField, Button } from '@powerhousedao/document-engineering/scalars';
    ```
    This line instructs the build process to locate the `Checkbox` component within the installed `@powerhousedao/document-engineering/scalars` package and make it available for use.
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

## Usage

The Document Engineering package provides several entry points for different use cases in your powerhouse project:

### Main Package

```typescript
import { ... } from '@powerhousedao/document-engineering';
```

### UI Components

```typescript
import { ... } from '@powerhousedao/document-engineering/ui';
```

### Scalars

For data manipulation and transformation utilities:

```typescript
import { ... } from '@powerhousedao/document-engineering/scalars';
```

### GraphQL

For GraphQL related utilities and schema definitions:

```typescript
import { ... } from '@powerhousedao/document-engineering/graphql';
```

### Styles

To include the package's styles:

```typescript
import '@powerhousedao/document-engineering/style.css';
```

## Import Maps

Within the project, the following import maps are available:

- `#assets` - Assets utilities and components
- `#scalars` - Scalar transformations and utilities
- `#ui` - UI components 
- `#graphql` - GraphQL related utilities

Please don't hesitate to reach out in our discord channels with any questions.    
Happy designing! 

### Up next: Create Custom Scalars

You can learn how to do so in our guide on [Creating Custom Scalars](/academy/ComponentLibrary/CreateCustomScalars).


