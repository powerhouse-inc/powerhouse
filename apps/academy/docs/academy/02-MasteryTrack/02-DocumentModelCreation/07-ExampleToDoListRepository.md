# Example: Todo-demo-package

:::info

The Todo-demo is maintained by the Powerhouse Team and serves as a reference for testing and introducing new features. It will be continuously updated alongside the accompanying documentation.

https://github.com/powerhouse-inc/todo-demo
:::

There are several ways to explore this package:

### Option 1: Rebuild the Todo-demo

The Todo-demo and repository are your main reference points during the Mastery Track.  
Follow the steps in the "Mastery Track – Document Model Creation" chapters to build along with the examples.

Key patterns used in the repository:
- **Naming convention**: `TodoList`, `TodoItem`, `TodoListState` (one word, PascalCase)
- **Document type**: `powerhouse/todo-list`
- **Module name**: `todos`
- **ID generation**: Uses `generateId()` from `document-model/core` in the reducer
- **Hooks**: Uses `useSelectedTodoListDocument` for state management in the editor

### Option 2: Clone and run the code locally

The package includes:

- The Document Model
- Reducer Code
- Reducer Tests
- Editor Code
- Drive-app Code

You can clone the repository and run Vetra Studio to see all the code in action:

```bash
git clone https://github.com/powerhouse-inc/todo-demo
cd todo-demo
pnpm install
ph vetra --watch
```

<details>
<summary>Alternatively: Run with Connect</summary>

```bash
git clone https://github.com/powerhouse-inc/todo-demo
cd todo-demo
pnpm install
ph connect
```

</details>

### Option 3: Install the todo demo package in a (local) host app

Alternatively, you can install this package in a Powerhouse project or in your deployed host apps:

```bash
ph install @powerhousedao/todo-demo
```

## Comparing Get Started vs Mastery Track

| Aspect | Get Started | Mastery Track (Advanced) |
|--------|-------------|--------------------------|
| Schema | Basic `items` array only | Includes `stats` object for tracking |
| Reducer complexity | Simple CRUD operations | Includes statistics updates |
| Editor | Component-based with hooks | Same approach + stats display |
| Tests | Basic operation tests | Includes stats verification tests |

Both approaches use the same naming conventions and patterns — the Mastery Track simply extends the foundation with additional features to demonstrate more advanced concepts.
