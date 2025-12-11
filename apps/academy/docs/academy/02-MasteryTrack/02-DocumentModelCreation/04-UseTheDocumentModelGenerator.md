# Use the Document Model Generator

When building document models with **Vetra Studio**, code generation happens automatically. As you add and update specification documents in your Vetra Studio Drive, Vetra monitors your changes and generates the necessary scaffolding in real-time. You'll receive updates directly in your terminal as Vetra processes your specifications.

This article covers the **manual code generation method** using the `ph generate` command—an alternative approach that remains available when working with **Connect** and exported `.phd` specification files. While Vetra Studio is the recommended workflow for most developers, understanding the generator command provides useful context for how the scaffolding works under the hood.

## When to Use Manual Generation

| Workflow | Code Generation |
|----------|-----------------|
| **Vetra Studio** | Automatic—Vetra watches your specifications and generates code as you work |
| **Connect** | Manual—Export a `.phd` file and run `ph generate` |

If you're using Vetra Studio with `ph vetra --interactive`, you don't need to run any generation commands. Vetra handles everything for you, prompting for confirmation before processing changes.

## Prerequisites (Connect Workflow Only)

If you're using the Connect workflow and need to manually generate code:

1. **Powerhouse CLI (`ph-cmd`) Installed:** The generator is part of the Powerhouse CLI. If you haven't installed it, refer to the [Builder Tools documentation](/academy/MasteryTrack/BuilderEnvironment/BuilderTools#installing-the-powerhouse-cli).
2. **Exported `.phd` File:** You must have exported your document model specification from Connect as a `.phd` file (e.g., `TodoList.phd`).

## The Generate Command

The core command to invoke the Document Model Generator is:

```bash
ph generate <YourModelName.phd>
```

Replace `<YourModelName.phd>` with the actual filename of your exported document model specification. For instance, if your exported file is named `TodoList.phd`, the command would be:

```bash
ph generate TodoList.phd
```

When executed, this command reads and parses the specification file and generates a set of files and directories within your Powerhouse project.

## Understanding the Generated Artifacts

Whether generated automatically by Vetra or manually via `ph generate`, the output structure is the same. Understanding these artifacts helps you work effectively with your document model.

The generator creates a new directory specific to your document model, located at:
`document-models/<your-model-name>/`

For example, using `TodoList.phd` would result in a directory structure under `document-models/todo-list/`. Inside this directory, you will find:

### 1. Specification Files

- **`todo-list.json`**: A JSON representation of your document model specification containing the parsed schema, operation definitions, document type, and metadata.
- **`schema.graphql`**: The raw GraphQL Schema Definition Language (SDL) for both the state and operations—a human-readable reference of your schema.

### 2. The `gen/` Directory (Auto-Generated Code)

This directory houses all code automatically generated from your specification. **Do not manually edit files within the `gen/` directory**—they will be overwritten when the model is regenerated.

Key files include:

- **`types.ts`**: TypeScript interfaces derived from your GraphQL schema, including types for your document's state (e.g., `TodoListState`), complex types (e.g., `TodoItem`), and operation inputs (e.g., `AddTodoItemInput`).

- **`creators.ts`**: Action creator functions for each operation. Instead of manually constructing action objects, you use functions like `addTodoItem({ text: 'Buy groceries' })`.

- **`utils.ts`**: Utility functions including helpers to create initial document instances (e.g., `utils.createDocument()`).

- **`reducer.ts`**: A TypeScript interface defining the expected shape of your reducer implementation.

### 3. The `src/` Directory (Your Implementation)

This is where you write custom logic. Unlike `gen/`, these files are meant for manual editing.

- **`reducers/`**: Contains skeleton reducer files (e.g., `todos.ts`) with function stubs for each operation that you implement with state transition logic.
- **`tests/`**: Test files for your reducer logic.

## Benefits of Generated Scaffolding

The generation process—whether automatic via Vetra or manual via `ph generate`—provides:

1. **Reduced Boilerplate:** Automates creation of type definitions, action creators, and utilities.
2. **Type Safety:** TypeScript types from your GraphQL schema catch errors at compile-time.
3. **Consistency:** Standardized project structure across document models.
4. **Accelerated Development:** Focus on business logic instead of foundational plumbing.
5. **Ecosystem Alignment:** Generated code integrates seamlessly with the Powerhouse ecosystem.
6. **Single Source of Truth:** Code stays synchronized with your specification.

## Practical Examples

### Using Vetra Studio (Recommended)

When using Vetra Studio, code generation is automatic:

1. **Start Vetra in Interactive Mode:**
   ```bash
   ph vetra --interactive
   ```

2. **Create Your Document Model:**
   Define your `TodoList` document model in the Vetra Studio Drive—either manually or with AI assistance through Claude and the Reactor MCP.

3. **Watch the Terminal:**
   As you add specifications, Vetra automatically detects changes and generates scaffolding. In interactive mode, you'll be prompted to confirm before generation proceeds.

4. **Explore Generated Files:**
   Once complete, find your generated files at `document-models/todo-list/`:
   - `todo-list.json` and `schema.graphql`: Your model definition
   - `gen/`: Type-safe generated code
   - `src/reducers/todos.ts`: Skeleton reducer functions ready for implementation

### Using Connect (Alternative Method)

<details>
<summary>Tutorial: Manual Generation with Connect</summary>

This approach is useful when working with Connect's Document Model Editor or when you need explicit control over the generation process.

#### Prerequisites

- **`TodoList.phd` file**: Your document model specification exported from Connect.

#### Steps

1. **Place the Specification File in Your Project:**
   Navigate to your Powerhouse project root and copy your `TodoList.phd` file there.

2. **Run the Generator Command:**
   ```bash
   ph generate TodoList.phd
   ```

3. **Explore the Generated Files:**
   After the command completes, find the new directory at `document-models/todo-list/`:
   - `todo-list.json` and `schema.graphql`: The definition of your model
   - `gen/`: Type-safe generated code including `types.ts`, `creators.ts`, etc.
   - `src/`: Implementation skeleton, including `src/reducers/todos.ts` with empty functions for `addTodoItemOperation`, `updateTodoItemOperation`, and `deleteTodoItemOperation`

</details>

## Next Steps

With your document model scaffolded, the next step is implementing the reducer logic in `document-models/todo-list/src/reducers/todos.ts`. Each reducer function takes the current state and action input, returning the new document state.

Subsequently, write unit tests for your reducers to ensure they behave correctly. This cycle of defining, generating, implementing, and testing forms the core loop of document model development in Powerhouse.
