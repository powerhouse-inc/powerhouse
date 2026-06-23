# Create a package with Vetra

:::info[What is a Package?]
A **Powerhouse Package** is a distributable unit that bundles one or more document models, editors, and optional reactor modules into a single installable artifact. Once published to the Vetra registry, a package can be installed in any Vetra Cloud environment — extending Connect with new document types and editors, and extending Switchboard with the corresponding reactor logic.
:::

<figure className="image-container">
  <img
    src={require("./images/vetra-cloud-create-a-package.png").default}
    alt="Create a Package"
  />
  <figcaption>The five steps to build and publish a package to the Vetra ecosystem.</figcaption>
</figure>

On Vetra Cloud you'll find these steps as a quick reference for creating a package. This guide walks you through each one in detail — from installing the CLI and scaffolding your project to building and testing document models and editors. Publishing is covered separately in [Launch](/academy/Build/Launch/PublishYourProject).

:::warning
**This tutorial is a summary for builders that are already familiar with building document models**.  
It summarizes the flow from initial setup to a built, tested package.

Please start with the [**Manual Todo tutorial**](/academy/Build/ManualTodoTutorial/CreateNewPowerhouseProject) or the [**Document Model Creation**](/academy/Build/DocumentModelCreation/SpecifyTheStateSchema) section if you are unfamiliar with building a document model.
:::

<details>
<summary>Key commands that you'll use in this flow</summary>

- `pnpm install -g ph-cmd` or `npm install -g ph-cmd`: Installs the Powerhouse CLI globally.
- `ph init`: Initializes a new Powerhouse project or sets up the local environment.
- `ph vetra --interactive`: Launches Vetra Studio in interactive mode for package development.
- `ph vetra --interactive --watch`: Launches Vetra Studio with dynamic reloading for document-models and editors.
- `ph build`: Builds the project for production.
- `pnpm run test` or `npm test`: Runs unit tests.
- `ph publish`: Publishes your package to the Vetra registry.
- `ph install @your-org-ph/your-package-name`: Installs a published package into a local Powerhouse environment.

</details>

## Phase 1: Setup and initialization

### 1.1. Install Powerhouse CLI

Ensure you have the Powerhouse Command Line Interface (`ph-cmd`) installed. You use it to manage your Powerhouse projects.

```bash
pnpm install -g ph-cmd
```

Or if you're using npm:

```bash
npm install -g ph-cmd
```

:::info[Prerequisites]
See the [Prerequisites](/academy/Build/GettingStartedBuilding/Prerequisites) guide for detailed installation instructions for Node.js 24, package managers (pnpm or npm), and Git if you haven't set them up yet.
:::

### 1.2. Initialize your project environment

Before creating a specific project, or if you're setting up your environment for the first time, initialize the Powerhouse environment. This command prepares your local setup, including a local Reactor configuration.

```bash
ph init my-package
```

Replace `my-package` with your desired package name. If you run `ph init` without a name you will be prompted for one.

<details>
<summary> How to make use of different branches? </summary>

When installing or using the Powerhouse CLI commands you are able to make use of the dev & staging branches. These branches contain more experimental features than the latest stable release the PH CLI uses by default. They can be used to get access to a bugfix or features under development.

| Command                                                                 | Description                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| **pnpm install -g ph-cmd** or **npm install -g ph-cmd**                 | Install latest stable version                     |
| **pnpm install -g ph-cmd@dev** or **npm install -g ph-cmd@dev**         | Install development version                       |
| **pnpm install -g ph-cmd@staging** or **npm install -g ph-cmd@staging** | Install staging version                           |
| **ph init**                                                             | Use latest stable version of the boilerplate      |
| **ph init --dev**                                                       | Use development version of the boilerplate        |
| **ph init --staging**                                                   | Use staging version of the boilerplate            |
| **ph use latest**                                                       | Switch all dependencies to latest stable versions |
| **ph use dev**                                                          | Switch all dependencies to development versions   |
| **ph use staging**                                                      | Switch all dependencies to staging versions       |

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

