# React Hooks

On this page we're providing an overview of the available hooks you can make use of as a builder. 

<details>
<summary>Need a refresher on React Hooks?</summary>

React Hooks allow you to use various React features directly within your functional components. You can use built-in Hooks or combine them to create your own custom Hooks.

**What are Custom Hooks?**
A custom hook is a JavaScript function whose name starts with "use" and that calls other Hooks. They are used to:
- Reuse stateful logic between components.
- Abstract complex logic into a simpler interface.
- Isolate side effects, particularly those managed by `useEffect`.

**Key Built-in Hooks Examples:**
- `useState`: Lets a component "remember" information (state).
- `useEffect`: Lets a component perform side effects (e.g., data fetching, subscriptions, manually changing the DOM).
- `useContext`: Lets a component receive information from distant parent components without explicitly passing props through every level of the component tree.

**Naming Convention:**
Hook names must always start with `use` followed by a capital letter (e.g., `useState`, `useOnlineStatus`).

**Rules of Hooks:**
1.  **Only Call Hooks at the Top Level**: Don't call Hooks inside loops, conditions, or nested functions.
2.  **Only Call Hooks from React Functions**: Call Hooks from React functional components or from custom Hooks.

It's important to note that a function should only be named and treated as a hook if it actually utilizes one or more built-in React hooks. If a function (even if named `useSomething`) doesn't call any built-in hooks, it behaves like a regular JavaScript function, and making it a "hook" offers no specific React advantages.

For more details, see the official documentation and API references of React:
- [Reusing Logic with Custom Hooks (react.dev)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Rules of Hooks (react.dev)](https://react.dev/reference/rules/rules-of-hooks)
- [Powerhouse React Hooks API Reference](docs/academy/APIReferences/ReactHooks)

</details>

The idea is to make the usage of our hooks feel as simple and familiar as using `useState`.   
The Powerhouse team is currently working on a happy path for builders that look like this: 

```js
// in a component that only needs to read a value, you can use
const invoiceName = useReadDocumentField('myInvoiceDocumentId', 'name') // returns a string which is the `name`
// and for documents that need to update data as well, you would have
const updateInvoiceName = useUpdateDocumentField('myInvoiceDocumentId', 'name') // returns a function that takes a new string for the new name and dispatches the update
// finally, we can combine these into a single hook which works like react's useState hook returning both the value and updater function
const [invoiceName, updateInvoiceName] = useDocumentField('myInvoiceDocumentId', 'name')


// Read-only value
const invoiceName = useReadDocumentField('docId', 'name')

// Write-only updater
const updateInvoiceName = useUpdateDocumentField('docId', 'name')

// Combined read + write (like useState)
const [invoiceName, updateInvoiceName] = useDocumentField('docId', 'name')
```


## An overview of currently available hooks

### 1. Getting or changing data 
These are tools you (or your devs) can use in your app to get or change data:

<details>
<summary>`useDrives`, `useDriveById(id)`: Lets you access folders (called "drives").</summary>

### Hook Name and Signature   
The name of the hook and its TypeScript (or JavaScript) signature.
### Description
A brief explanation of what the hook does and when to use it.
### Usage Example   
A code snippet showing how to use the hook in a real-world scenario.
### Parameters
A table or list describing each parameter, its type, and its purpose.
### Return Value   
A description (and sometimes a table) of what the hook returns.
### Notes / Caveats   
Any important details, gotchas, or best practices.
### Related Hooks
Links to other relevant hooks or documentation.
</details>

<details>
<summary>`useDocuments`, `useDocumentById(id)`: Lets you access files (called "documents").</summary>

### Hook Name and Signature   
The name of the hook and its TypeScript (or JavaScript) signature.
### Description
A brief explanation of what the hook does and when to use it.
### Usage Example   
A code snippet showing how to use the hook in a real-world scenario.
### Parameters
A table or list describing each parameter, its type, and its purpose.
### Return Value   
A description (and sometimes a table) of what the hook returns.
### Notes / Caveats   
Any important details, gotchas, or best practices.
### Related Hooks
Links to other relevant hooks or documentation.
</details>

<details>
<summary>`useEditorModules`, `useEditor(documentType)`: Loads the relevant editor UI/tools for a document.</summary>

### Hook Name and Signature   
The name of the hook and its TypeScript (or JavaScript) signature.
### Description
A brief explanation of what the hook does and when to use it.
### Usage Example   
A code snippet showing how to use the hook in a real-world scenario.
### Parameters
A table or list describing each parameter, its type, and its purpose.
### Return Value   
A description (and sometimes a table) of what the hook returns.
### Notes / Caveats   
Any important details, gotchas, or best practices.
### Related Hooks
Links to other relevant hooks or documentation.
</details>

<details>
<summary>`useDocumentModule`, `useDocumentModel(documentType)`: Gets the technical model behind a document type—like its schema and operations.</summary>

### Hook Name and Signature   
The name of the hook and its TypeScript (or JavaScript) signature.
### Description
A brief explanation of what the hook does and when to use it.
### Usage Example   
A code snippet showing how to use the hook in a real-world scenario.
### Parameters
A table or list describing each parameter, its type, and its purpose.
### Return Value   
A description (and sometimes a table) of what the hook returns.
### Notes / Caveats   
Any important details, gotchas, or best practices.
### Related Hooks
Links to other relevant hooks or documentation.
</details>

### 2. Managing selection state
You can now use the following to manage and track what's currently selected:

<details>
<summary>`useSelectedDrive` and `useSetSelectedDrive(driveId)`: Get/set the selected folder.</summary>

### Hook Name and Signature   
The name of the hook and its TypeScript (or JavaScript) signature.
### Description
A brief explanation of what the hook does and when to use it.
### Usage Example   
A code snippet showing how to use the hook in a real-world scenario.
### Parameters
A table or list describing each parameter, its type, and its purpose.
### Return Value   
A description (and sometimes a table) of what the hook returns.
### Notes / Caveats   
Any important details, gotchas, or best practices.
### Related Hooks
Links to other relevant hooks or documentation.
</details>

<details>
<summary>`useSelectedDocument` and `useSetSelectedDocument(documentId)`: Get/set the selected file.</summary>

### Hook Name and Signature   
The name of the hook and its TypeScript (or JavaScript) signature.
### Description
A brief explanation of what the hook does and when to use it.
### Usage Example   
A code snippet showing how to use the hook in a real-world scenario.
### Parameters
A table or list describing each parameter, its type, and its purpose.
### Return Value   
A description (and sometimes a table) of what the hook returns.
### Notes / Caveats   
Any important details, gotchas, or best practices.
### Related Hooks
Links to other relevant hooks or documentation.
</details>

## More documentation coming soon!

Global access to drive state: A top-level, possibly context-based, way to introspect and interact with any document and its state tree without manually passing things around.

Global dispatcher access: A utility or API (probably a hook or service function) where they give a document ID and get back all the relevant dispatch functions — kind of like a command palette for document ops.

### Core Hooks & Patterns	
- useDocumentField
- useReadDocumentField
- useUpdateDocumentField
- useDocumentDispatch(docId):  updateX, delete, ... 

### Global Drive Access	
- How to access and manipulate the global document tree
- How to inspect children from parent context
- Tree traversal utilities (if any)

### Convenience APIs	
- Utility functions like getDispatchFunctions(docId)
- "Quick Start" to manipulate any document like a pro

### Working with Context	
- DriveContext: what lives there, how to use it
- Example: using context to get current doc, sibling docs

### Best Practices & Patterns	
- When to use useDocumentField vs getDispatch
- Composing document fields into custom logic