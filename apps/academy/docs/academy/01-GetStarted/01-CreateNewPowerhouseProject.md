# Create a new to-do list document

:::tip Tutorial Repository
📦 **Reference Code**: [step-1-initialize-with-ph-init](https://github.com/powerhouse-inc/todo-tutorial/tree/step-1-initialize-with-ph-init)

This tutorial step has a corresponding branch in the repository. You can:
- View the complete code for this step
- Clone and checkout the branch to see the result
- Compare your implementation using `git diff`
:::

<details>
<summary>📖 How to use this tutorial</summary>

This tutorial is designed for you to **build your own project from scratch** while having access to reference code at each step.

### Setup: Create your project and connect to tutorial repo

1. **Create your project** following the tutorial:
   ```bash
   mkdir ph-projects
   cd ph-projects
   ph init
   # When prompted, enter project name: getting-started
   cd getting-started
   ```

2. **Add the tutorial repository as a remote** to access reference branches:
   ```bash
   git remote add tutorial https://github.com/powerhouse-inc/todo-tutorial.git
   git fetch tutorial --prune
   ```

Now you have access to all tutorial step branches while working on your own code!

### Compare your work with reference steps

At any point, compare what you've built with a tutorial step:

```bash
# Compare your current work with step-1
git diff tutorial/step-1-initialize-with-ph-init

# See what changed between tutorial steps
git diff tutorial/step-1-initialize-with-ph-init..tutorial/step-2-generate-todo-list-document-model

# Compare specific files
git diff tutorial/step-1-initialize-with-ph-init -- package.json
```

### Visual diff in your IDE

Use GitHub Desktop or VS Code for visual comparison:
- **GitHub Desktop**: Branch menu → "Compare to Branch" → select `tutorial/step-X`
- **VS Code**: Use Git Graph extension or command palette → "Git: Compare with Branch"

### If you get stuck

Reset your code to match a tutorial step:

```bash
# Reset to step-2 (WARNING: loses your changes)
git reset --hard tutorial/step-2-generate-todo-list-document-model
```

</details>

## Overview

This tutorial guides you through creating a simplified version of a 'Powerhouse project' for a **To-do List**.  
A Powerhouse project primarily consists of a document model and its editor. 
As your projects use-case expands you can add data-integrations or a specific drive-app as seen in the demo package. 

For todays purpose, you'll be using Connect, our user-centric collaboration tool and Vetra Studio, the builder tooling through which developers can access and manage specifications of your project. 

## Prerequisites

- Powerhouse CLI installed: `pnpm install -g ph-cmd` or `npm install -g ph-cmd --legacy-peer-deps`
- node.js 22 and a package manager (pnpm or npm) installed
- Visual Studio Code (or your preferred IDE)
- Terminal/Command Prompt access

If you need help with installing the prerequisites you can visit our page [prerequisites](/academy/MasteryTrack/BuilderEnvironment/Prerequisites)

## Quick start

Create a new Powerhouse project with a single command:

```bash
ph init
```

## Before you begin

1. Open your terminal (either your system terminal or IDE's integrated terminal)
2. Optionally, create a folder first to keep your Powerhouse projects:

   ```bash
   mkdir ph-projects
   cd ph-projects
   ```

3. Ensure you're in the correct directory before running the `ph init` command.  
   In the terminal, you will be asked to enter the project name. Fill in the project name and press Enter.

   ````bash
    you@yourmachine:~/ph-projects % ph init

    ? What is the project name? ‣ getting-started
    ```


Once the project is created, you will see the following output:
    ```bash
    Initialized empty Git repository in /Users/you/ph-projects/getting-started/.git/
    The installation is done!
    ```

Navigate to the newly created project directory:
    ```bash
    cd getting-started
    ```

## Develop a single document model in Connect

Once in the project directory, run the `ph connect` command to start a local instance of the Connect application. This allows you to start your document model specification document.
Run the following command to start the Connect application:

    ```bash
    ph connect
    ```

The Connect application will start and you will see the following output:

    ```bash
      ➜  Local:   http://localhost:3000/
      ➜  Network: http://192.168.5.110:3000/
      ➜  press h + enter to show help
    ```

A new browser window will open and you will see the Connect application. If it doesn't open automatically, you can open it manually by navigating to `http://localhost:3000/` in your browser. You will see your local drive and a button to create a new drive.

:::tip 
If you local drive is not present navigate into Settings in the bottom left corner. Settings > Danger Zone > Clear Storage.
Clear the storage of your localhost application as it might has an old session cached.
:::

4. Move into your local drive.  
   Create a new document model by clicking the `DocumentModel` button, found in the 'New Document' section at the bottom of the page. Name your document `TodoList` (PascalCase, no spaces or hyphens).

If you've followed the steps correctly, you'll have an empty `TodoList` document where you can define the **'Document Specifications'**.

## Verify your setup

At this point, your project structure should match the `step-1-initialize-with-ph-init` branch. You should have:

- Empty `document-models/`, `editors/`, `processors/`, and `subgraphs/` directories
- Configuration files: `powerhouse.config.json`, `powerhouse.manifest.json`
- Package management files: `package.json`, `pnpm-lock.yaml`
- Build configuration: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

### Compare with reference implementation

Verify your initial setup matches the tutorial:

```bash
# Compare your project structure with step-1
git diff tutorial/step-1-initialize-with-ph-init

# List files in the tutorial's step-1
git ls-tree -r --name-only tutorial/step-1-initialize-with-ph-init

# View a specific config file from step-1
git show tutorial/step-1-initialize-with-ph-init:package.json
```

## Up next

In the next tutorials, you will learn how to specify, add code and build an editor for your document model and export it to be used in your Powerhouse package.