:::warning[Be Aware]
When you are building your document model the code can break the Vetra Studio environment.
A full overview of the Vetra Studio commands can be found in the [Powerhouse CLI](/academy/Reference/CLITooling/PowerhouseCLI#vetra)
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

Vetra Studio connects to Claude through MCP (Model Context Protocol). This gives you greater control and direction over what the LLM codes for you.

:::info[Specification Driven Design & Development]
Vetra embraces **Specification Driven Design & Development** —an approach where your structured specification documents become the shared language between you and AI agents. You communicate intent through precise specs that are machine-readable and executable.

<details>
<summary>Explainer: Specification Driven AI</summary>

In the **Manual Todo tutorial** we've been making use of strict schema definition principles to communicate the intended use case of our document models.
The **schema definition language** is not only a shared language that bridges the gap between developer, designer and analyst but also the gap between builder and AI-agent through **specification driven AI control**.

- Communicate your solution and intent through a structured specification framework designed for AI collaboration.
- Specifications enable precise, iterative edits, since all our specification documents are machine-readable and executable.

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
:::

#### 0. Configure the Reactor MCP

Add the following to your Claude MCP settings (`~/.claude/mcp.json` for Claude Code, or the MCP servers section in Claude Desktop):

```json
{
  "mcpServers": {
    "reactor-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:4001/mcp"]
    }
  }
}
```

This only needs to be done once. Make sure `ph vetra` is running before starting a Claude session that uses the MCP.

#### 1. Start the Reactor MCP:

Make sure you are in the same directory as your project.
Claude will automatically recognize the necessary files and MCP tools.

```bash
claude
```

Claude also understands natural language, so similar phrasings work as well.

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

  or

  Connected to reactor MCP. You have access to 1 drive: vetra+a049e1b1==
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

- Define document schema with fields and types as in the **Manual Todo tutorial**
- Create the necessary operations
- Add the required modules to your package
- The document model creation chapter in the Mastery track provides in depth support [here](/academy/Build/DocumentModelCreation/SpecifyTheStateSchema)

→ [Learn more about Document Models](/academy/Build/DocumentModelCreation/WhatIsADocumentModel)

#### Using MCP (AI-Assisted)

- Describe your package, it's functionality and your needs in natural language in great detail.
- Claude will:
  - Generate an appropriate schema in the document model
  - Create the necessary operations
  - Implement the required reducers
  - Place the document in the Vetra drive

- Claude will also add the necessary interface in the form of a [document editor](/academy/Build/BuildingUserExperiences/BuildingDocumentEditors) and scaffold the [drive-app functionality](/academy/Build/BuildingUserExperiences/BuildingADriveExplorer) when specified.

→ [Learn more about Building Document Editors](/academy/Build/BuildingUserExperiences/BuildingDocumentEditors)
→ [Learn more about Building a Drive Explorer](/academy/Build/BuildingUserExperiences/BuildingADriveExplorer)

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

Use the Powerhouse CLI to process an exported `.phdm.zip` file and generate the necessary boilerplate code for your document model.

```bash
ph generate document-model --document YourModelName.phdm.zip
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

→ [Learn more about Building Document Editors](/academy/Build/BuildingUserExperiences/BuildingDocumentEditors)

<details>
<summary>Alternatively: Generate command</summary>

A document editor provides the user interface for interacting with your document model. Generate an editor template:

```bash
ph generate editor --name YourModelName --document-type powerhouse/YourModelName
```

- The `--name YourModelName` flag specifies the document model this editor is for.
- The `--document-type powerhouse/YourModelName` flag links the editor to the specific document type defined in your model specification.

This creates a template file, typically at `editors/your-model-name/editor.tsx`.

- Customize this React component to build your UI.
- You can use standard HTML, Tailwind CSS (available in Connect), or import custom CSS.
- Utilize components from `@powerhousedao/document-engineering` for consistency and rapid development. Learn more at [Document-Engineering](/academy/Reference/EditorsUI/DocumentEngineering)

</details>

## Phase 3: Implementation and testing

### 3.1. Implement reducer logic

Reducers are pure functions that implement the state transition logic for each operation defined in your schema. Navigate to `document-models/YourModelName/src/reducers/to-do-list.ts` (or similar, based on your model name).

- Implement the functions for each operation (e.g., `addTodoItemOperation`, `updateTodoItemOperation`).
- These functions take the current state and an action (containing input data) and return the new state.
- Powerhouse handles immutability behind the scenes.

### 3.2. Write unit tests for reducers

Test your reducer logic. Write unit tests in the `document-models/YourModelName/src/reducers/tests/` directory.

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

:::tip[Best Practices]

**Working with MCP and Claude**

1. Provide clear, specific instructions.
2. Ask for clarifying questions to be answered before code generation.
3. Review generated schemas before confirmation.
4. Work in layers instead of 'one-shotting' your code.
5. Verify implementation details in generated code before continuing.
6. Always double-check proposed next actions.

<details>
<summary>Complete Guide: Tips for Working with Claude in Vetra Studio</summary>

## Before You Start

**Setup Requirements:**

1. Run `ph vetra --interactive --watch` in one terminal first
2. Start Claude in a separate terminal from your project directory
3. Connect with: `claude` or `connect to the reactor mcp`
4. Verify you see the confirmation message with your drive name

## Communication Best Practices

### 1. Always Review Before Implementation

**CRITICAL**: Claude will present a proposal before creating anything. You'll see:

- Proposed document model structure (state schema, operations, modules)
- How data will be organized
- What actions users can perform

**Always review and confirm** before Claude proceeds. This is your chance to adjust the design.

### 2. Be Specific and Detailed

When describing what you need, include:

**For Document Models:**

- Purpose of the document (what problem does it solve?)
- All data fields and their types (strings, numbers, dates, etc.)
- What operations users should be able to perform
- Any relationships between data
- Business rules or constraints

**For Document Editors:**

- Which document model it's for
- UI layout and components you want
- User interactions and workflows
- Specific operations to use (by name from your document model)
- Any styling preferences

### 3. Use Clear Examples

Good prompt for a document model:

```
Create a document model for expense tracking with:
- Each expense has: amount (number), description (text),
  category (expense type), date, and receipt URL (optional)
- Users can: add expenses, edit expense details, delete expenses,
  and categorize by type
- Track total amount automatically
```

Good prompt for an editor:

```
Create an editor for the expense tracker with:
- A form to add new expenses (amount, description, category, date)
- A table showing all expenses with sort by date
- Each row has edit and delete buttons
- Show total at the bottom
- Use the addExpense, updateExpense, and deleteExpense operations
```

### 4. Work in Layers (Don't "One-Shot")

Instead of asking for everything at once:

- ✅ Start with the core document model
- ✅ Test it works
- ✅ Then add the editor
- ✅ Then add advanced features

This approach catches issues early and gives you better results.

### 5. Interactive Mode Benefits

Using `ph vetra --interactive` gives you confirmation prompts:

- Schema changes
- Operation definitions
- Code generation

**Review each step** before confirming - it's easier to adjust now than later.

### 6. What to Expect After Implementation

Claude will automatically:

- Run TypeScript checks (`npm run tsc`)
- Run linting (`npm run lint:fix`)
- Report any errors found
- Fix issues if needed

You'll see confirmation when everything compiles successfully.

### 7. Common Issues and How to Avoid Them

**Issue**: Generated model doesn't match expectations

- **Solution**: Provide more detailed requirements upfront. Ask clarifying questions.

**Issue**: Operations don't work as expected

- **Solution**: Be explicit about all actions and their parameters. Use real-world examples.

**Issue**: Editor UI doesn't look right

- **Solution**: Describe the UI in detail (layout, components, interactions). Reference similar interfaces if helpful.

## Key Concepts to Know

- **Document Model**: The template/blueprint for your documents (like a database schema)
- **Document**: An actual instance with real data (like a database record)
- **Operations**: Actions users can perform (like "add expense", "update status")
- **Editor**: The user interface to interact with your documents
- **Drive**: A collection that holds your documents (like a folder)

## Quick Tips

1. **Be specific**: More detail = better results
2. **Review proposals**: Always check before confirming
3. **Work incrementally**: Build in layers, not all at once
4. **Use operation names**: Reference them when describing editor functionality
5. **Ask questions**: If unsure, ask Claude to clarify or suggest options
6. **Test as you go**: Create model first, test it, then add the editor

## What Claude Can Do For You

- Generate complete document models from natural language
- Create all necessary operations automatically
- Build React editor interfaces with your specifications
- Handle all the TypeScript and boilerplate code
- Fix type errors and linting issues
- Add demo documents to test your models

## What You Should Focus On

- Clearly describing your business requirements
- Defining what data you need to track
- Specifying what actions users should perform
- Reviewing and confirming proposals
- Testing the generated results

**Remember**: Claude works best with clear, detailed requirements. Take time to explain what you want - it's faster than multiple iterations to fix misunderstandings.

</details>
:::

## Phase 4: Package and publish

With your document model and editor implemented and tested, package and publish them for distribution. Publishing is covered in one place for both the manual and Vetra workflows — it walks through configuring package details, building, versioning, and publishing to NPM or the Vetra registry:

→ [Publish your package](/academy/Build/Launch/PublishYourProject)

## Up next

You've seen the full Vetra flow. Now build a package by hand, step by step, in the [Manual Todo tutorial](/academy/Build/ManualTodoTutorial/ExploreDemoPackage).
