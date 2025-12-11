# Create a package with Vetra

:::warning
**This tutorial is a summary for builders that are already familiar with building document models**.  
It provides a summary from initial setup up to publishing a distributable package.

Please start with the '**Get Started**' Chapter or '**Document Model Creation**' section if you are unfamiliar with building a document model.
:::

<details>
<summary>Key commands that you'll use in this flow</summary>

- `pnpm install -g ph-cmd` or `npm install -g ph-cmd`: Installs the Powerhouse CLI globally.
- `ph init`: Initializes a new Powerhouse project or sets up the local environment.
- `ph vetra --interactive`: Launches Vetra Studio in interactive mode for package development.
- `ph vetra --interactive --watch`: Launches Vetra Studio with dynamic reloading for document-models and editors.
- `pnpm build` or `npm run build`: Builds the project for production.
- `pnpm run test` or `npm test`: Runs unit tests.
- `npm login`: Logs into your NPM account.
- `npm publish`: Publishes your package to NPM.
- `ph install @your-org-ph/your-package-name`: Installs a published package into a local Powerhouse environment.

</details>

## Phase 1: Setup and initialization

### 1.1. Install Powerhouse CLI

Ensure you have the Powerhouse Command Line Interface (`ph-cmd`) installed. This tool is crucial for managing your Powerhouse projects.

```bash
pnpm install -g ph-cmd
```

Or if you're using npm:

```bash
npm install -g ph-cmd
```

:::info **Prerequisites**
See the [Prerequisites](/academy/MasteryTrack/BuilderEnvironment/Prerequisites) guide for detailed installation instructions for Node.js 22, package managers (pnpm or npm), and Git if you haven't set them up yet.
:::

### 1.2. Initialize your project environment

Before creating a specific project, or if you're setting up your environment for the first time, initialize the Powerhouse environment. This command prepares your local setup, including a local Reactor configuration.

```bash
ph init
```

If you are starting a new project to be packaged, this command will also prompt you for a project name. This name will be used for your package.

<details>
<summary> How to make use of different branches? </summary>

When installing or using the Powerhouse CLI commands you are able to make use of the dev & staging branches. These branches contain more experimental features than the latest stable release the PH CLI uses by default. They can be used to get access to a bugfix or features under development.

| Command                            | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| **pnpm install -g ph-cmd** or **npm install -g ph-cmd**         | Install latest stable version                         |
| **pnpm install -g ph-cmd@dev** or **npm install -g ph-cmd@dev**     | Install development version                           |
| **pnpm install -g ph-cmd@staging** or **npm install -g ph-cmd@staging** | Install staging version                               |
| **ph init**                        | Use latest stable version of the boilerplate          |
| **ph init --dev**                  | Use development version of the boilerplate            |
| **ph init --staging**              | Use staging version of the boilerplate                |
| **ph use**                         | Switch all dependencies to latest production versions |
| **ph use dev**                     | Switch all dependencies to development versions       |
| **ph use prod**                    | Switch all dependencies to production versions        |

Please be aware that these versions can contain bugs and experimental features that aren't fully tested.

</details>

### 1.3. Launch Vetra Studio

You can launch Vetra Studio in two modes:

#### Interactive Mode (Recommended for Development)
```bash
ph vetra --interactive
```
In interactive mode:
- You'll receive confirmation prompts before any code generation
- Changes require explicit confirmation before being processed
- Provides better control and visibility over document changes

#### Watch Mode 

```bash
ph vetra --interactive --watch
```
In watch mode:

- Adding `--watch` to your command enables dynamic loading for document-models and editors in Vetra studio and switchboard. 
- When enabled, the system will watch for changes in these directories and reload them dynamically.

