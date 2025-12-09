# Create a new chatroom project

:::tip Tutorial Repository
📦 **Reference Code**: [chatroom-demo](https://github.com/powerhouse-inc/chatroom-demo)

This tutorial has a complete reference implementation available. You can:
- View the complete code for each step
- Clone and compare your implementation
- Use `git diff` to compare your code with the reference
:::

<details>
<summary>📖 How to use this tutorial</summary>

This tutorial is designed for you to **build your own project from scratch** while having access to reference code.

### Setup: Create your project and connect to tutorial repo

1. **Create your project** following the tutorial:
   ```bash
   mkdir ph-projects
   cd ph-projects
   ph init
   # When prompted, enter project name: ChatRoom
   cd ChatRoom
   ```

2. **Add the tutorial repository as a remote** to access reference code:
   ```bash
   git remote add tutorial https://github.com/powerhouse-inc/chatroom-demo.git
   git fetch tutorial --prune
   ```

3. **Create your own branch** to keep your work organized:
   ```bash
   git checkout -b my-chatroom-project
   ```

Now you have access to the complete reference implementation while working on your own code!

### Compare your work with the reference

At any point, compare what you've built with the reference:

```bash
# Compare your current work with the reference
git diff tutorial/main

# Compare specific files
git diff tutorial/main -- package.json
```

### If you get stuck

Reset your code to match the reference:

```bash
# Reset to reference (WARNING: loses your changes)
git reset --hard tutorial/main
```

</details>

## Overview

This tutorial guides you through creating a **ChatRoom** application using Powerhouse.  
A Powerhouse project primarily consists of a document model and its editor. The ChatRoom demonstrates real-time collaboration features where users can post messages and react with emojis.

## Prerequisites

- Powerhouse CLI installed: `pnpm install -g ph-cmd` or `npm install -g ph-cmd`
- node.js 22 and a package manager (pnpm or npm) installed
- Visual Studio Code (or your preferred IDE)
- Terminal/Command Prompt access

If you need help with installing the prerequisites you can visit our page [prerequisites](/academy/MasteryTrack/BuilderEnvironment/Prerequisites)

## Before you begin

1. Open your terminal (either your system terminal or IDE's integrated terminal)
2. Optionally, create a folder first to keep your Powerhouse projects:

   ```bash
   mkdir ph-projects
   cd ph-projects
   ```

3. Ensure you're in the correct directory before running the `ph init` command.  
   In the terminal, you will be asked to enter the project name. Fill in the project name and press Enter.

   ```bash
   you@yourmachine:~/ph-projects % ph init

   ? What is the project name? ‣ ChatRoom
   ```

Once the project is created, you will see the following output:

```bash
Initialized empty Git repository in /Users/you/ph-projects/ChatRoom/.git/
The installation is done!
```

Navigate to the newly created project directory:

```bash
cd ChatRoom
```

## Develop your document model in Vetra Studio

**Vetra Studio** is the builder's orchestration hub for assembling all specifications needed for your package. It provides a **Vetra Studio Drive** to access, manage, and share document model specifications, editors, and data integrations—all through a visual interface. For deeper coverage, see the [Vetra Studio documentation](/academy/MasteryTrack/BuilderEnvironment/VetraStudio).

Once in the project directory, run the `ph vetra` command to start a Vetra Studio Drive where you'll be defining your specifications.

```bash
ph vetra
```

The host application for Vetra Studio will start and you will see the following output:

```bash
ℹ [reactor-api] [package-manager] Loading packages: @powerhousedao/vetra
ℹ [reactor-api] [server] WebSocket server attached at /graphql/subscriptions
ℹ [reactor-api] [graphql-manager] Registered /graphql/system subgraph.
ℹ [reactor-api] [graphql-manager] Registered /graphql supergraph
ℹ [reactor-api] [server] MCP server available at http://localhost:4001/mcp
Switchboard initialized
   ➜ Drive URL: http://localhost:4001/d/vetra-bac239dd
  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

A new browser window will open when visiting localhost and you will see the Vetra Studio Drive. If it doesn't open automatically, you can open it manually by navigating to `http://localhost:3000/` in your browser.

Create a new document model by clicking the Document Models **'Add new specification'** button. Name your document `ChatRoom` (PascalCase, no spaces or hyphens).

**Pay close attention to capitalization, as it influences code generation.**

If you've followed the steps correctly, you'll have an empty `ChatRoom` document where you can define the **'Document Specifications'**.

<details>
<summary>Alternatively: Develop a single document model in Connect</summary>

Once in the project directory, run the `ph connect` command to start a local instance of the Connect application. This allows you to start your document model specification document.

```bash
ph connect
```

The Connect application will start and you will see the following output:

```bash
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.5.110:3000/
  ➜  press h + enter to show help
```

A new browser window will open and you will see the Connect application. If it doesn't open automatically, you can open it manually by navigating to `http://localhost:3000/` in your browser.

:::tip 
If your local drive is not present, navigate to Settings in the bottom left corner. Settings > Danger Zone > Clear Storage.
Clear the storage of your localhost application as it might have an old session cached.
:::

Move into your local drive.  
Create a new document model by clicking the `DocumentModel` button, found in the 'New Document' section at the bottom of the page. Name your document `ChatRoom` (PascalCase, no spaces or hyphens).

</details>

## Verify your setup

At this point, your project structure should include:

- Empty `document-models/`, `editors/`, `processors/`, and `subgraphs/` directories
- Configuration files: `powerhouse.config.json`, `powerhouse.manifest.json`
- Package management files: `package.json`, `pnpm-lock.yaml`
- Build configuration: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

## Up next

In the next tutorial, you will learn how to design your document model and export it to be later used in your Powerhouse project.