:::warning Be Aware
When you are building your document model the code can break the Vetra Studio environment. 
A full overview of the Vetra Studio commands can be found in the [Powerhouse CLI](/academy/APIReferences/PowerhouseCLI#vetra)
:::

#### Standard Mode
```bash
ph vetra
```
In standard mode:
- Changes are processed automatically with 1-second debounce
- Multiple changes are batched and processed together
- Uses the latest document state for processing

<details>
<summary>Alternatively: Use Connect</summary>

Connect is your local development hub. Running it in Studio Mode spins up a local instance with a local Reactor, allowing you to define, build, and test document models.

```bash
ph connect
```

This command typically opens Connect in your browser at `http://localhost:3000/`.

:::info
**Powerhouse Reactors** are essential nodes in the Powerhouse network. They store documents, manage versions, resolve conflicts, and verify document operation histories by rerunning them. Reactors can be configured for local storage (as in Studio Mode), centralized cloud storage, or decentralized storage networks.
:::

</details>

### 1.4. Launch Claude with Reactor-MCP

Vetra Studio integrates deeply with Claude through MCP (Model Context Protocol). This is where AI comes into the mix and you get the chance to have greater control and direction over what your LLM is coding for you.

:::info Specification Driven Design & Development
Vetra embraces **Specification Driven Design & Development**—an approach where your structured specification documents become the shared language between you and AI agents. Instead of relying on vibe coding, you communicate intent through precise specs that are machine-readable and executable. This turns fragile sandcastles into solid, maintainable functionality.
:::

<details>
<summary>Explainer: Specification Driven AI</summary>

In the **'Get Started'** chapter we've been making use of strict schema definition principles to communicate the intended use case of our document models. 
The **schema definition language** is not only a shared language that bridges the gap between developer, designer and analyst but also the gap between builder and AI-agent through **specification driven AI control**.

- Communicate your solution and intent through a structured specification framework designed for AI collaboration.
- Specifications enable precise, iterative edits, since all our specification documents are machine-readable and executable.

</details>

<details>
<summary> Reactor MCP Overview</summary>

#### Key Reactor MCP Features

**Reactor-mcp** is a Model Context Protocol (MCP) server that bridges AI agents with Powerhouse document operations.

- It supports automatic document model creation from natural language descriptions
- It implements a smart editor based on the underlying document models
- It automatically triggers code generation when documents reach valid state
- The MCP server enables the agent to work with both existing and newly created document models
- Vetra supports integration with custom remote drives, allowing users to create, share and manage documents within these drives

**Document Operations:**
- `createDocument` / `getDocument` / `deleteDocument` - Manage documents
- `addActions` - Modify document state through operations

**Drive Operations:**
- `getDrives` / `addDrive` / `getDrive` - Manage document drives
- `addRemoteDrive` - Connect to remote drives

**Document Model Operations:**
- `getDocumentModels` - List available document model types
- `getDocumentModelSchema` - Get schema for specific models

**Document Model Agent:**
A specialized AI agent that guides users through document model creation with requirements gathering, design confirmation, and implementation including state schema definition, operation creation, and code generation.

</details>

#### 1. Start the Reactor MCP:

Make sure you are in the same directory as your project. 
Claude will automatically recognize the necessary files and MCP tools. 

```bash
claude
```

Since you're interacting with an LLM it has a high capacity for interpreting your intentions. 
Similar natural language commands will work as well. 

```bash
connect to the reactor mcp
```

#### 2. Verify MCP connection:
- Check that the Reactor MCP is available. 
- Confirm Vetra Studio shows "Connected to Reactor MCP"

```bash
Connected to MCP successfully! I can see there's a
  "vetra-4de7fa45" drive available. The reactor-mcp server is
  running and ready for document model operations.
```

## Phase 2: Package Creation

### 2.1. Set Package Description (Required)
1. Provide a name for your package
2. Add a meaningful description
3. Add keywords to add search terms to your package
4. Confirm changes when prompted in interactive mode

### 2.2. Define Document Model (Required)

You can create document models in two ways:

#### Manual Creation
- Define document schema with fields and types as in the **'Get Started'** chapter
- Create the necessary operations
- Add the required modules to your package
- The document model creation chapter in the Mastery track provides in depth support [here](/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema)

#### Using MCP (AI-Assisted)
- Describe your document needs in natural language in great detail.
- Claude will:
  - Generate an appropriate schema
  - Create the necessary operations
  - Implement the required reducers
  - Place the document in the Vetra drive

<details>
<summary>Alternatively: Use Connect</summary>

Within Connect Studio Mode, navigate to the Document Model Editor. Here, you'll specify the structure of your document model using GraphQL Schema Definition Language (SDL).

- **State Schema:** Describes the data fields and types within your document (e.g., `ToDoItem` with `id`, `text`, `checked` fields).
- This schema is the blueprint for your document model's data.

In the same editor, specify the operations (state transitions) for your document model. These are also defined using GraphQL, specifically input types.

- **Operations Schema:** Specifies the actions that can be performed on the document (e.g., `AddTodoItemInput`, `UpdateTodoItemInput`, `DeleteTodoItemInput`).
- Each input type details the parameters required for an operation.
- **Best Practices:**
  - Clearly define operations (often aligning with CRUD principles).
  - Use GraphQL input types for operation parameters.
  - Ensure operations reflect user intent for a clean API.

Once your schema and operations are defined in Connect, export the specification. This will download a `.phdm.zip` file (e.g., `YourModelName.phdm.zip`). Save this file in the root of your Powerhouse project directory.

</details>

<details>
<summary>Alternatively: Generate command</summary>

Use the Powerhouse CLI to process an exported `.phdm.zip` file and generate the necessary boilerplate code for your document model.

```bash
ph generate YourModelName.phdm.zip
```

This command creates a new directory under `document-models/YourModelName/` containing:

- A JSON file with the document model specification.
- A GraphQL file with the state and operation schemas.
- A `gen/` folder with autogenerated TypeScript types, action creators, and utility functions based on your schema.
- A `src/` folder where you'll implement your custom logic (reducers, utils).

</details>

### 2.3. Add Document Editor (Required)

#### Manual Creation
- Select your target document model
- Configure the currently limited editor properties
- Add the editor specification to Vetra Studio drive
- The system will generate scaffolding code

#### Using MCP (AI-Assisted)
- Request Claude to create an editor for your document. Do this with the help of a detailed description of the user interface, user experience and logic that you wish to generate. Make sure to reference operations from the document model to get the best results
- Claude will:
  - Generate editor components
  - Implement necessary hooks
  - Create required UI elements

<details>
<summary>Alternatively: Generate command</summary>

A document editor provides the user interface for interacting with your document model. Generate an editor template:

```bash
ph generate --editor YourModelName --document-types powerhouse/YourModelName
```

- The `--editor YourModelName` flag specifies the document model this editor is for.
- The `--document-types powerhouse/YourModelName` flag links the editor to the specific document type defined in your model specification.

This creates a template file, typically at `editors/your-model-name/editor.tsx`.

- Customize this React component to build your UI.
- You can use standard HTML, Tailwind CSS (available in Connect), or import custom CSS.
- Utilize components from `@powerhousedao/document-engineering` for consistency and rapid development. Learn more at [Document-Engineering](/academy/ComponentLibrary/DocumentEngineering)

</details>

## Phase 3: Implementation and testing

### 3.1. Implement reducer logic

Reducers are pure functions that implement the state transition logic for each operation defined in your schema. Navigate to `document-models/YourModelName/src/reducers/to-do-list.ts` (or similar, based on your model name).

- Implement the functions for each operation (e.g., `addTodoItemOperation`, `updateTodoItemOperation`).
- These functions take the current state and an action (containing input data) and return the new state.
- Powerhouse handles immutability behind the scenes.

### 3.2. Write unit tests for reducers

It's crucial to test your reducer logic. Write unit tests in the `document-models/YourModelName/src/reducers/tests/` directory.

- Verify that each operation correctly transforms the document state.
- Use the auto-generated action creators from the `gen/` folder to create operation actions for your tests.
  Run tests using:

```bash
pnpm run test
```

Or with npm:

```bash
npm test
```

### 3.3. Test the editor

Test your editor in Vetra Studio by creating a new document of your defined type. Interact with your editor, test all functionalities, and ensure it correctly dispatches actions to the reducers and reflects state changes.

<details>
<summary>Alternatively: Use Connect</summary>

Run Connect locally to see your editor in action:

```bash
ph connect
```

Create a new document of your defined type. Interact with your editor, test all functionalities, and ensure it correctly dispatches actions to the reducers and reflects state changes.

</details>

### Best Practices

**Working with MCP and Claude**
- Provide clear, specific instructions and ask for clarifying questions to be answered before code generation.
- Review generated schemas before confirmation and work in layers instead of 'one-shotting' your code. 
- Verify implementation details in generated code before continuing. 
- Always double-check proposed next actions

## Phase 4: Packaging and publishing

Once your document model and editor are implemented and tested, you can package them for distribution. A Powerhouse Package is a modular unit that can group document models, editors, scripts, and processors.

### 4.1. Prepare project for packaging

If you didn't initialize your project with `ph init` intending it as a package, ensure your project structure is set up correctly. The `ph init` command is designed to create this structure.

- `document-models/`: Contains your document models.
- `editors/`: Contains your editor components.
- `src/`: Often used for shared utilities or can be part of the model/editor structure.
- (Optional) `processors/`, `scripts/` for advanced functionalities.

### 4.2. Specify package details in `package.json`

Navigate to the `package.json` file in your project root. This file is crucial for NPM publishing.

- **`name`**: Follow a scoped naming convention, e.g., `@your-org-ph/your-package-name`. The `-ph` suffix helps identify Powerhouse ecosystem packages.
- **`version`**: Use semantic versioning (e.g., `1.0.0`).
- **`author`**: Your name or organization.
- **`license`**: e.g., `AGPL-3.0-only`.
- **`main`**: The entry point of your package (e.g., `index.js` or `dist/index.js`).
- **`publishConfig`**: For scoped packages intended to be public, add:
  ```json
  "publishConfig": {
    "access": "public"
  }
  ```

Example `package.json` snippet:

```json
{
  "name": "@your-org-ph/your-package-name",
  "version": "1.0.0",
  "author": "Your Name",
  "license": "AGPL-3.0-only",
  "main": "index.js",
  "files": [
    // Ensure your build output and necessary files are included
    "dist",
    "manifest.json",
    "document-models",
    "editors"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

### 4.3. Add a manifest file (`manifest.json`)

Create a `manifest.json` file in your project root. This file describes your package's contents (document models, editors) and helps host applications like Connect understand and integrate your package.

Example `manifest.json`:

```json
{
  "name": "@yourorg-ph/your-package-name", // it's recommended to use an organization-specific NPM account (e.g., `yourorg-ph`).
  "description": "A brief description of your package and its document models.",
  "category": "your-category", // e.g., "Finance", "People Ops", "Legal"
  "publisher": {
    "name": "your-publisher-name", // Your organization or name
    "url": "your-publisher-url" // Link to your website or repository
  },
  "documentModels": [
    {
      "id": "powerhouse/YourModelName", // Document type string as defined in Connect
      "name": "YourModelName" // Human-readable name
    }
  ],
  "editors": [
    {
      "id": "your-editor-id", // A unique ID for the editor component
      "name": "YourModelName Editor", // Human-readable name
      "documentTypes": ["powerhouse/YourModelName"] // Links editor to document type(s)
    }
  ]
}
```

Update your project's main `index.js` or entry point to export your document models and editors so they can be discovered by Powerhouse applications.

### 4.4. Build your project

Compile and optimize your project for production:

```bash
pnpm build
```

Or with npm:

```bash
npm run build
```

This command typically creates a `dist/` or `build/` directory with the compiled assets. Ensure your `package.json`'s `files` array includes this directory and other necessary assets like `manifest.json`, `document-models`, and `editors` if they are not part of the build output but need to be in the package.

### 4.5. Version control

Store your project in a Git repository for versioning and collaboration.

```bash
git init
git add .
git commit -m "Initial commit of document model package"
# git remote add origin <your-remote-repository-url>
# git push -u origin main
```

### 4.6. Publish to NPM

To share your package with others or deploy it to different environments, publish it to the NPM registry.

1.  **Login to NPM:**
    If you haven't already, log into your NPM account. It's recommended to use an organization-specific NPM account (e.g., `yourorg-ph`).

    ```bash
    npm login
    ```

    Follow the prompts in your terminal or browser.

2.  **Publish the package:**
    ```bash
    npm publish
    ```
    If your package is scoped and public, NPM will use the `publishConfig` from your `package.json`. If not set there, you might need `npm publish --access public`.

### 4.7. Using your published package

Once published, your package can be installed and used in any Powerhouse environment (like another local Connect instance or a deployed Reactor setup).

```bash
ph install @your-org-ph/your-package-name
```

This command makes the document models and editors defined in your package available within that Powerhouse instance.

Congratulations! You've successfully created, packaged, and published a Powerhouse Document Model. This enables modularity, reusability, and collaboration within the Powerhouse ecosystem.
