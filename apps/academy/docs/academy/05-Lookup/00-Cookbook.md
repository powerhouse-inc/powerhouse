---
toc_max_heading_level: 2
---

# Cookbook

## Author and test a subgraph

A package subgraph is a class that extends `BaseSubgraph<Ctx>`. Declare its own `static override readonly subgraphName = "kebab-case"`. Return typed entries or one `schema.graphql({ typeDefs, resolverCoordinates, resolvers: (subgraph) => ... })` result from `static override getSchema(schema: SchemaBuilder<YourClass>)`. Resolvers access state through `subgraph`.

- [Build a search subgraph](../03-Build/04-WorkWithData/03-UsingSubgraphs.md).
- [Reuse an abstract base and schema fragments](../04-Reference/03-GraphQLData/08-SubgraphClasses.md#inheritance-and-fragments).
- [Test a class through describe and bind without a host](../04-Reference/03-GraphQLData/09-TestingSubgraphs.md).
- [Migrate an existing package](../04-Reference/03-GraphQLData/07-SubgraphMigrationGuide.md).

Use overrides that call `super` for setup and teardown. Teardown tolerates partial setup and is not a process-exit hook. Developer tooling rejects old-style classes and points to `ph migrate`. Running hosts keep serving published old-style packages, with a notice only in development. Every existing endpoint, schema, and WebSocket and SSE mount is unchanged.

The recipe snapshots below include standalone servers from the external recipes repository. For package integration, use the class API above. Do not copy a standalone server's SDL and resolver map into instance fields.


## Powerhouse CLI recipes

This section covers recipes related to the `ph-cmd`, the command-line tool for Powerhouse project initialization, code generation, package management, and running local development environments.

<details id="installing-ph-cmd">
<summary>Installing 'ph-cmd'</summary>

### How to install Powerhouse CLI

---

### Problem statement

You need to install the Powerhouse CLI (`ph-cmd`) to create and manage Powerhouse projects.

### Prerequisites

- Node.js 24 installed
- pnpm package manager 10 installed
- Terminal or command prompt access

### Solution

### Step 1: Install the CLI globally

```bash
pnpm install -g ph-cmd
```

### Step 2: Verify the installation

```bash
ph-cmd --version
```

### Optional: Install specific versions

```bash
# For the staging version
pnpm install -g ph-cmd@staging

# For a specific version
pnpm install -g ph-cmd@<version>
```

### Expected outcome

- Powerhouse CLI (`ph-cmd`) installed globally on your system
- Access to all Powerhouse CLI commands for project creation and management

### Common issues and solutions

- Issue: Permission errors during installation
  - Solution: Use `sudo` on Unix-based systems or run as administrator on Windows
- Issue: Version conflicts
  - Solution: Clean your system using the uninstallation recipe before installing a new version

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

### Further reading

- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
</details>

<details id="managing-ph-cmd-versions">
<summary>Managing ph-cmd Versions and Package Information</summary>

### How to Switch Between ph-cmd Versions

---

### Problem statement

You need to switch to a different version of `ph-cmd`, check available versions, or understand how to manage package versions effectively.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- Terminal or command prompt access
- Package manager (pnpm, npm, or yarn) installed

### Solution

### Using Version Tags and Specific Versions

To change to a different version of `ph-cmd`, reinstall it globally with your package manager:

```bash
# Install latest version with a specific tag
npm install -g ph-cmd@staging
pnpm install -g ph-cmd@dev

# Install a specific version number
npm install -g ph-cmd@1.2.3-staging.10
pnpm install -g ph-cmd@6.0.0-dev.33
```

**Important:** Always use the same package manager you used for the original global install to avoid conflicting installations.

### Checking Your Current Installation

Use the `which` command to see where your global install is located:

```bash
which ph
# Example output: /Users/username/Library/pnpm/ph
```

This shows which package manager was used (in this case, pnpm).

### Viewing Available Versions

Use `npm view` to see all available versions and tags for any package:

```bash
npm view ph-cmd
```

This displays:

- Current version information
- Available dist-tags (latest, dev, staging, test)
- Specific version numbers for each tag
- Package maintainers and publish information

**Example dist-tags output:**

```
dist-tags:
latest: 5.3.0
dev: 6.0.0-dev.33
staging: 5.3.0-staging.24
test: 2.5.0-test.0
```

### Expected outcome

- Ability to switch between different versions of `ph-cmd`
- Understanding of available version tags and specific versions
- Knowledge of how to check current installation and available versions

### Best Practices

- Use specific version numbers (e.g., `ph-cmd@6.0.0-dev.33`) instead of tags when you need to ensure exact version consistency
- Check `npm view ph-cmd` before switching to see the latest available versions
- Remember that without specifying a version, `@latest` is installed by default

### Common issues and solutions

- Issue: Conflicting installations or commands not working
  - Solution: Ensure you use the same package manager for all global installs. Use `which ph` to verify your installation location.
- Issue: Outdated version after installation
  - Solution: Use `npm view ph-cmd` to check the latest available versions and install the specific version you need.

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Using Different Branches in Powerhouse](#using-different-branches-in-powerhouse)

### Further reading

- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
</details>

<details id="uninstalling-ph-cmd">
<summary>Uninstalling 'ph-cmd'</summary>

### How to uninstall Powerhouse CLI

---

### Problem statement

You want to perform a clean installation of the Powerhouse CLI.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A terminal or IDE

### Solution

### Step 1: Uninstall `ph-cmd`

```bash
pnpm uninstall -g ph-cmd
```

### Step 2: Remove the global setups folder

```bash
rm -rf ~/.ph
```

### Expected outcome

- Your system should now be clean from the Powerhouse CLI

### Common issues and solutions

- Issue: Outdated version
  - Solution: Uninstall and reinstall the Powerhouse CLI

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

### Further reading

- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
- [Create A New Powerhouse Project](/academy/Build/ManualTodoTutorial/CreateNewPowerhouseProject)
</details>

<details id="setting-up-or-resetting-the-global-powerhouse-configuration">
<summary>Setting up or Resetting the Global Powerhouse Configuration</summary>

### How to set up or reset the global Powerhouse configuration

---

### Problem statement

You need to initialize the global Powerhouse configuration for the first time, or reset it to resolve issues or start fresh. This might also involve switching to a specific dependency environment like staging.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- Terminal or command prompt access

### Solution

### Step 1: (Optional) Remove existing configuration

If you suspect issues with your current global setup or want a completely clean slate, remove the existing global configuration directory. **Skip this if setting up for the first time.**

```bash
# Use with caution: this removes your global settings and downloaded dependencies.
rm -rf ~/.ph
```

### Step 2: Set up global defaults

Initialize the default global project configuration.

```bash
ph setup-globals
```

### Step 3: (Optional) Switch to a specific environment (e.g., staging)

If you need to use non-production dependencies, switch the global environment.

```bash
# Switch to staging dependencies
ph use staging

# Or switch back to the latest stable versions
# ph use latest
```

### Expected outcome

- A `~/.ph` directory is created or reset.
- The global project is configured, potentially using the specified environment (e.g., staging).
- You are ready to initialize or work with Powerhouse projects using the defined global settings.

### Common issues and solutions

- Issue: Commands fail after removing `~/.ph`.
  - Solution: Ensure you run `ph setup-globals` afterwards.
- Issue: Need to use specific local dependencies globally.
  - Solution: Use `ph use local /path/to/local/packages`.

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Using Different Branches in Powerhouse](#using-different-branches-in-powerhouse)

### Further reading

- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
- [GraphQL Schema Best Practices](/academy/Build/WorkWithData/UsingTheAPI)
</details>

<details id="using-different-branches-in-powerhouse">
<summary>Using Different Branches in Powerhouse</summary>

### How to use different branches in Powerhouse

---

### Problem statement

You need to access experimental features, bugfixes, or development versions of Powerhouse components that aren't yet available in the stable release.

### Prerequisites

- Terminal or command prompt access
- pnpm package manager 10 installed
- Node.js 24 installed

### Solution

### Step 1: Install CLI with specific branch

Choose the appropriate installation command based on your needs:

```bash
# For latest stable version
pnpm install -g ph-cmd

# For development version
pnpm install -g ph-cmd@dev

# For staging version
pnpm install -g ph-cmd@staging
```

### Step 2: Initialize project with specific branch

When creating a new project, you can specify which branch to use:

```bash
# Use latest stable version of the boilerplate
ph init

# Use development version of the boilerplate
ph init --dev

# Use staging version of the boilerplate
ph init --staging
```

### Step 3: Switch dependencies for existing project

For existing projects, you can switch all dependencies to different versions:

```bash
# Switch to latest production versions
ph use

# Switch to development versions
ph use dev

# Switch to production versions
ph use prod
```

### Expected outcome

- Access to the specified version of Powerhouse components
- Ability to test experimental features or bugfixes
- Project configured with the chosen branch's dependencies

### Common issues and solutions

- Issue: Experimental features not working as expected
  - Solution: This is normal as these versions may contain untested features. Consider switching back to stable versions if issues persist.
- Issue: Version conflicts between components
  - Solution: Ensure all components are using the same branch version. Use `ph use` commands to synchronize versions.

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Managing and Updating Powerhouse Dependencies](#managing-and-updating-powerhouse-dependencies)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

### Further reading

- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
</details>

<details id="using-different-package-managers-with-powerhouse">
<summary>Using Different Package Managers with Powerhouse</summary>

### How to use different package managers with Powerhouse

---

### Problem statement

You want to use a different package manager (npm, yarn, or bun) instead of pnpm for managing Powerhouse projects and dependencies.

### Prerequisites

- Node.js 24 installed
- Your preferred package manager installed (npm, yarn, or bun)
- Terminal or command prompt access

### Solution

### Step 1: Install the CLI with Your Preferred Package Manager

Choose the appropriate installation command based on your package manager:

```bash
# Using npm
npm install -g ph-cmd --legacy-peer-deps

# Using yarn
yarn global add ph-cmd

# Using bun
bun install -g ph-cmd

# Using pnpm (default)
pnpm install -g ph-cmd
```

### Step 2: Configure PATH for Global Binaries

For yarn and bun, you need to add their global binary directories to your PATH:

#### For Yarn:

```bash
# Add this to your ~/.bashrc, ~/.zshrc, or equivalent
export PATH="$PATH:$(yarn global bin)"
```

#### For Bun:

```bash
# Add this to your ~/.bashrc, ~/.zshrc, or equivalent
export PATH="$PATH:$HOME/.bun/bin"
```

After adding these lines, reload your shell configuration:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

### Step 3: Verify Installation

Check that the CLI is properly installed and accessible:

```bash
ph-cmd --version
```

### Step 4: Using Different Package Managers in Projects

When working with Powerhouse projects, you can specify your preferred package manager:

```bash
# Initialize a project with npm
ph init --package-manager npm

# Initialize a project with yarn
ph init --package-manager yarn

# Initialize a project with bun
ph init --package-manager bun

# Initialize a project with pnpm (preferred default)
ph init --package-manager pnpm
```

### Expected outcome

- Powerhouse CLI installed and accessible through your preferred package manager
- Ability to manage Powerhouse projects using your chosen package manager
- Proper PATH configuration for global binaries

### Common issues and solutions

- Issue: Command not found after installation
  - Solution: Ensure the global binary directory is in your PATH (especially for yarn and bun)
  - Solution: Try running the command with the full path to verify installation
- Issue: Permission errors during installation
  - Solution: Use `sudo` on Unix-based systems or run as administrator on Windows
- Issue: Package manager conflicts
  - Solution: Stick to one package manager per project to avoid lockfile conflicts

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

### Further reading

- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
- [Yarn Global Installation Guide](https://classic.yarnpkg.com/lang/en/docs/cli/global/)
- [Bun Installation Guide](https://bun.sh/docs/installation#how-to-add-your-path)
</details>

## Powerhouse Package Development recipes

This comprehensive section covers the complete workflow for building Powerhouse packages using Vetra Studio, from project initialization and document model creation to editors, Drive-apps, and package publishing.

> **Tip:** For the best development experience, use **Vetra Studio** with `ph vetra --watch`. Vetra Studio provides automatic code generation, AI-assisted development, and live preview of your documents and editors.

### Vetra Studio

Vetra Studio is the AI-powered development environment for building Powerhouse packages with specification-driven workflows.

<details id="launching-vetra-studio">
<summary>Launching Vetra Studio</summary>

### How to Launch Vetra Studio

---

### Problem statement

You want to start Vetra Studio to develop document models, editors, and other package components using the specification-driven workflow.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- Terminal or command prompt access

### Solution

### Step 1: Navigate to Your Project Directory

```bash
cd <yourprojectname>
```

### Step 2: Choose Your Launch Mode

Vetra Studio offers three modes depending on your workflow:

#### Interactive Mode (Recommended for Development)

```bash
ph vetra --interactive
```

In interactive mode:

- You receive confirmation prompts before any code generation
- Changes require explicit confirmation before being processed
- Provides better control and visibility over document changes

#### Watch Mode with Interactive

```bash
ph vetra --interactive --watch
```

In watch mode:

- Enables dynamic loading for document-models and editors
- The system watches for changes and reloads them dynamically
- Best for active development with frequent changes

#### Standard Mode

```bash
ph vetra
```

In standard mode:

- Changes are processed automatically with 1-second debounce
- Multiple changes are batched and processed together
- Uses the latest document state for processing

### Expected outcome

- Vetra Studio launches in your browser
- You can access the Vetra Studio Drive to manage specifications
- Document models and editors are available for development

### Common issues and solutions

- **Issue**: Vetra Studio environment breaks during document model development
  - **Solution**: This can happen when code changes break the environment. Restart Vetra Studio and check your document model for errors.
- **Issue**: Changes not reflecting in the studio
  - **Solution**: If not using `--watch` mode, restart Vetra Studio to pick up changes.

### Related recipes

- [Connecting to a Remote Vetra Drive](#connecting-to-a-remote-vetra-drive)
- [Connecting Claude with Reactor MCP](#connecting-claude-with-reactor-mcp)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [Powerhouse CLI Reference](/academy/Reference/CLITooling/PowerhouseCLI#vetra)
</details>

<details id="connecting-to-a-remote-vetra-drive">
<summary>Connecting to a Remote Vetra Drive</summary>

### How to Connect to a Remote Vetra Drive

---

### Problem statement

You want to collaborate with team members by connecting to a shared remote Vetra drive instead of using a local one, enabling synchronized specifications across your team.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized or ready to create
- The URL of the remote Vetra drive you want to connect to
- Terminal or command prompt access

### Solution

#### Option A: Create a New Project with Remote Drive

### Step 1: Initialize with Remote Drive

```bash
ph init --remote-drive <url>
```

Example:

```bash
ph init --remote-drive https://switchboard.staging.vetra.io/d/my-team-drive
```

### Step 2: Start Vetra with Watch Mode

```bash
ph vetra --watch
```

#### Option B: Clone an Existing Project from Remote Drive

### Step 1: Checkout the Remote Drive

```bash
ph checkout --remote-drive <url>
```

### Step 2: Start Vetra

```bash
ph vetra --watch
```

#### Option C: Configure Remote Drive in Existing Project

### Step 1: Edit powerhouse.config.json

Add the Vetra configuration to your `powerhouse.config.json` file:

```json
{
  "vetra": {
    "driveId": "your-drive-id",
    "driveUrl": "https://switchboard.staging.vetra.io/d/your-drive-id"
  }
}
```

### Step 2: Start Vetra

```bash
ph vetra --watch
```

### Expected outcome

- Your project is connected to the remote Vetra drive
- Specifications sync across team members
- A "Vetra Preview" drive is created locally for testing changes before syncing
- The main "Vetra" drive syncs with the remote and contains stable package configuration

### Common issues and solutions

- **Issue**: Cannot connect to remote drive
  - **Solution**: Verify the drive URL is correct and accessible. Check your network connection and any firewall settings.
- **Issue**: Local changes not syncing
  - **Solution**: The "Vetra Preview" drive is for local testing. Changes need to be explicitly synced to the main drive.
- **Issue**: Conflicts with team member changes
  - **Solution**: Always use `ph vetra --watch` when restarting to ensure local documents and editors are loaded properly.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Connecting Claude with Reactor MCP](#connecting-claude-with-reactor-mcp)

### Further reading

- [Vetra Remote Drive Reference](/academy/Reference/CLITooling/VetraRemoteDrive)
- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
</details>

<details id="connecting-claude-with-reactor-mcp">
<summary>Connecting Claude with Reactor MCP</summary>

### How to Connect Claude with Reactor MCP

---

### Problem statement

You want to use AI-assisted development in Vetra Studio by connecting Claude to the Reactor MCP (Model Context Protocol), enabling natural language document model creation and editing.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- Vetra Studio running (`ph vetra --watch`)
- Claude CLI installed and configured
- Terminal or command prompt access

### Solution

### Step 1: Start Vetra Studio

First, ensure Vetra Studio is running in your project directory:

```bash
ph vetra --interactive --watch
```

### Step 2: Configure the MCP Server (one-time setup)

Add the Reactor MCP server to your Claude configuration. For Claude Code, add it to `~/.claude/mcp.json`; for Claude Desktop, add it under MCP Servers in settings:

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

This tells Claude how to reach the Reactor MCP endpoint. You only need to do this once per machine.

### Step 3: Open a New Terminal and Navigate to Your Project

```bash
cd <yourprojectname>
```

### Step 4: Start Claude CLI

```bash
claude
```

### Step 5: Connect to Reactor MCP

In the Claude CLI, request connection to the reactor:

```
connect to the reactor mcp
```

### Step 6: Verify the Connection

You should see a confirmation message like:

```
Connected to MCP successfully! I can see there's a
"vetra-4de7fa45" drive available. The reactor-mcp server is
running and ready for document model operations.
```

### Expected outcome

- Claude is connected to Reactor MCP
- Vetra Studio shows "Connected to Reactor MCP"
- You can now use natural language to create and modify document models
- Claude has access to document operations, drive operations, and document model operations

### Common issues and solutions

- **Issue**: MCP connection fails
  - **Solution**: Ensure Vetra Studio is running before attempting to connect Claude. Restart both Vetra and Claude if needed.
- **Issue**: Claude doesn't recognize reactor commands
  - **Solution**: Make sure you're in the correct project directory when starting Claude.
- **Issue**: Drive not visible in Claude
  - **Solution**: Verify Vetra Studio is running with the `--watch` flag and the drive is properly initialized.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Creating a Document Model with AI Assistance](#creating-a-document-model-with-ai-assistance)
- [Creating an Editor with AI Assistance](#creating-an-editor-with-ai-assistance)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
</details>

<details id="creating-a-document-model-with-ai-assistance">
<summary>Creating a Document Model with AI Assistance</summary>

### How to Create a Document Model with AI Assistance

---

### Problem statement

You want to create a new document model using natural language descriptions through Claude and the Reactor MCP, rather than manually defining schemas and operations.

### Prerequisites

- Vetra Studio running (`ph vetra --interactive --watch`)
- Claude connected to Reactor MCP (see [Connecting Claude with Reactor MCP](#connecting-claude-with-reactor-mcp))

### Solution

### Step 1: Describe Your Document Model to Claude

Provide a detailed description of your document needs. Be specific about:

- The purpose of the document
- The data fields and their types
- The operations users should be able to perform
- Any relationships or constraints

Example prompt:

```
Create a document model for a task tracker with the following requirements:
- Each task has a title (string), description (string), status (enum: todo, in-progress, done),
  priority (enum: low, medium, high), and due date (optional date)
- Users should be able to create tasks, update task details, change status, and delete tasks
- Tasks should track when they were created and last modified
```

### Step 2: Review the Generated Schema

Claude will generate:

- An appropriate GraphQL schema
- The necessary operations
- Implementation for the required reducers

Review the proposed schema before confirming.

### Step 3: Confirm Generation in Interactive Mode

If running in interactive mode, you'll be prompted to confirm:

- Schema changes
- Operation definitions
- Code generation

### Step 4: Verify in Vetra Studio

Check Vetra Studio to see your new document model in the drive. The document should appear with the defined schema and operations.

### Expected outcome

- A new document model is created based on your natural language description
- The schema, operations, and reducers are generated automatically
- The document model is placed in the Vetra drive
- Code scaffolding is generated in your project

### Common issues and solutions

- **Issue**: Generated schema doesn't match expectations
  - **Solution**: Provide more specific requirements. Ask Claude clarifying questions before generation.
- **Issue**: Operations missing functionality
  - **Solution**: Be explicit about all the actions users should be able to perform on the document.
- **Issue**: Code generation fails
  - **Solution**: Check if the document model is in a valid state. Review any error messages in Vetra Studio.

### Related recipes

- [Connecting Claude with Reactor MCP](#connecting-claude-with-reactor-mcp)
- [Creating an Editor with AI Assistance](#creating-an-editor-with-ai-assistance)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [Document Model Creation](/academy/Build/DocumentModelCreation/SpecifyTheStateSchema)
</details>

<details id="creating-an-editor-with-ai-assistance">
<summary>Creating an Editor with AI Assistance</summary>

### How to Create an Editor with AI Assistance

---

### Problem statement

You have a document model and want to create a user interface (editor) for it using AI assistance through Claude and the Reactor MCP.

### Prerequisites

- Vetra Studio running (`ph vetra --interactive --watch`)
- Claude connected to Reactor MCP
- An existing document model in your Vetra drive

### Solution

### Step 1: Describe Your Editor Requirements to Claude

Provide a detailed description including:

- The document model the editor is for
- UI layout and components needed
- User interactions and workflows
- Any specific styling or design requirements
- Reference to operations from the document model

Example prompt:

```
Create an editor for my task tracker document model with:
- A form to create new tasks with fields for title, description, priority, and due date
- A list view showing all tasks grouped by status (todo, in-progress, done)
- Each task card should show title, priority badge, and due date
- Clicking a task opens a detail panel for editing
- Status can be changed via drag-and-drop between columns or a dropdown
- Use the createTask, updateTask, changeStatus, and deleteTask operations
```

### Step 2: Review Generated Components

Claude will generate:

- Editor components
- Necessary hooks for document operations
- Required UI elements
- Integration with the document model operations

### Step 3: Confirm Generation

In interactive mode, confirm the proposed changes before they are applied.

### Step 4: Verify in Your Project

Check the `editors/` directory in your project for the generated editor files. The editor should be registered in your `powerhouse.manifest.json`.

### Step 5: Test the Editor

Run Vetra Studio and open your document to test the new editor interface.

### Expected outcome

- Editor components are generated in the `editors/` directory
- The editor is registered in `powerhouse.manifest.json`
- The editor integrates with your document model operations
- You can interact with documents through the new UI

### Common issues and solutions

- **Issue**: Editor doesn't appear in Vetra Studio
  - **Solution**: Verify the editor is registered in `powerhouse.manifest.json`. Restart Vetra Studio with `--watch`.
- **Issue**: Operations not working in the editor
  - **Solution**: Ensure the editor references the correct operation names from your document model.
- **Issue**: Styling doesn't match expectations
  - **Solution**: Provide more detailed design requirements or manually adjust the generated CSS/styles.

### Related recipes

- [Creating a Document Model with AI Assistance](#creating-a-document-model-with-ai-assistance)
- [Generating a Document Editor](#generating-a-document-editor)
- [Connecting Claude with Reactor MCP](#connecting-claude-with-reactor-mcp)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [Build a Todo-list Editor](/academy/Build/ManualTodoTutorial/BuildToDoListEditor)
</details>

### Project Initialization & Management

Creating, configuring, and managing Powerhouse projects, which are collections of document models, editors, and other resources.

<details id="initializing-a-new-project-and-document-model">
<summary>Initializing a New Project & Document Model</summary>

### How to initialize a new project and document model

---

### Problem statement

You need to create a new, empty document model within a Powerhouse project to represent a workflow of a business process.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (see [Initializing a Powerhouse Project Recipe](#powerhouse-cli-recipes)) or follow Step 1 & 2 below.
- Access to a terminal or command prompt
- A web browser

### Solution

> **Recommended:** Use **Vetra Studio** for document model development. Vetra provides automatic code generation and a live preview with `ph vetra --watch`. See [Launching Vetra Studio](#launching-vetra-studio) for the preferred workflow.

### Step 1: Initialize a Powerhouse Project (if needed)

If you haven't already, create a new Powerhouse project:

```bash
ph init
# Follow the prompts to name your project
```

### Step 2: Navigate to Project Directory

Change your current directory to the newly created project folder:

```bash
cd <yourprojectname>
```

### Step 3: Start Vetra Studio (Recommended)

Run Vetra with watch mode for automatic code generation and live preview:

```bash
ph vetra --watch
```

This will:

- Launch Vetra Studio in your browser
- Automatically generate code when you make changes to document models
- Provide live preview of your documents and editors

### Step 4: Create the Document Model

In Vetra Studio, navigate to your drive and click the `DocumentModel` button to create a new document model.

### Alternative: Using Connect (Legacy)

If you need to use the Connect application instead:

```bash
ph connect
```

Wait for the output indicating the server is running (e.g., `Local: http://localhost:3000/`).

### Expected outcome

- An empty document model is created and opened in the Document Model Editor.
- You are ready to start defining the schema and logic for your new model.
- With Vetra, code is automatically generated as you make changes.

### Common issues and solutions

- Issue: `ph vetra` command fails.
  - Solution: Ensure `ph-cmd` is installed correctly (`ph-cmd --version`). Check for port conflicts. Make sure you are inside the project directory created by `ph init`.
- Issue: Browser window doesn't open automatically.
  - Solution: Manually open the URL shown in the terminal output.
- Issue: Cannot find the `DocumentModel` button.
  - Solution: Ensure you have navigated into your drive within the application first.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Creating a Document Model with AI Assistance](#creating-a-document-model-with-ai-assistance)
- [Initializing a Powerhouse Project](#powerhouse-cli-recipes)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [GraphQL Schema Best Practices](/academy/Build/WorkWithData/UsingTheAPI)
</details>

<details id="generating-reducers-from-a-document-model-file">
<summary>Generating Reducers from a Document Model File</summary>

### How to Generate Reducers from a Document Model File

---

### Problem statement

You have a Powerhouse Document Model defined in a `.phdm` or `.phdm.zip` file and need to generate the corresponding reducer functions for your project.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- A `.phdm` or `.phdm.zip` file containing your document model definition, placed in your project (e.g., at the root).

### Solution

> **Recommended:** Use **Vetra Studio** with `ph vetra --watch` for automatic code generation. Vetra watches for changes to your document models and automatically generates reducers and other code. See [Launching Vetra Studio](#launching-vetra-studio).

### Using Vetra (Recommended)

With Vetra running in watch mode, code generation happens automatically:

```bash
ph vetra --watch
```

When you make changes to document models in Vetra Studio, reducers and other code are generated automatically.

### Manual Generation (Alternative)

If you need to manually generate code from a `.phdm` file:

### Step 1: Navigate to Project Directory

Ensure your terminal is in the root directory of your Powerhouse project.

```bash
cd <yourprojectname>
```

### Step 2: Run the Generate Command

Execute the `ph generate` command, providing the path to your document model file.

```bash
# Replace todo.phdm.zip with the actual filename/path of your model
ph generate todo.phdm.zip
```

### Step 3: Integrate Generated Code

The command will output the generated reducer scaffolding code in the designated folders.

### Expected outcome

- Reducer functions corresponding to the operations defined in your document model are generated.
- The generated code is ready to be integrated into your project's state management logic.
- With Vetra, this happens automatically when you save changes.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)
- [Generating a Document Editor](#generating-a-document-editor)

</details>

<details id="managing-and-updating-powerhouse-dependencies">
<summary>Managing and Updating Powerhouse Dependencies</summary>

### How to Manage and Update Powerhouse Dependencies

---

### Problem statement

You need to understand and manage different types of dependencies in your Powerhouse project, and know how to update them using `ph update` and `ph use` commands. This includes updating based on version ranges, switching between development environments, and understanding the Powerhouse branching strategy.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- Terminal or command prompt access

### Solution

### Understanding Dependency Types

#### 1. Monorepo Dependencies (Powerhouse Core)

The Powerhouse monorepo uses a specific branching strategy:

- **Development** (`dev` tag): Ongoing development on the main branch
- **Staging** (`staging` tag): Pre-release branch (`Release/staging/v.x.x`)
- **Production** (`latest` or `prod` tag): Latest stable release (`Release/production/v.x.x`)

You can install CLI versions matching these environments:

```bash
# Install dev version of CLI
pnpm install -g ph-cmd@dev

# Install staging version
pnpm install -g ph-cmd@staging

# Install latest stable version
pnpm install -g ph-cmd
```

#### 2. Project Dependencies

These are dependencies from published npm packages in your `package.json`.

### Using `ph update`: Version Range Updates

Use `ph update` to update dependencies based on the semver ranges in your `package.json`:

#### Step 1: Standard Update (Respect Version Ranges)

Update all Powerhouse dependencies within the ranges specified in your `package.json`:

```bash
ph update
```

This updates packages like `@powerhousedao/*` and `document-model` to their latest versions that satisfy your version constraints.

### Step 2: Force Update to Specific Environment

Override version ranges and force all dependencies to a specific environment:

```bash
# Force update to latest dev versions
ph update --force dev

# Force update to latest stable/production versions
ph update --force prod
# or
ph update --force latest
```

#### Step 3: Specify Package Manager (Optional)

```bash
ph update --package-manager pnpm
```

### Using `ph use`: Environment Switching

Use `ph use` to quickly switch all dependencies between environments or versions:

#### Switching to Development Environment

```bash
ph use dev
```

This switches all installed Powerhouse dependencies to their `@dev` tagged versions.

#### Switching to Staging Environment

```bash
ph use staging
```

#### Switching to Production Environment

```bash
ph use prod
# or
ph use latest
```

#### Switching to Specific Version

```bash
# Use a specific release version
ph use 5.1.0

# Use a pre-release version
ph use 1.0.0-beta.1
```

#### Using Local Development Versions

For active development, link to local packages:

```bash
ph use local /path/to/powerhouse/monorepo
```

#### Resolving Tags to Exact Versions

Use `--use-resolved` to resolve tags to actual version numbers:

```bash
ph use dev --use-resolved
```

This resolves `@dev` to an exact version like `v1.0.1-dev.1` instead of using the tag.

### Initializing Projects with Specific Environments

When creating new projects, you can specify the environment:

```bash
# Initialize with dev dependencies
ph init my-project --dev

# Initialize with staging dependencies
ph init my-project --staging

# Initialize with production dependencies (default)
ph init my-project
```

### Publishing Updated Dependencies

If you're developing packages:

1. Update dependencies in your project using `ph use` or `ph update`
2. Test thoroughly
3. Publish the updated package to npm:
   ```bash
   pnpm build
   npm publish
   ```
4. Other projects get the new version when they run `ph install your-package`

### Expected outcome

- Clear understanding of Powerhouse dependency types and environments
- Ability to update dependencies based on version ranges with `ph update`
- Ability to switch between environments with `ph use`
- Knowledge of the dev/staging/prod branching strategy
- Understanding of when to use each command

### Common issues and solutions

- **Issue**: Dependencies not updating as expected
  - **Solution**: Check your `package.json` version ranges. Use `ph update --force <env>` to override ranges.
- **Issue**: Confusion between `ph update` and `ph use`
  - **Solution**: Use `ph update` for version range updates. Use `ph use` for environment switching.
- **Issue**: Breaking changes after updates
  - **Solution**: Test thoroughly. Consider publishing to a private npm registry first. Use staging environment before production.
- **Issue**: Local development changes not reflecting
  - **Solution**: Use `ph use local /path/to/monorepo` and ensure you've built the local packages.
- **Issue**: Which version am I using?
  - **Solution**: Check `package.json` for installed versions. Use `ph list` to see installed packages.

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Using Different Branches in Powerhouse](#using-different-branches-in-powerhouse)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)
- [Installing a Custom Powerhouse Package](#installing-a-custom-powerhouse-package)

### Further reading

- [Powerhouse CLI Reference: Update Command](/academy/Reference/CLITooling/PowerhouseCLI#update)
- [Powerhouse CLI Reference: Use Command](/academy/Reference/CLITooling/PowerhouseCLI#use)
- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)

</details>

<details id="running-connect-with-https-and-a-custom-port">
<summary>Running Connect with HTTPS and a Custom Port</summary>

### How to Run Connect with HTTPS and a Custom Port

---

### Problem statement

You need to run the local Powerhouse application using HTTPS, possibly on a different port than the default, for scenarios like testing on a remote server (e.g., EC2) or complying with specific network requirements.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- Potentially, valid SSL/TLS certificates if running in a non-localhost environment that requires trusted HTTPS. (The `--https` flag may use self-signed certificates for local development).

### Solution

> **Note:** For local development, **Vetra Studio** (`ph vetra --watch`) is the recommended workflow as it provides automatic code generation and live preview. Use the options below when you specifically need HTTPS or custom port configurations.

### Step 1: Navigate to Project Directory

Ensure your terminal is in the root directory of your Powerhouse project.

```bash
cd <yourprojectname>
```

### Step 2: Run with Flags

#### Using Vetra (Recommended for Development)

```bash
# Vetra with watch mode for automatic code generation
ph vetra --watch
```

#### Using Connect (for HTTPS/Custom Port)

Execute the `ph connect` command, adding the `--https` flag to enable HTTPS and the `--port` flag followed by the desired port number.

```bash
# Example using port 8442
ph connect --port 8442 --https
```

### Step 3: Access the Application

Open your web browser and navigate to the specified address. Remember to use `https` and include the custom port.

```
https://<your-hostname-or-ip>:<port>
# Example: https://localhost:8442
# Example: https://my-ec2-instance-ip:8442
```

You might encounter a browser warning about the self-signed certificate; you may need to accept the risk to proceed for local/development testing.

### Expected outcome

- The Powerhouse application starts and serves traffic over HTTPS on the specified port.
- You can access the interface securely using the `https` protocol.

### Common issues and solutions

- Issue: Browser shows security warnings (e.g., "Your connection is not private").
  - Solution: This is expected when using the default self-signed certificate generated by `--https`. For development or internal testing, you can usually proceed by accepting the risk. For production or public-facing scenarios, configure with properly signed certificates (consult Powerhouse documentation for advanced configuration).
- Issue: Port conflict (e.g., `"Port <port> is already in use"`).
  - Solution: Choose a different port number that is not currently occupied by another application.
- Issue: Cannot access from a remote machine.
  - Solution: Ensure the port is open in any firewalls (on the server and potentially network firewalls). Verify you are using the correct public IP address or hostname of the machine.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)
</details>

### Editors & Drive-apps

Generating and customizing editors for Document Models and custom interfaces for Drives.

<details id="generating-a-document-editor">
<summary>Generating a Document Editor</summary>

### How to Generate a Document Editor

---

### Problem statement

You have a Powerhouse document model and need to create a user interface (editor) for it.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- A document model generated or defined within the project (e.g., in the `document-models` directory).

### Solution

> **Recommended:** Use **Vetra Studio** with `ph vetra --watch` for editor development. Vetra automatically generates editor scaffolding and provides live preview as you develop. See [Launching Vetra Studio](#launching-vetra-studio) and [Creating an Editor with AI Assistance](#creating-an-editor-with-ai-assistance).

### Using Vetra (Recommended)

Start Vetra with watch mode for automatic code generation and live preview:

```bash
ph vetra --watch
```

In Vetra Studio, you can:

- Create editors visually or with AI assistance
- See live preview of your editor as you make changes
- Automatically generate editor scaffolding

### Manual Generation (Alternative)

If you need to manually generate an editor template:

### Step 1: Navigate to Project Directory

Ensure your terminal is in the root directory of your Powerhouse project.

```bash
cd <yourprojectname>
```

### Step 2: Generate the Editor Template

Run the `generate` command, specifying the editor name (usually matching the document model name) and the associated document type.

```bash
# Replace <ModelName> with the name of your document model (e.g., To-do List)
# Replace <docType> with the identifier for your document (e.g., powerhouse/todo-list)
ph generate --editor <ModelName> --document-types <docType>
```

### Expected outcome

- A new directory is created under `editors/` (e.g., `editors/<model-name>/`).
- An `editor.tsx` file is generated within that directory, containing a basic template for your document editor.
- You can now customize `editor.tsx` to build your desired UI using HTML, Tailwind CSS, or custom CSS.
- With Vetra, you get live preview with `ph vetra --watch` as you develop.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Creating an Editor with AI Assistance](#creating-an-editor-with-ai-assistance)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)
- [Generating a Custom Drive-app](#generating-a-custom-drive-app)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [Build a Todo-list Editor](/academy/Build/ManualTodoTutorial/BuildToDoListEditor)
</details>

<details id="generating-a-custom-drive-app">
<summary>Generating a Custom Drive-app</summary>

### How to Generate a Custom Drive-app

---

### Problem statement

You need a custom, application-like interface to browse, organize, or interact with specific types of documents stored within a Powerhouse drive, going beyond the standard file listing.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)

### Solution

> **Recommended:** Use **Vetra Studio** with `ph vetra --watch` for drive explorer development. Vetra provides automatic code generation and live preview as you build your custom drive interface. See [Launching Vetra Studio](#launching-vetra-studio).

### Using Vetra (Recommended)

Start Vetra with watch mode for automatic code generation and live preview:

```bash
ph vetra --watch
```

Vetra Studio allows you to develop and preview your Drive-app in real-time.

### Manual Generation (Alternative)

If you need to manually generate a Drive-app template:

### Step 1: Navigate to Project Directory

Ensure your terminal is in the root directory of your Powerhouse project.

```bash
cd <yourprojectname>
```

### Step 2: Generate the Drive-app Template

Run the `generate` command, specifying the `--drive-editor` flag and a name for your Drive-app.

```bash
# Replace <drive-app-name> with a suitable name for your Drive-app (e.g., todo-drive-app)
ph generate --drive-editor <drive-app-name>
```

### Expected outcome

- A new directory is created under `editors/` (e.g., `editors/<drive-app-name>/`).
- Template files (`EditorContainer.tsx`, components, hooks, etc.) are generated within that directory, providing a basic structure for a Drive-app.
- You can now customize these files to create your specific drive interface, potentially removing default components and adding custom views relevant to your document models.
- Remember to update your `powerhouse.manifest.json` to register the new app.
- With Vetra, you get live preview with `ph vetra --watch` as you develop.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Generating a Document Editor](#generating-a-document-editor)

### Further reading

- [Vetra Studio Documentation](/academy/GetStarted/VetraStudio)
- [Build a Drive-app](/academy/Build/BuildingUserExperiences/BuildingADriveExplorer)
</details>

<details id="adding-a-new-drive-via-graphql-mutation">
<summary>Adding a New Drive via GraphQL Mutation</summary>

### How to Add a New Remote Drive via GraphQL Mutation

---

### Problem statement

You want to programmatically add a new remote drive to your Powerhouse Connect environment using a GraphQL mutation. This is useful for automation, scripting, or integrating with external systems.

### Prerequisites

- Access to the Switchboard or remote reactor (server node) of your Connect instance.
- The GraphQL endpoint for your instance (e.g., `https://staging.switchboard.phd/graphql/system`).
- Appropriate permissions to perform mutations.

### Solution

### Step 1: Access the GraphQL Playground or Client

Open the GraphQL Playground at your endpoint (e.g., [https://staging.switchboard.phd/graphql/system](https://staging.switchboard.phd/graphql/system)), or use a GraphQL client of your choice.

### Step 2: Prepare the Mutation

Use the following mutation to create a new drive, set a name and add a drive icon. Weither or not you define a ID & Slug is up to you:

```graphql
mutation Mutation(
  $name: String!
  $icon: String
  $addDriveId: String
  $slug: String
) {
  addDrive(name: $name, icon: $icon, id: $addDriveId, slug: $slug) {
    icon
    id
    name
    slug
  }
}
```

Example variables:

```json
{
  "name": "AcademyTest",
  "icon": "https://static.thenounproject.com/png/3009860-200.png",
  "addDriveId": null,
  "slug": null
}
```

You can also provide a custom `id`, `slug`, or `preferredEditor` if needed.

### Step 3: Execute the Mutation

Run the mutation. On success, you will receive a response containing the new drive's `icon`, `id`, `name`, and `slug`:

```json
{
  "data": {
    "addDrive": {
      "icon": "https://static.thenounproject.com/png/3009860-200.png",
      "id": "6461580b-d317-4596-942d-f6b3d1bfc8fd",
      "name": "AcademyTest",
      "slug": "6461580b-d317-4596-942d-f6b3d1bfc8fd"
    }
  }
}
```

### Step 4: Construct the Drive URL

Once you have the `id` or `slug`, you can construct the drive URL for Connect:

- Format: `domain/d/driveId` or `domain/d/driveSlug`
- Example: `https://staging.connect.phd/d/6461580b-d317-4596-942d-f6b3d1bfc8fd`

### Step 5: Add the Drive in Connect

Use the constructed URL to add or access the drive in your Connect environment.

### Expected outcome

- A new drive is created and accessible in your Connect environment.
- The drive can be managed or accessed using the generated URL.

### Related recipes

- [Configuring Drives](/academy/Build/WorkWithData/ConfiguringDrives)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

### Further reading

- [GraphQL Playground](https://www.apollographql.com/docs/apollo-server/testing/graphql-playground/)
- [Powerhouse Builder Tools](/academy/Build/GettingStartedBuilding/BuilderTools)

</details>

### Package Publishing & Distribution

Creating, installing, and managing Powerhouse Packages for distribution and reuse.

<details id="packaging-and-publishing-a-powerhouse-project">
<summary>Packaging and Publishing a Powerhouse Project</summary>

### How to Package and Publish a Powerhouse Project

---

### Problem statement

You have created a collection of document models, editors, or other components and want to share it as a reusable package on a public or private npm registry. Publishing a package allows other projects to install and use your creations easily.

### Prerequisites

- A completed Powerhouse project that you are ready to share.
- An account on [npmjs.com](https://www.npmjs.com/) (or a private registry).
- Your project's `package.json` should have a unique name and correct version.
- You must be logged into your npm account via the command line.

### Solution

### Step 1: Build the Project

First, compile your project to create a production-ready build in the `dist/` or `build/` directory.

```bash
pnpm build
```

### Step 2: Log In to npm

If you aren't already, log in to your npm account. You will be prompted for your username, password, and one-time password.

```bash
npm login
```

### Step 3: Version Your Package

Update the package version according to semantic versioning. This command updates `package.json` and creates a new Git tag.

```bash
# Choose one depending on the significance of your changes
pnpm version patch   # For bug fixes (e.g., 1.0.0 -> 1.0.1)
pnpm version minor   # For new features (e.g., 1.0.1 -> 1.1.0)
pnpm version major   # For breaking changes (e.g., 1.1.0 -> 2.0.0)
```

### Step 4: Publish the Package

Publish your package to the npm registry. If it's your first time publishing a scoped package (e.g., `@your-org/your-package`), you may need to add the `--access public` flag.

```bash
npm publish --access public
```

### Step 5: Push Git Commits and Tags

Push your new version commit and tag to your remote repository to keep it in sync.

```bash
# Push your current branch
git push

# Push the newly created version tag
git push --tags
```

### Expected outcome

- Your Powerhouse project is successfully published to the npm registry.
- Other developers can now install your package into their projects using `ph install @your-org/your-package-name`.
- Your Git repository is updated with the new version information.

### Common issues and solutions

- **Issue**: "403 Forbidden" or "You do not have permission" error on publish.
  - **Solution**: Ensure your package name is unique and not already taken on npm. If it's a scoped package (`@scope/name`), make sure the organization exists and you have permission to publish to it. For public scoped packages, you must include `--access public`.

### Related recipes

- [Installing a Custom Powerhouse Package](#installing-a-custom-powerhouse-package)
- [Managing and Updating Powerhouse Dependencies](#managing-and-updating-powerhouse-dependencies)

</details>

<details id="installing-a-custom-powerhouse-package">
<summary>Installing a Custom Powerhouse Package</summary>

### How to Install a Custom Powerhouse Package

---

### Problem statement

You have developed and published a Powerhouse package (containing document models, editors, etc.) to npm, or you have a local package, and you need to install it into another Powerhouse project.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`) where you want to install the package.
- The custom package is either published to npm or available locally.

### Solution

### Step 1: Navigate to the Target Project Directory

Ensure your terminal is in the root directory of the Powerhouse project where you want to install the package.

```bash
cd <your-target-project-name>
```

### Step 2: Install the Package

Use the `ph install` command followed by the package name (if published to npm) or the path to the local package.

**For npm packages:**

```bash
# Replace <your-package-name> with the actual name on npm
ph install <your-package-name>
```

**For local packages (using a relative or absolute path):**

```bash
# Example using a relative path
ph install ../path/to/my-local-package

# Example using an absolute path
ph install /Users/you/dev/my-local-package
```

### Step 3: Verify Installation

Check your project's `package.json` and `powerhouse.manifest.json` to ensure the package dependency has been added correctly. Run `ph vetra --watch` (or `ph connect`) to see if the components from the installed package are available.

### Expected outcome

- The custom Powerhouse package is downloaded and installed into your project's dependencies.
- The `powerhouse.manifest.json` is updated (if necessary) to reflect the installed package.
- Document models, editors, Drive-apps, or other components from the package become available within the target project.

### Common issues and solutions

- Issue: Package not found (npm).
  - Solution: Double-check the package name for typos. Ensure the package is published and accessible on npm.
- Issue: Path not found (local).
  - Solution: Verify the relative or absolute path to the local package directory is correct.
- Issue: Conflicts with existing project components or dependencies.
  - Solution: Resolve version conflicts or naming collisions as needed. Review the installed package's structure and dependencies.

### Related recipes

- [Publishing a Powerhouse Package](#publishing-a-powerhouse-package)
- [Initializing a Powerhouse Project](#initializing-a-new-project-and-document-model)

</details>

## Deployment recipes

This section covers deploying Powerhouse applications and packages to various environments using Docker and other deployment methods.

<details id="deploying-powerhouse-with-docker">
<summary>Deploying Powerhouse with Docker</summary>

### How to Deploy Powerhouse with Docker

---

### Problem statement

You want to deploy your Powerhouse application (Connect and Switchboard) using Docker containers for production or development environments. Docker deployment provides consistency, reproducibility, and easy scalability across different platforms.

### Prerequisites

- Docker installed on your system
- Docker Compose installed (usually included with Docker Desktop)
- Basic understanding of Docker concepts
- (Optional) A custom Powerhouse package to deploy

### Solution

### Step 1: Create a Docker Compose Configuration

Create a `docker-compose.yml` file in your project directory:

```yaml
name: powerhouse

services:
  connect:
    image: ghcr.io/powerhouse-inc/powerhouse/connect:latest
    environment:
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
      - PH_CONNECT_BASE_PATH=/
    ports:
      - "127.0.0.1:3000:4000"
    networks:
      - powerhouse_network
    depends_on:
      postgres:
        condition: service_healthy

  switchboard:
    image: ghcr.io/powerhouse-inc/powerhouse/switchboard:latest
    environment:
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
    ports:
      - "127.0.0.1:4000:4001"
    networks:
      - powerhouse_network
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16.1
    ports:
      - "127.0.0.1:5444:5432"
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
      - POSTGRES_USER=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - powerhouse_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 3

networks:
  powerhouse_network:
    name: powerhouse_network

volumes:
  postgres_data:
```

### Step 2: Install Custom Packages (Optional)

If you have custom Powerhouse packages to deploy, add them via the `PH_PACKAGES` environment variable:

```yaml
services:
  connect:
    image: ghcr.io/powerhouse-inc/powerhouse/connect:latest
    environment:
      - PH_PACKAGES=@powerhousedao/your-package,@powerhousedao/another-package
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
```

### Step 3: Start the Services

Launch all services in detached mode:

```bash
docker compose up -d
```

### Step 4: Verify Deployment

Check that all services are running:

```bash
docker compose ps
```

View logs to confirm successful startup:

```bash
docker compose logs -f
```

### Step 5: Access Your Application

Once services are running, access:

- **Connect**: http://localhost:3000
- **Switchboard API**: http://localhost:4000

### Production Configuration

For production deployments, use specific version tags and secure credentials:

```yaml
services:
  connect:
    image: ghcr.io/powerhouse-inc/powerhouse/connect:v1.0.0
    env_file:
      - .env

  switchboard:
    image: ghcr.io/powerhouse-inc/powerhouse/switchboard:v1.0.0
    env_file:
      - .env
```

Create a `.env` file with secure credentials:

```bash
POSTGRES_PASSWORD=your-secure-password
DATABASE_URL=postgres://powerhouse:your-secure-password@postgres:5432/powerhouse
```

### Expected outcome

- All Powerhouse services (Connect, Switchboard, PostgreSQL) are running in Docker containers
- Services can communicate with each other through the Docker network
- Your custom packages (if specified) are installed and available
- The application is accessible through the configured ports
- Data is persisted in Docker volumes

### Common issues and solutions

- **Issue**: Container fails to start with "port already in use" error
  - **Solution**: Change the port mapping in `docker-compose.yml` to use an available port (e.g., `3001:4000` instead of `3000:4000`)
- **Issue**: Database connection errors on startup
  - **Solution**: Ensure the `depends_on` configuration includes health checks so services wait for PostgreSQL to be ready
- **Issue**: Custom packages fail to install
  - **Solution**: Verify package names are correct and published to npm. Check container logs with `docker compose logs switchboard` or `docker compose logs connect`
- **Issue**: Changes to docker-compose.yml not taking effect
  - **Solution**: Run `docker compose down` then `docker compose up -d` to recreate containers with new configuration
- **Issue**: Permission errors with volumes
  - **Solution**: Ensure the volume paths have correct permissions: `sudo chown -R 1000:1000 ./data`

### Related recipes

- [Installing a Custom Powerhouse Package](#installing-a-custom-powerhouse-package)
- [Setting up a Production Environment](#setting-up-a-production-environment)
- [Publishing a Powerhouse Package](#packaging-and-publishing-a-powerhouse-project)

### Further reading

- [Docker Deployment Guide](/academy/Build/Launch/DockerDeployment)
- [Environment Configuration](/academy/Build/Launch/ConfigureEnvironment)
- [Setup Environment Guide](/academy/Build/Launch/SetupEnvironment)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
</details>

<details id="setting-up-a-production-environment">
<summary>Setting up a Production Environment</summary>

### How to set up a Production Powerhouse Environment

---

### Problem statement

You need to set up a new production-ready server to host and run your Powerhouse services (Connect and Switchboard).

### Prerequisites

- A Linux-based server (Ubuntu or Debian recommended) with `sudo` privileges.
- A registered domain name.
- DNS `A` records for your `connect` and `switchboard` subdomains pointing to your server's public IP address.

### Solution

### Step 1: Install Powerhouse Services

SSH into your server and run the universal installation script. This will install Node.js, pnpm, and prepare the system for Powerhouse services.

```bash
curl -fsSL https://apps.powerhouse.io/install | bash
```

### Step 2: Reload Your Shell

After the installation, reload your shell's configuration to recognize the new commands.

```bash
source ~/.bashrc  # Or source ~/.zshrc if using zsh
```

### Step 3: Initialize a Project

Create a project directory for your services. The `ph-init` command sets up the basic structure. Move into the directory after creation.

```bash
ph-init my-powerhouse-services
cd my-powerhouse-services
```

### Step 4: Configure Services

Run the interactive setup command. This will guide you through configuring Nginx, PM2, databases, and SSL.

```bash
ph service setup
```

During the setup, you will be prompted for:

- **Packages to install:** You can pre-install any Powerhouse packages you need. (Optional)
- **Database:** Choose between a local PostgreSQL setup or connecting to a remote database.
- **SSL Certificate:** Select Let's Encrypt for a production setup. You will need to provide your domain and subdomains.

### Expected outcome

- Powerhouse Connect and Switchboard services are installed, configured, and running on your server.
- Nginx is set up as a reverse proxy with SSL certificates from Let's Encrypt.
- Services are managed by PM2 and will restart automatically on boot or if they crash.
- You can access your services securely at `https://connect.yourdomain.com` and `https://switchboard.yourdomain.com`.

### Common issues and solutions

- **Issue:** `ph: command not found`
  - **Solution:** Ensure you have reloaded your shell with `source ~/.bashrc` or have restarted your terminal session.
- **Issue:** Let's Encrypt SSL certificate creation fails.
  - **Solution:** Verify that your domain's DNS records have fully propagated and are pointing to the correct server IP. This can take some time.
- **Issue:** Services fail to start.
  - **Solution:** Check the service logs for errors using `ph service logs` or `pm2 logs`.

### Related recipes

- [Installing a Custom Powerhouse Package](#installing-a-custom-powerhouse-package)
- [Deploying Powerhouse with Docker](#deploying-powerhouse-with-docker)

### Further reading

- [Full Setup Guide](/academy/Build/Launch/SetupEnvironment)
</details>

## Reactor & Data Synchronisation recipes

This section covers managing the Powerhouse Reactor (the local service for processing document model operations) and troubleshooting data synchronization within the Powerhouse ecosystem.

> **Tip:** For development workflows, **Vetra Studio** (`ph vetra --watch`) is recommended as it includes reactor functionality along with automatic code generation and live preview.

### Reactor Recipes

The [Powerhouse Recipes](https://github.com/powerhouse-inc/recipes) repository contains standalone example projects that demonstrate common Reactor patterns and integrations. Each recipe is a self-contained project you can clone and run.

:::note
The document models in these recipes are schema-first, so their reducers live in `v<n>/src/reducers/`. To write a model in TypeScript instead, see [Choose an approach](../04-Reference/02-DocumentModels/01-CodeFirst/00-ChooseYourApproach.md) and the [code-first quickstart](../04-Reference/02-DocumentModels/01-CodeFirst/01-Quickstart.md).
:::

{/* AUTO-GENERATED-RECIPE-DOCS-START */}
{/* This content is automatically generated by scripts/generate-recipe-docs.ts. Do not edit directly. */}

| Recipe | Description |
| --- | --- |
| [Analytics Processor](https://github.com/powerhouse-inc/recipes/tree/main/analytics-processor) | A [Reactor](https://github.com/powerhouse-inc) processor that projects expense-report line items into the Powerhouse analytics engine (a dimensional time-series store) and a query layer that reads aggregations back out. |
| [Anonymous Subscriptions](https://github.com/powerhouse-inc/recipes/tree/main/anonymous-subscriptions) | A WebSocket client that carries no `authorization` in its `connectionParams` connects to an auth-enabled Switchboard, receives `connection_ack`, and stays connected. |
| [Audit Trail](https://github.com/powerhouse-inc/recipes/tree/main/audit-trail) | A [Powerhouse Reactor](https://github.com/powerhouse-inc) processor that inspects `ActionSigner` context on every operation to build an immutable audit log in PostgreSQL. |
| [Auth Preflight](https://github.com/powerhouse-inc/recipes/tree/main/auth-preflight) | Every other auth recipe here shows the reactor refusing a write **after** it arrives, as a failed job or a stored `deniedReason`. |
| [Batch Progress](https://github.com/powerhouse-inc/recipes/tree/main/batch-progress) | Demonstrates multi-document wizard creation with dependency ordering using Reactor's `executeBatch`, with per-job progress tracked through the EventBus, the reactor module's job-event stream. |
| [Cross-Document Reactor](https://github.com/powerhouse-inc/recipes/tree/main/cross-document-reactor) | Event-driven cross-document automation using `ReactorClient` subscriptions. |
| [Custom Read Model](https://github.com/powerhouse-inc/recipes/tree/main/custom-read-model) | A custom `IReadModel` implementation registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view. |
| [DB Migrate](https://github.com/powerhouse-inc/recipes/tree/main/db-migrate) | PostgreSQL database export, import, and migration scripts using [Docker](https://docs.docker.com/get-docker/). |
| [Discord Webhook Processor](https://github.com/powerhouse-inc/recipes/tree/main/discord-webhook-processor) | A Reactor `IProcessor` that posts document operations to a Discord channel via webhook. |
| [Document ACL](https://github.com/powerhouse-inc/recipes/tree/main/document-acl) | A `team-journal` document model whose writes are governed by the platform auth scope, with no authorization code in any reducer. |
| [Document Snapshot Exporter](https://github.com/powerhouse-inc/recipes/tree/main/document-snapshot-exporter) | CLI tool that exports document state and operation history to JSON files, demonstrating read-after-write consistency using the Reactor API. |
| [Document Versioning](https://github.com/powerhouse-inc/recipes/tree/main/document-versioning) | Evolve a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure `upgradeReducer`, so documents created under the old schema keep loading and replaying correctly. |
| [Drive Override](https://github.com/powerhouse-inc/recipes/tree/main/drive-override) | A custom container document that tracks its children via the `ADD_RELATIONSHIP` system action of the reactor (the Powerhouse runtime that stores documents and executes their actions) instead of the `document-drive` model's `ADD_FILE`. |
| [External Feed Ingest](https://github.com/powerhouse-inc/recipes/tree/main/external-feed-ingest) | A polling worker that pulls an off-platform feed into event-sourced documents **idempotently**. |
| [Full-Text Search Processor](https://github.com/powerhouse-inc/recipes/tree/main/full-text-search) | A Reactor `IProcessor` that indexes document state into a PostgreSQL full-text search table, enabling ranked keyword search across all documents managed by a Reactor instance. |
| [Group Principals](https://github.com/powerhouse-inc/recipes/tree/main/group-principals) | Who may approve an expense is a question a **roster document** answers. |
| [Inbound Webhook Bridge](https://github.com/powerhouse-inc/recipes/tree/main/inbound-webhook-bridge) | Receive external webhooks (Stripe-style), verify the signature **server-side against the raw request bytes**, and map verified events onto document actions. |
| [Positional Delete](https://github.com/powerhouse-inc/recipes/tree/main/positional-delete) | Deletion as a **position in the merged operation order**, not a document-wide tombstone. |
| [Rate Limiter](https://github.com/powerhouse-inc/recipes/tree/main/rate-limiter) | A Reactor `IProcessor` paired with an `AuthService` gate to throttle users by signer address. |
| [Relational DB Subgraph](https://github.com/powerhouse-inc/recipes/tree/main/relational-db-subgraph) | A relational DB processor that catalogs every document it sees, with Kysely migrations, a typed query layer, and a GraphQL subgraph over the result. |
| [Revocation Race](https://github.com/powerhouse-inc/recipes/tree/main/revocation-race) | Convergent authorization across reactors. |
| [Role-Based Auth](https://github.com/powerhouse-inc/recipes/tree/main/role-based-auth) | A custom document model where the creator is promoted to admin on first action, admins can grant or revoke admin and member roles, and a domain action (`writeNote`) is gated on member-or-higher. |
| [Saga](https://github.com/powerhouse-inc/recipes/tree/main/saga) | Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context. |
| [Scoped Reads](https://github.com/powerhouse-inc/recipes/tree/main/scoped-reads) | The same policy that refuses a write decides what a read returns. |
| [Semantic Search Processor](https://github.com/powerhouse-inc/recipes/tree/main/semantic-search) | A Reactor `IProcessor` that embeds document content with an in-process model (Transformers.js) into PGlite's `vector` extension and answers cosine-similarity queries. |
| [Signed Operations Verifier](https://github.com/powerhouse-inc/recipes/tree/main/signed-operations-verifier) | A standalone script that signs a document operation history with `RenownCryptoSigner`, then verifies each operation with the checks a reactor runs when it stores a write. |
| [Subscription CLI](https://github.com/powerhouse-inc/recipes/tree/main/subscription-cli) | A standalone CLI for monitoring Powerhouse Reactor GraphQL subscriptions over WebSocket in real time. |
| [Sync Health Monitor](https://github.com/powerhouse-inc/recipes/tree/main/sync-health-monitor) | Subscribes to `SyncEventTypes` on the Reactor EventBus and maintains a live health dashboard. |

> See the [recipes repository](https://github.com/powerhouse-inc/recipes) for full source code, setup instructions, and prerequisites.

<details id="recipe-analytics-processor">
<summary><strong>Analytics Processor</strong> — A [Reactor](https://github.com/powerhouse-inc) processor that projects expense-report line items into the Powerhouse analytics engine (a dimensional time-series store) and a query layer that reads aggregations back out.</summary>

### Analytics Processor

A [Reactor](https://github.com/powerhouse-inc) processor that projects
expense-report line items into the Powerhouse analytics engine (a dimensional
time-series store) and a query layer that reads aggregations back out.
Everything runs in-process (the store is backed by PGlite, an embedded
PostgreSQL), so the demo needs no external services.

#### What it demonstrates

- Implementing `IProcessor` (from `@powerhousedao/reactor`) as
  `ExpenseAnalyticsProcessor` in `src/processor.ts`, whose constructor
  receives an `IAnalyticsStore`, registered through a `ProcessorFactory` with
  a document-type filter.
- Mapping `ADD_LINE_ITEM` / `UPDATE_LINE_ITEM` / `DELETE_LINE_ITEM` operations
  into append-only series values: updates and deletes write **compensating
  entries** (−old, +new) instead of mutating history.
- Querying with `AnalyticsQueryEngine` (`src/query.ts`): totals per
  category, monthly aggregation, and a category × currency breakdown.

#### When to use the analytics engine vs a SQL read model

|  | analytics-processor (this recipe) | custom-read-model | relational-db-subgraph |
|---|---|---|---|
| Storage model | Dimensional time-series | In-memory map | Relational rows (Kysely schema) |
| Query style | Time-bucketed aggregates over dimensions | Direct lookup | Arbitrary SQL: joins, filters, ordering |
| Best for | "Total per category per month in USD" | Simple derived counts | Searchable catalogs, tag filters |

Use the analytics engine when queries are shaped like *aggregate metric X,
grouped by dimension Y, over period Z, rolled up to depth N*.

#### The series model

- **Source**: an `AnalyticsPath` identifying who owns a set of series, one per
  document (`ph/expenses/<documentId>`). A processor with
  `startFrom: "beginning"` can be re-delivered the whole history, so a second
  index-0 operation means replay: `clearSeriesBySource(source, true)` wipes
  that document's series, and the rebuild reaches the same totals.
- **Dimensions**: named `AnalyticsPath`s attached to every value (`category`,
  `currency`). `categoryPathFor` slugifies user data: `Headcount/Salaries`
  becomes `ph/expenses/category/headcount/salaries`.
- **Metric + unit**: the metric is a plain string (`"Expenses"`) and the unit
  carries the currency code. One series per currency, so the engine never sums
  across units.
- **Business time vs event time**: values are dated by the line item's
  `date` field, not the operation timestamp or processing time. A March
  correction to a January expense still lands in January.

#### Querying

Queries `select` on dimension path prefixes and group by paths truncated at
query time by `lod` (level of detail): `lod: { category: 4 }` collapses
`ph/expenses/category/headcount/salaries` into
`ph/expenses/category/headcount`, and every key in `select` needs a `lod`
entry. Every query in `src/query.ts` also passes an explicit window. The
engine can derive a missing start/end from the data, but the derivation
breaks down when every value lands on a single date.

#### Running the demo

After `pnpm install` and `pnpm build` at the repo root:

```sh
pnpm start
```

`src/demo.ts` boots a reactor, creates three expense reports, dispatches nine
adds, one amount correction, and one delete, waits on
`reactorModule.processorManagerConsistencyTracker.waitFor` (no sleeps), then
prints three aggregation tables.

#### Tests

```sh
pnpm test
```

`src/processor.test.ts` runs the processor against a real PGlite-backed
store.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/analytics-processor)
</details>

<details id="recipe-anonymous-subscriptions">
<summary><strong>Anonymous Subscriptions</strong> — A WebSocket client that carries no `authorization` in its `connectionParams` connects to an auth-enabled Switchboard, receives `connection_ack`, and stays connected.</summary>

### Anonymous Subscriptions

A WebSocket client that carries no `authorization` in its `connectionParams`
connects to an auth-enabled Switchboard, receives `connection_ack`, and stays
connected. Each admitted subscription authorizes per document, inside the
`withFilter` predicates of `documentChanges` and `jobChanges`. Refusing an
anonymous caller belongs to `REQUIRE_AUTHENTICATED_CALLER`, and that refusal
closes `4403`, which graphql-ws retries.

#### What it demonstrates

- **A tokenless connection is admitted**: against `AUTH_ENABLED=true` the
  anonymous socket reports `connects=1` and `closes=[]`.
- **A document the caller may not read arrives as nothing**: the admin socket
  receives `["readable-one","withheld-one"]` while the anonymous socket
  receives `["readable-one"]`, with no error, no `complete`, and no close.
- **The feed survives the withheld event**: the next write to the readable
  document still arrives, leaving the anonymous socket at
  `["readable-one","readable-two"]`.
- **`REQUIRE_AUTHENTICATED_CALLER=true` closes 4403**: the client retries
  through three `4403 authentication-required` closes, and the fourth attempt
  carries a bearer, connects, and receives `["after-sign-in"]`.
- **A bearer that is present and unusable is refused**: `Bearer
  not-a-credential` closes `4403 bearer-rejected` on the server that admits
  anonymous callers.
- **The reason, not the code, says which refusal it was**: both refusals close
  `4403`, and only the reason distinguishes "sign in and this will work" from
  "the bearer you sent is not usable".
- **A Switchboard without the fix acks and then closes 4500**: the same
  tokenless client records
  `{"code":4500,"reason":"Missing authorization in connection parameters"}` and
  gives up on that first close.

#### Why 4403 and not 4401

graphql-ws keeps one list of close codes after which the client never
reconnects. `shouldRetryConnectOrThrow` in `graphql-ws/dist/client.js` reads:

```js
CloseCode.InternalServerError,   // 4500
CloseCode.InternalClientError,
CloseCode.BadRequest,
CloseCode.BadResponse,
CloseCode.Unauthorized,          // 4401
// CloseCode.Forbidden, might grant access out after retry
CloseCode.SubprotocolNotAcceptable,
CloseCode.SubscriberAlreadyExists,
CloseCode.TooManyInitialisationRequests
```

A code in that list is thrown to the caller before `retryAttempts` is even
read. `4401` sits there beside `4500`, so closing `4401` would leave the socket
as dead as closing `4500` does. `4403` is commented out of the list, so
`retryAttempts` governs it.

Because both refusals share that one code, the reason carries what the code
cannot. `reactor-api` exports the two it closes with,
`WS_CLOSE_REASON_AUTHENTICATION_REQUIRED` (`authentication-required`) and
`WS_CLOSE_REASON_BEARER_REJECTED` (`bearer-rejected`), and `reactor-browser`
matches the same set in `isAuthRefusalClose`. A close reason caps at 123 UTF-8
bytes, which is why they are slugs and not sentences. This recipe drives
graphql-ws directly, so it retries on its own `retryAttempts`; the platform
client instead declines to retry an auth refusal and reopens the socket when
the credentials change, since repeating the same ones cannot change the
answer.

Before the fix, `authenticateWebSocketConnection` threw for a missing
`authorization`, and graphql-ws ran that function as its `context` option, once
per operation. So the handshake acked and the first `subscribe` threw.
graphql-ws treats a throw from `context` as a server fault, closes `4500`, and
forwards the throw's message as the close reason. That is where the pre-fix
reason `Missing authorization in connection parameters` comes from. Signing in
did not revive such a feed, and only a page reload did.

#### What silence means to a subscriber

Scenario 2 protects one of two documents with `setDocumentProtection`, then
renames both. The anonymous subscriber sees the rename of the unprotected
document and receives nothing for the protected one. Reading that same
protected document over HTTP answers `Forbidden: insufficient permissions to
read this document`. A subscriber therefore cannot tell a document that did not
change from a document it may not read. SSE at `/graphql/stream` answers the
same way, because both transports run the same `withFilter` predicate.

The delivering socket in that scenario carries an admin's bearer, and
`isSupremeAdmin` short-circuits the per-document check for that address. A
bearer naming a non-admin address with no grant on the protected document would
meet the same silence the anonymous socket meets.

`DOCUMENT_PERMISSIONS_ENABLED=true` is what makes this scenario per document.
`AUTH_ENABLED=true` on its own selects `ADMIN_ONLY`, whose `canRead` answers
`isSupremeAdmin` for every document, so the anonymous socket would then receive
nothing at all. The `setDocumentProtection` mutation also exists only under
document permissions.

`DEFAULT_PROTECTION=false` is what leaves the first document readable by
everyone. Set it to `true` and the anonymous socket receives `[]`, still with
no error and no close.

#### Running it

Switchboard writes a `.ph` directory into the working directory, so start each
server from its own empty directory. The published package needs no checkout.

The server the first two scenarios use, on port 4101:

```sh
PH_PGLITE_IN_MEMORY=1 \
PH_SWITCHBOARD_PORT=4101 \
AUTH_ENABLED=true \
DOCUMENT_PERMISSIONS_ENABLED=true \
DEFAULT_PROTECTION=false \
ADMINS=0xa11ce00000000000000000000000000000000001 \
SKIP_CREDENTIAL_VERIFICATION=true \
ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION=true \
npx @powerhousedao/switchboard@6.2.3-dev.25
```

The server scenario 3 uses, on port 4102, which adds one variable:

```sh
PH_PGLITE_IN_MEMORY=1 \
PH_SWITCHBOARD_PORT=4102 \
AUTH_ENABLED=true \
DOCUMENT_PERMISSIONS_ENABLED=true \
DEFAULT_PROTECTION=false \
REQUIRE_AUTHENTICATED_CALLER=true \
ADMINS=0xa11ce00000000000000000000000000000000001 \
SKIP_CREDENTIAL_VERIFICATION=true \
ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION=true \
npx @powerhousedao/switchboard@6.2.3-dev.25
```

`ADMINS` must equal `ADMIN_ADDRESS` in `src/config.ts`. The demo mints its own
did:key credential for that address, which `SKIP_CREDENTIAL_VERIFICATION` and
`ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION` together let through. Minting is
the only thing `@renown/sdk` is used for here.

Then run the demo:

```sh
pnpm install
pnpm --filter @powerhousedao/example-anonymous-subscriptions start
```

Scenario 0 needs a third Switchboard that lacks the fix, started with the port
4101 environment and `PH_SWITCHBOARD_PORT=4103`. Any release through
`6.2.3-dev.3` shows the old behaviour, so run
`npx @powerhousedao/switchboard@6.2.3-dev.3` there. Point the demo at it:

```sh
pnpm --filter @powerhousedao/example-anonymous-subscriptions start -- \
  --pre-fix-ws ws://localhost:4103/graphql/subscriptions
```

The server logs its own side of each refusal. Port 4102 writes `Refusing
anonymous WebSocket connection: an authenticated caller is required`, and port
4101 writes `Refusing WebSocket connection: Token verification failed` for the
unusable bearer.

#### Example output

```
0. The same anonymous subscription against a Switchboard without the fix
  pre-fix  : connected (ack received)
  pre-fix  : socket closed 4500 Missing authorization in connection parameters
  pre-fix  : gave up: {"code":4500,"reason":"Missing authorization in connection parameters"}
1. An anonymous subscription against an auth-enabled Switchboard
  anonymous: connected (ack received)
   connects=1 closes=[] abandoned=no
2. What the anonymous caller receives, per document
   anonymous received: ["readable-one"]
   admin received:     ["readable-one","withheld-one"]
   anonymous errors=[] closes=[]
   after a second write, anonymous: ["readable-one","readable-two"]
   the same document over HTTP: Forbidden: insufficient permissions to read this document
3. REQUIRE_AUTHENTICATED_CALLER=true, then a sign-in on the live client
  signing-in: socket closed 4403 authentication-required
  signing-in: socket closed 4403 authentication-required
  signing-in: socket closed 4403 authentication-required
   attempt 4 carries the bearer
  signing-in: connected (ack received)
   received after signing in: ["after-sign-in"]
   abandoned: no
4. A bearer that is present and unusable
  bad-bearer: socket closed 4403 bearer-rejected
  bad-bearer: socket closed 4403 bearer-rejected
  bad-bearer: socket closed 4403 bearer-rejected
  bad-bearer: gave up: {"code":4403,"reason":"bearer-rejected"}
   abandoned: {"code":4403,"reason":"bearer-rejected"}
```

Scenario 4 sets `retryAttempts: 2`, so three closes are recorded: the first
connect and two retries. Scenario 3's closes carry the same `4403`, and the
reason is what separates them: `authentication-required` is answered by signing
in, which attempt 4 does, while `bearer-rejected` is answered by nothing the
client can retry.

#### Version requirement

Scenarios 1 through 4 need Switchboard `6.2.3-dev.4` or newer. That release
carries both commits this recipe reads: `bb20f8945`, "fix(reactor-api): answer
a tokenless websocket as the http path does", and `f773b8e671`, "fix: say why a
websocket auth refusal closed, and retry on that answer", which replaced
graphql-ws's own `Forbidden` close reason with the two named ones. The output
above was recorded against `6.2.3-dev.25`, the current `dev` tag.

Every release through `6.2.3-dev.3` acks a tokenless connection and then closes
`4500 Missing authorization in connection parameters` on the first `subscribe`,
and the client abandons the socket. Scenario 0 needs one of those.

The repo catalog pins `6.2.3-dev.25`, which this recipe uses only for
`@renown/sdk` to mint a bearer. The Switchboard it runs against is a separate
install, so the two do not have to match.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/anonymous-subscriptions)
</details>

<details id="recipe-audit-trail">
<summary><strong>Audit Trail</strong> — A [Powerhouse Reactor](https://github.com/powerhouse-inc) processor that inspects `ActionSigner` context on every operation to build an immutable audit log in PostgreSQL.</summary>

### Audit Trail

A [Powerhouse Reactor](https://github.com/powerhouse-inc) processor that inspects `ActionSigner` context on every operation to build an immutable audit log in PostgreSQL. Exposes a GraphQL subgraph for querying entries by user, document, or time range.

#### What it demonstrates

- `getSignerContext` reads `user.address`, `user.networkId`, `user.chainId`, and the app's `name` and `key` out of `operation.action.context.signer`. Operations that arrive without a signer are skipped.
- `AuditTrailProcessor.onOperations` turns a batch of operations into rows and writes them to `audit_log` with a single Kysely insert.
- Resolvers built by `createAuditSchema` serve the audit log over graphql-yoga.
- A row carries `documentId` and `documentType` from the operation context, with `action.type` and `timestampUtcMs` from the action itself.

#### Usage

##### Processor

```ts
import { Kysely, PostgresDialect } from "kysely";
import { up, AuditTrailProcessor, createAuditTrailFactory } from "@powerhousedao/example-audit-trail";

const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
await up(db);

await processorManager.registerFactory(
  "audit-trail",
  createAuditTrailFactory({
    db,
    filter: { branch: ["main"] },
  }),
);
```

##### GraphQL subgraph

```ts
import { startAuditServer } from "@powerhousedao/example-audit-trail";

const server = startAuditServer(db, 4002);
```

Query examples:

```graphql
# By user
{ auditByUser(address: "0xabc", limit: 10) { actionType documentId timestamp } }

# By document
{ auditByDocument(documentId: "doc-1", limit: 10) { signerAddress actionType timestamp } }

# By time range
{ auditByTimeRange(from: "2025-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z") { signerAddress actionType documentId } }
```

#### Running it

```sh
pnpm install
pnpm build
pnpm test
pnpm start
```

`pnpm start` runs `src/demo.ts`, which signs its operations with a Renown key, creates a drive and three documents, then prints the audit rows for that signer.

Tests and the demo use [PGlite](https://github.com/electric-sql/pglite) for an in-memory PostgreSQL instance.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/audit-trail)
</details>

<details id="recipe-auth-preflight">
<summary><strong>Auth Preflight</strong> — Every other auth recipe here shows the reactor refusing a write **after** it arrives, as a failed job or a stored `deniedReason`.</summary>

### Auth Preflight

Every other auth recipe here shows the reactor refusing a write **after** it
arrives, as a failed job or a stored `deniedReason`. This recipe asks first.
`evaluateActions` answers what the reactor *would* decide about a batch of
candidate operations, without submitting any of them, so a UI can disable a
control rather than offer one that fails.

#### What it demonstrates

The batch is predicted first, then every candidate is actually executed, and the
verdicts are compared one for one. Prediction and submit decide through the
reactor's own decision model, at the same stream heads. A refusal carries
the consensus string the reactor would have recorded
(`no grant permits this operation`). `anyAllowed` and `allAllowed` answer what a
toolbar and a form each ask, and every aggregate is false over an empty batch.

The manager and the clerk each submit through a `ReactorClient` that signs with
their own `RenownCryptoSigner` key (`buildSignedReactor` in `src/signers.ts`). The
submit is judged as the signature's `signer.user.address`, and the preflight asks
as the same `{ address }`. Under `authEnforcement` the reactor also needs a trust
policy that accepts each key for its address (`trustPolicyFor`).

#### The policy

This recipe picks up where [`document-acl`](https://github.com/powerhouse-inc/recipes/blob/main/document-acl) leaves off, with the
policy ordinary state in the document's `auth` scope. Two roles over one expense
report: the manager is unrestricted in the `global` scope, and the clerk may
submit, but only below the approval threshold. That limit is a condition on the
action's own input, not a rule in the reducer:

```ts
{
  id: "g-clerk-small",
  effect: "allow",
  principal: { address: CLERK },
  capability: { can: "execute", scope: "global", operation: ["SUBMIT_EXPENSE"] },
  where: { lt: [{ attr: "action.input.amountCents" }, { lit: 50_000 }] },
}
```

This recipe is the first in the repo to turn on `authConditions`, which is what
makes a `where` clause apply at all. Below that flag a conditional grant never
matches, so it fails closed, and the preflight fails closed with it. Because the
grant reads `action.input.amountCents`, the prediction follows the amount the
form currently holds, and denies until one is typed.

#### A prediction, not a promise

An allow is obtained, the grant behind it is revoked, and the very same submit is
refused. The submit path stays the only authority. A reactor without
`authEnforcement` holds no decision model and throws
`AuthEnforcementDisabledError`. A caller reads that error as "cannot know" and
leaves its controls alone, never as a refusal that would grey out every button
wherever enforcement is off.

#### What it does not cover

The preflight is not the legacy host-side permission tables, which refuse with
`Forbidden: insufficient permissions` rather than with a verdict. It has two other
transports, neither exercisable from a Node recipe: `useCanExecute` in
`@powerhousedao/reactor-browser` wraps it for React, and the reactor subgraph
serves it as an `evaluateActions` GraphQL query through
`createReactorGraphQLClient`.

#### Running it

`evaluateActions` ships in `6.2.2-dev.62`, below the `6.2.3-dev.25` this
repo's catalog pins, so the recipe runs standalone:

```sh
pnpm install
pnpm test    # vitest: agreement, aggregates, conditions, routing, staleness
pnpm start   # narrated walkthrough in five acts
```

`src/demo.ts` prints predicted against actual for every candidate, then plays the
staleness and flags-off acts. `tests/auth-preflight.test.ts` holds one test per
claim in this README.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/auth-preflight)
</details>

<details id="recipe-batch-progress">
<summary><strong>Batch Progress</strong> — Demonstrates multi-document wizard creation with dependency ordering using Reactor's `executeBatch`, with per-job progress tracked through the EventBus, the reactor module's job-event stream.</summary>

### Batch Progress

Demonstrates multi-document wizard creation with dependency ordering using Reactor's `executeBatch`, with per-job progress tracked through the EventBus, the reactor module's job-event stream.

#### What it shows

A "Create Project" flow that creates 4 documents in one `executeBatch` call, in dependency order:

```
budget ──┐
          ├──► project ──► drive (add files)
scope  ──┘
```

Budget and scope have no dependencies, so they create in parallel. Project waits for both, and drive adds all three as files once project completes.

##### Without Reactor

```ts
const budget = await createDocument(budgetId, initBudget);
const scope = await createDocument(scopeId, initScope);
// hope nothing interleaves...
const project = await createDocument(projectId, initProject);
await addFilesToDrive(driveId, [budget, scope, project]);
```

Four sequential calls, manual error handling, and nothing keeping other writes from interleaving.

##### With Reactor

```ts
await client.executeBatch({
  jobs: [
    { key: "budget",  documentId: budgetId,  actions: [initBudget],  dependsOn: [] },
    { key: "scope",   documentId: scopeId,   actions: [initScope],   dependsOn: [] },
    { key: "project", documentId: projectId, actions: [initProject], dependsOn: ["budget", "scope"] },
    { key: "drive",   documentId: driveId,   actions: [addFiles],    dependsOn: ["project"] },
  ],
});
```

One call. `executeBatch` sorts the jobs topologically and turns each `dependsOn` key into a `queueHint`, so a job dequeues only once the jobs it names have resolved. There is no rollback: a job that fails ends at `FAILED`, and whatever earlier jobs wrote stays written.

#### How it works

1. Spins up an in-memory Reactor with `ReactorBuilder`: PGlite, an in-process Postgres, no external DB. It is wrapped in a `ReactorClient` built with `withSigner` and a `RenownCryptoSigner` key, because a reactor that verifies signatures refuses unsigned writes.
2. Creates a drive document to hold the project files, signed with `reactor.create(driveDoc, signer)`, then submits the 4 jobs built by `buildCreateProjectBatch` via `IReactorClient.executeBatch`, which signs every action for the document it lands in. The three project documents are created by `createDocumentAction` under ids chosen up front, so they are legacy documents: a v2-required document derives its id from its header.
3. Subscribes on the EventBus to the five `JOB_*` events for status updates.
4. Renders a multi-bar terminal display showing each job's status. Recorded events replay with a short delay, since they fire while `executeBatch` runs.

#### Job status lifecycle

```
PENDING → RUNNING → WRITE_READY → READ_READY
                                 ↘ FAILED
```

| Status | Meaning |
|--------|---------|
| `WRITE_READY` | Operations written to the operation store |
| `READ_READY` | Read models have finished indexing (terminal) |
| `FAILED` | Job failed (terminal) |

#### Usage

```sh
pnpm install
pnpm start
```

##### Example output

```
Multi-Document Wizard — Create Project
═══════════════════════════════════════

Creating drive...
Drive created: abc123

  budget  |████████████████████████████████████████| READ_READY
  scope   |████████████████████████████████████████| READ_READY
  project |████████████████████████████████████████| READ_READY
  drive   |████████████████████████████████████████| READ_READY

✓ Done in 0.42s — 4 jobs completed, 0 failed
  Budget:  def456
  Scope:   ghi789
  Project: jkl012
  Drive:   abc123
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/batch-progress)
</details>

<details id="recipe-cross-document-reactor">
<summary><strong>Cross-Document Reactor</strong> — Event-driven cross-document automation using `ReactorClient` subscriptions.</summary>

### Cross-Document Reactor

Event-driven cross-document automation using `ReactorClient` subscriptions.

#### What it demonstrates

A subscription callback can write. The handler passed to `reactorClient.subscribe()` acts on a document other than the one that changed: it calls the same client's `find()` and `rename()` in `src/index.ts`. The rule lives in that callback rather than in a processor, and [saga](https://github.com/powerhouse-inc/recipes/blob/main/saga) shows the processor version of the same pattern.

#### How it works

1. Creates a drive, the container document the others live under, holding an **invoice** and a **task** linked by naming convention (`Invoice-001` ↔ `Task-001-Invoice-001`)
2. Subscribes to all document changes with an empty search filter (`{}`)
3. When the invoice is renamed to include `[PAID]`, the subscription handler finds the related task and renames it to include `[CLOSED]`
4. The handler ignores every event type except `DocumentChangeType.Updated`, and a `reacting` flag keeps it from re-entering while its own rename is in flight

#### Running

```sh
pnpm install
pnpm --filter @powerhousedao/cross-document-reactor start
```

#### Expected output

```
Cross-Document Reactor
══════════════════════

Starting reactor... done (X.Xs)

Creating drive... <drive-id>
Creating invoice document... <invoice-id>
Creating task document... <task-id>

Documents named: "Invoice-001" ↔ "Task-001-Invoice-001"

─── Triggering workflow: marking Invoice-001 as [PAID] ───

  [HH:MM:SS.mmm] updated → Invoice-001 [PAID]
  [HH:MM:SS.mmm] ⚡ Rule triggered: "Invoice-001 [PAID]" is paid
  [HH:MM:SS.mmm]    Looking for task: "Task-001-Invoice-001"...
  [HH:MM:SS.mmm]    Found task <task-id>, closing it...
  [HH:MM:SS.mmm] updated → Task-001-Invoice-001 [CLOSED]

─── Final document state ───

  Invoice: "Invoice-001 [PAID]"
  Task:    "Task-001-Invoice-001 [CLOSED]"

✓ Cross-document reaction succeeded
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/cross-document-reactor)
</details>

<details id="recipe-custom-read-model">
<summary><strong>Custom Read Model</strong> — A custom `IReadModel` implementation registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view.</summary>

### Custom Read Model

A custom `IReadModel` implementation registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view. Demonstrates the read model lifecycle, the pre-ready guarantee (counts are current before `JOB_READ_READY` fires), and how read models differ from processors.

#### How it works

`DocumentCountReadModel` implements `IReadModel` directly. It receives every operation written to the reactor's operation store via `indexOperations()` and increments an in-memory counter keyed by `context.documentType`.

```
Operation written → JOB_WRITE_READY → ReadModelCoordinator
                                        ├── preReady:  DocumentCountReadModel.indexOperations() ← our read model
                                        ├── preReady:  DocumentView, DocumentIndexer (built-in)
                                        ├── emit JOB_READ_READY  ← counts are already up to date here
                                        └── postReady: processors, subscriptions
```

##### Read model vs processor

| | Read Model (IReadModel) | Processor (IProcessor) |
|--|--|--|
| Phase | **Pre-ready**: completes before `JOB_READ_READY` | **Post-ready**: runs after `JOB_READ_READY` |
| Purpose | Derived views that must be queryable immediately | Side-effects (webhooks, notifications, sync) |
| Registration | `ReactorBuilder.withReadModel()` | `ProcessorManager.registerFactory()` |
| Receives | `OperationWithContext[]` via `indexOperations()` | `OperationWithContext[]` via `onOperations()` |

##### Why implement IReadModel directly?

`BaseReadModel` tracks its progress in the `ViewState` table so it can catch up or rewind, and its constructor takes a database handle plus three reactor internals: `IOperationIndex`, `IWriteCache`, and `IConsistencyTracker`. Those are constructed inside `buildModule()`, so a subclass registers through `withReadModelFactory()` rather than `withReadModel()`. The `ViewState` tracking and those dependencies serve persistence, which an in-memory counter does not need. `IReadModel` itself requires only `name` and `indexOperations()`.

##### buildModule() internals

`ReactorBuilder.buildModule()` returns an `InProcessReactorModule`: the event bus, database, operation store, and the rest of the reactor's dependency graph. `src/index.ts` destructures `eventBus` from it and subscribes to `JOB_READ_READY` directly.

#### Architecture

| Module | Purpose |
|--------|---------|
| `src/document-count-read-model.ts` | `DocumentCountReadModel`: `indexOperations()` writes the counter, `getCounts()` and `getCount()` read it |
| `src/index.ts` | Demo: builds a reactor, creates a document, shows the read model counts inside `JOB_READ_READY` |

#### Usage

##### Run the demo

```sh
pnpm start
```

##### Use in your own code

```ts
import { ReactorBuilder } from "@powerhousedao/reactor";
import { DocumentCountReadModel } from "./src/document-count-read-model.js";

const countReadModel = new DocumentCountReadModel();

const reactorModule = await new ReactorBuilder()
  .withDocumentModelSources([/* your models */])
  .withReadModel(countReadModel)
  .buildModule();

// After any job completes, counts are already up to date:
reactorModule.eventBus.subscribe(
  ReactorEventTypes.JOB_READ_READY,
  () => {
    console.log(countReadModel.getCounts());
  },
);
```

##### Query the materialized view

```ts
// All counts
const counts: ReadonlyMap<string, number> = countReadModel.getCounts();

// Single type
const budgetOps = countReadModel.getCount("powerhouse/budget");
```

#### Tests

```sh
pnpm test
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/custom-read-model)
</details>

<details id="recipe-db-migrate">
<summary><strong>DB Migrate</strong> — PostgreSQL database export, import, and migration scripts using [Docker](https://docs.docker.com/get-docker/).</summary>

### DB Migrate

PostgreSQL database export, import, and migration scripts using [Docker](https://docs.docker.com/get-docker/). No local `pg_dump` or `pg_restore` installation required. The scripts use the `postgres:17` image, which is pulled automatically on first run.

#### Scripts

##### export.sh

Dump a PostgreSQL database to a file or stdout.

```sh
# Export to a file (custom format, default)
./export.sh -o backup.dump postgres://user:pass@localhost:5432/mydb

# Export as plain SQL
./export.sh -F plain -o backup.sql postgres://user:pass@localhost:5432/mydb

# Export to stdout (pipe to another tool)
./export.sh postgres://user:pass@localhost:5432/mydb > backup.dump
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format, -F` | Dump format: `custom` (default), `plain`, `tar`, `directory` |
| `--output, -o` | Output file path (default: stdout) |

##### import.sh

Restore a dump file into a PostgreSQL database.

```sh
# Import a custom-format dump
./import.sh postgres://user:pass@localhost:5432/mydb backup.dump

# Import a plain SQL dump
./import.sh -F plain postgres://user:pass@localhost:5432/mydb backup.sql

# Import from stdin
cat backup.dump | ./import.sh postgres://user:pass@localhost:5432/mydb -
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format, -F` | Dump format: `custom` (default), `plain`, `tar` |

For custom/tar formats, `pg_restore --clean --if-exists` is used. For plain format, `psql` is used.

##### migrate.sh

Export from one database and import into another in a single step.

```sh
# Migrate between two databases
./migrate.sh postgres://user:pass@source:5432/mydb postgres://user:pass@target:5432/mydb

# Migrate using plain SQL format
./migrate.sh -F plain postgres://user:pass@source:5432/mydb postgres://user:pass@target:5432/mydb
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format, -F` | Dump format: `custom` (default), `plain`, `tar` |

#### Running via pnpm

```sh
pnpm --filter @powerhousedao/db-migrate export -- -o backup.dump postgres://user:pass@localhost:5432/mydb
pnpm --filter @powerhousedao/db-migrate import -- postgres://user:pass@localhost:5432/mydb backup.dump
pnpm --filter @powerhousedao/db-migrate migrate -- postgres://user:pass@source:5432/mydb postgres://user:pass@target:5432/mydb
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/db-migrate)
</details>

<details id="recipe-discord-webhook-processor">
<summary><strong>Discord Webhook Processor</strong> — A Reactor `IProcessor` that posts document operations to a Discord channel via webhook.</summary>

### Discord Webhook Processor

A Reactor `IProcessor` that posts document operations to a Discord channel via webhook.

Each operation is converted into a Discord embed containing:

- Action type, document ID, document type, scope, branch, hash
- Truncated action input (max 1024 chars)
- Timestamp

Batches exceeding Discord's 10-embed limit are automatically chunked into multiple requests. Every request includes an HMAC-SHA256 signature in the `X-Reactor-Signature` header.

#### Usage

Register the processor with a Reactor `ProcessorManager`:

```ts
import { createDiscordWebhookFactory } from "@powerhousedao/example-discord-webhook-processor";

await processorManager.registerFactory(
  "discord-webhook",
  createDiscordWebhookFactory({
    webhookUrl: "https://discord.com/api/webhooks/{id}/{token}",
    secret: process.env.WEBHOOK_SECRET!,
    filter: {
      documentType: ["powerhouse/billing-statement"],
      scope: ["global"],
      branch: ["main"],
    },
  }),
);
```

#### Tests

```sh
pnpm test
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/discord-webhook-processor)
</details>

<details id="recipe-document-acl">
<summary><strong>Document ACL</strong> — A `team-journal` document model whose writes are governed by the platform auth scope, with no authorization code in any reducer.</summary>

### Document ACL

A `team-journal` document model whose writes are governed by the platform auth scope,
with no authorization code in any reducer. Policy lives in the document as
replicated state (`state.auth`), edited with `initializeAuth`, `setGrant`, `moveGrant`,
and `removeGrant`, and enforced at admission when the `authEnforcement` feature flag is
on. [`role-based-auth`](https://github.com/powerhouse-inc/recipes/blob/main/role-based-auth) reaches the same outcome with the rules
baked into its reducers.

#### What it demonstrates

An uninitialized policy (`state.auth.version === 0`) leaves the document open, and
`initializeAuth` flips the default to deny. A write that no grant covers fails the job
`executeAsync` returns, with `AuthorizationDeniedError`. Nothing is stored and the
reducer never runs.

The reducers (`document-models/team-journal/v1/src/reducers/journal.ts`) throw
`DuplicateEntry` and `EntryNotFound` for domain invariants, and read the signer only
for an entry's `author`.

#### Signed writes

Alice and Bob each hold their own `RenownCryptoSigner` key (`createSigner` in
`src/signers.ts`). `buildSignedReactor` gives each of them a `ReactorClient` built
with `withSigner`, and every step writes through the caller's client, which signs the
action for the document it writes to. The grant stack is evaluated against the
signature's `signer.user.address`. `buildSignedReactor` also gives the reactor a
trust policy (`trustPolicyFor`) that says which key may sign as which address: under
`authEnforcement`, a reactor with no trust policy refuses every signed write but its
own.

#### The policy the demo installs

| id | effect | principal | capability |
|---|---|---|---|
| `g-alice-admin` | allow | Alice | `execute` on scope `auth` |
| `g-alice-all` | allow | Alice | `execute` on scope `*` |
| `g-anyone-add` | allow | anyone | `execute` `ADD_ENTRY` on scope `global` |

Evaluation is **default deny, last applicable grant wins**. `SET_GRANT` is judged
against scope `auth`, which only Alice holds, so Bob's is refused. The demo appends
`g-deny-bob` (deny Bob `ADD_ENTRY`) after those three and his next entry fails.
`moveGrant` sends that deny to index 0, `g-anyone-add` is last again, and Bob is back.

#### The feature flags

```ts
const reactor = await new ReactorBuilder()
  .withDocumentModelSources([TeamJournal, documentModelDocumentModelModule])
  .withExecutorConfig({
    featureFlags: {
      documentDecisions: true, // decision model replaces the meta-cache gate
      authEnforcement: true,   // auth projection; requires documentDecisions
    },
  })
  .build();
```

The flags govern **enforcement only**. The auth data model is always live, so a policy
written on a flags-on reactor is silently unenforced on a flags-off one, where
`selectDecisionModel` leaves the auth scope out of every append condition. Flip the
flags per fleet of reactors that sync the same documents, never per node. Asking for
`authEnforcement` without `documentDecisions` throws at build time.

#### Gotchas worth knowing

- **One scope per `execute`**: actions in one `reactor.execute` call must share a
  scope, so policy changes (`scope: "auth"`) can't be batched with domain actions
  (`scope: "global"`).
- **The auth stream is strictly timestamp-monotonic**: two policy edits in the same
  millisecond are refused (`AuthTimestampNotMonotonicError`), so the demo and tests
  space auth writes by a few milliseconds.
- **Unsigned documents have no creator carve-out**: without a signing key, the initial
  policy must include a reachable `execute` grant on scope `auth`, or the platform
  reducer refuses `initializeAuth`. Reachable means not shadowed by a later deny.

#### Non-goals here

Grants with a `{group: ...}` or `{match: ...}` principal, or a `where` condition, parse
and store but **never match** without the `authGroups` / `authConditions` flags. The
evaluator skips them silently: check the flags before concluding enforcement is
broken. [`group-principals`](https://github.com/powerhouse-inc/recipes/blob/main/group-principals) covers group grants.

#### Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

#### Tests

```sh
pnpm test
```

`tests/enforcement.test.ts` runs these behaviors on a flags-on reactor, plus the
self-lockout guardrail, surfaced as `operation.error`, not a failed job.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/document-acl)
</details>

<details id="recipe-document-snapshot-exporter">
<summary><strong>Document Snapshot Exporter</strong> — CLI tool that exports document state and operation history to JSON files, demonstrating read-after-write consistency using the Reactor API.</summary>

### Document Snapshot Exporter

CLI tool that exports document state and operation history to JSON files, demonstrating read-after-write consistency using the Reactor API.

#### What it demonstrates

`IReactor` is the low-level interface: every mutation returns a `JobInfo` rather than the
document. `exportWithReactor` awaits the job with `JobAwaiter` and takes the
`consistencyToken` off the completed job. Passing that token to `reactor.get()` and
`reactor.getOperations()` guarantees the read reflects the write, even while background
indexing is still catching up.

`OperationFilter` narrows what comes back, by action type (`actionTypes`), timestamp range
(`timestampFrom`, `timestampTo`), or revision (`sinceRevision`). The exporter passes an empty
filter in `src/export-reactor.ts`.

##### IReactor vs IReactorClient

| | IReactor | IReactorClient |
|---|---|---|
| Mutations return | `JobInfo` (must await manually) | The document (job awaited internally) |
| Consistency | You pass `ConsistencyToken` to reads | Managed automatically |
| Signing | Manual: `create()` takes an `ISigner`, and `execute()` takes actions signed with `ISigner.signAction(action, { documentId, branch })` | Automatic, from `ReactorClientBuilder.withSigner()` |
| `getOperations()` returns | `Record<string, PagedResults>` keyed by scope | `PagedResults` (flat) |
| Use when | You need fine-grained control over job lifecycle | You do not need access to `JobInfo` or consistency tokens |

`ISigner` is the action-signing interface exported by `@powerhousedao/shared/document-model`.
Both modes sign with the same `RenownCryptoSigner` key, because a reactor that verifies
signatures refuses an unsigned write. `sign()` in `src/export-reactor.ts` attaches the
tuple to the action as `context.signer`.
A scope is one named slice of a document's state. `reactor.getOperations()` keys its result
by scope name (`global` and `document` in these exports), and `exportWithReactor` flattens
that map into one array, tagging each operation with its `scope`.

#### Usage

```sh
pnpm install
pnpm start
```

##### Options

```
--mode <reactor|client>   API mode (default: reactor)
--out <path>              Output directory (default: ./output)
```

##### Examples

```sh
# Export using low-level IReactor with explicit consistency tokens
pnpm start

# Export using high-level IReactorClient
pnpm start -- --mode client

# Custom output directory
pnpm start -- --out ./snapshots

# Compare both modes
pnpm start -- --out ./out-reactor
pnpm start -- --mode client --out ./out-client
```

#### Output

Each document is written as a JSON file named `<document-id>.json`:

```json
{
  "header": { "id": "...", "documentType": "...", ... },
  "state": { ... },
  "operations": [ ... ],
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "mode": "reactor"
}
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/document-snapshot-exporter)
</details>

<details id="recipe-document-versioning">
<summary><strong>Document Versioning</strong> — Evolve a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure `upgradeReducer`, so documents created under the old schema keep loading and replaying correctly.</summary>

### Document Versioning

Evolve a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure
`upgradeReducer`, so documents created under the old schema keep loading and replaying
correctly.

#### What it demonstrates

[`document-models/todo/todo.json`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/todo/todo.json) carries one
`specifications` entry per version, and `pnpm generate` (the Powerhouse CLI's
`ph-cli generate`) emits the whole `v1/`, `v2/`, and `upgrades/` tree. That tree includes a
wired-up `UpgradeManifest` (`{ documentType, latestVersion, supportedVersions, upgrades }`)
and a stub `UpgradeTransition` (`{ toVersion, upgradeReducer, description }`) at
[`upgrades/v2.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/todo/upgrades/v2.ts). The migration body is the one
piece you hand-write.

#### State shape evolution

```ts
// v1
type TodoItemV1 = { id: string; title: string; checked: boolean };

// v2 — a field rename plus a type change, the realistic migration case
type TodoItemV2 = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: number;
};
```

The transition in
[`document-models/todo/upgrades/v2.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/todo/upgrades/v2.ts)
maps `checked: true → status: "DONE"`, `checked: false → status: "TODO"`, and adds
`priority: 0`.

#### Critical pitfall: patch `state` and `initialState` together

The upgrade runs **once**, when `UPGRADE_DOCUMENT` is dispatched. Replay never re-runs it:
loading a document (`baseLoadFromInput` → `replayDocument`, distilled in
[`src/replay.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/src/replay.ts)) starts from the stored `initialState` and folds the
`global` scope's domain operations through the latest reducer. `CREATE_DOCUMENT` and the
upgrade record live in the `document` scope, which replay skips.

A transition that migrates `state` but forgets `initialState` leaves a healthy-looking
document whose seeded items, created by no operation, stay v1-shaped in `initialState`.
A rebuild no longer reproduces the stored state, and the document errors on load with a
`HashMismatchError` (`Hash mismatch on document …, scope global`). The transition here
patches both, and [`tests/versioning.test.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/tests/versioning.test.ts) includes a
deliberately broken state-only one.

#### The latest reducer owns the historical log

Replay sends the *entire* operation history through the latest reducer, including
operation types the new schema no longer defines. That is why the v2 spec retains
`CHECK_ITEM` and [`v2/src/reducers/todo.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/todo/v2/src/reducers/todo.ts)
maps the old `checked` boolean onto the new `status`.

#### Upgrade reducers must be pure

Upgrade reducers run on every peer that loads the document. No `Date.now()`, no randomness,
no I/O. They must also *return* a new document: there is no immer draft, so in-place
mutation is lost.

#### `supportedVersions` is ordered, and every hop must be covered

`supportedVersions` lists every shipped version in ascending order, and
`computeUpgradePath` composes one transition per hop: a v1 document in a package on v3 goes
v1→v2 then v2→v3, and a missing `upgrades` entry throws.

#### Production wiring

Codegen already emits the structure a real package registers: a `version` field on each
version's [`module.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/todo/v2/module.ts),
`documentModels = [TodoV1, TodoV2]` in
[`document-models/document-models.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/document-models.ts), and
`upgradeManifests = [todoUpgradeManifest]` in
[`document-models/upgrade-manifests.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/upgrade-manifests.ts). A reactor
registers both
(`new ReactorBuilder().withDocumentModelSources(documentModels).withUpgradeManifests(upgradeManifests)`)
and applies the path on `UPGRADE_DOCUMENT`. Here [`src/upgrade.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/src/upgrade.ts) runs
that same compose-transitions-then-stamp-version sequence in-process.

#### Creating a document at its model version

A v1 document must declare version 1: the manifest covers 1→2 and has no transition *into*
v1, so a document left at version 0 gives `computeUpgradePath` nowhere to start
(`Version 0 ... is not in supportedVersions [1, 2]`). The generated factory stamps it, and
initial items are seeded through `global`:

```ts
import { createTodoDocument } from "document-models/todo/v1";

createTodoDocument({ document: { version: 1 }, global: { items } });
```

#### Running

```sh
pnpm install
pnpm start
```

The demo creates a v1 document with a seeded item, upgrades it, dispatches v2 operations,
then replays the history and verifies the replay matches the live document.

#### Tests

```sh
pnpm test
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/document-versioning)
</details>

<details id="recipe-drive-override">
<summary><strong>Drive Override</strong> — A custom container document that tracks its children via the `ADD_RELATIONSHIP` system action of the reactor (the Powerhouse runtime that stores documents and executes their actions) instead of the `document-drive` model's `ADD_FILE`.</summary>

### Drive Override

A custom container document that tracks its children via the `ADD_RELATIONSHIP` system action of the reactor (the Powerhouse runtime that stores documents and executes their actions) instead of the `document-drive` model's `ADD_FILE`. The container's own state stays at O(1) regardless of how many children it owns. Children live in the reactor's `DocumentRelationship` table and are enumerated through paged, DB-native queries.

#### What it demonstrates

- `client.executeAsync(containerId, "main", [addRelationshipAction(...)])` links 10,000 child documents to the container, in batches of 100. The container model keeps no `nodes[]` array. The `ReactorClient` is built with `withSigner`, so each action is signed for the container it lands in, and every create passes the same signer to `reactor.create`. A reactor that verifies signatures refuses unsigned writes.
- Reading children back is a paged call: `documentIndexer.getOutgoing(containerId, ["contains"], { cursor, limit })`, advancing `cursor` until `nextCursor` is empty.
- The graph runs both ways. `documentIndexer.getIncoming(childId)` returns the container as a parent.

#### Why `ADD_RELATIONSHIP` scales better than `ADD_FILE`

`document-drive` keeps its child catalogue inside the drive document's `state.global.nodes[]`. Each `ADD_FILE` mutates that array: every replay walks every previously-added child, every read materialises the full state, and operation-log size grows with child count.

`ADD_RELATIONSHIP` is a system-scope action handled directly by the reactor's job executor. The source document's state and operation log are unaffected. The indexer writes one row to `DocumentRelationship` and exposes the graph via `IDocumentIndexer`. Cost is flat in the number of children.

#### State shape

```graphql
type CustomContainerState {
  name: String!
  description: String
}
```

That is the entire schema.

#### Operations

| Operation | Effect |
|---|---|
| `SET_METADATA({ name, description? })` | Sets the container's display metadata. |

Children are added by dispatching `addRelationshipAction(containerId, childId, "contains")` through `client.executeAsync()`, not through the container's own reducer.

#### GraphQL

The reactor subgraph (the GraphQL schema `@powerhousedao/reactor-api` serves in front of a running reactor) exposes the same data:

- `documentOutgoingRelationships(documentId, relationshipTypes, paging)` returns the children of a container.
- `documentIncomingRelationships(documentId, relationshipTypes, paging)` returns the parents of a child.

Both fields are paged. Use them when querying from an external client. The demo starts no server, so it only prints a note naming both fields.

#### Running

```sh
pnpm install
pnpm --filter @powerhousedao/example-drive-override start
```

The demo will:

1. Spin up an in-memory reactor, create the container, and apply `SET_METADATA`. No database to stand up.
2. Create 10,000 plain `document-model` child documents in 100 batches of 100, wiring each to the container via `ADD_RELATIONSHIP`.
3. Print the container's `state.global` keys, which should remain `["description", "name"]`.
4. Page all 10,000 children back at 500 per page, then spot-check one child's parent in reverse.

Expect total runtime in the tens of seconds to a few minutes depending on hardware, dominated by the per-job round-trip through the executor. The demo prints each batch's elapsed time and a total when the loop finishes.

#### Key files

- [`document-models/custom-container/`](https://github.com/powerhouse-inc/recipes/blob/main/drive-override/document-models/custom-container): the `powerhouse/custom-container` document model. The `SET_METADATA` reducer lives in `v1/src/reducers/metadata.ts`, and everything under `v1/gen/` is codegen output.
- [`src/index.ts`](https://github.com/powerhouse-inc/recipes/blob/main/drive-override/src/index.ts): the demo.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/drive-override)
</details>

<details id="recipe-external-feed-ingest">
<summary><strong>External Feed Ingest</strong> — A polling worker that pulls an off-platform feed into event-sourced documents **idempotently**.</summary>

### External Feed Ingest

A polling worker that pulls an off-platform feed into event-sourced documents
**idempotently**. The trigger comes from outside the reactor, the
`@powerhousedao/reactor` instance that stores the documents and applies
operations to them. A deterministic in-process mock feed replaces the chain a
production poller would page ([the brief](https://github.com/powerhouse-inc/recipes/blob/main/briefs/05-external-feed-ingest.md)
describes that poller), so the demo runs offline with no keys.

#### Where the checkpoint lives

&gt; **The document is the checkpoint store.** The dedup set and the high-watermark
&gt; live in document state, and the worker rebuilds them at startup. An
&gt; in-memory-only checkpoint re-ingests everything since the last flush when the
&gt; worker dies mid-stream. A state-seeded restart re-ingests nothing.

```
external feed ──fetchSince(watermark)──▶ FeedPoller
   (monotonic cursor,                       │  1. seedFromState(): rebuild dedup set
    redeliveries,                           │     + watermark from the document
    corrections)                            │  2. skip ids already in state
                                            │  3. map event → recordEntry / markSuperseded
                                            ▼
                                client.executeAsync → Ledger document
                                       { source, watermark, entries[] }
```

#### What it demonstrates

- **A poll loop** dispatching actions into a document through the reactor
  (`FeedPoller.pollOnce`, or `start` for the interval version, which backs off
  exponentially on errors). The poller writes through an `IReactorClient` built
  with `withSigner`, so every entry is signed: a reactor that verifies signatures
  refuses unsigned writes.
- **Corrections as explicit operations.** An upstream rewrite becomes a
  `markSuperseded` op that flips the old entry's status and appends the
  corrected value as a *new* entry. The original payload is never mutated.

#### Why `externalId` is the dedup key, not the watermark

The watermark is only a *fetch optimization* ("don't re-read the whole feed"),
**not** the dedup mechanism. Real feeds redeliver: the same `externalId` can
reappear at a *later* cursor, and a watermark filter lets it through. The
authoritative check is "have I already recorded this `externalId`?", answered
from the document state of that source.

The scripted feed (`feed.ts`) exercises each case: an out-of-order `ts`, a
redelivery of `po-002`, and a correction of `po-001`.

#### Run it

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest start
```

The demo ingests the first three events, **kills the poller** (discarding its
in-memory cache), then starts a fresh one that re-seeds from the document and
drains the rest. The demo prints the final ledger, the operation history, and
three checks: no duplicate across the restart, the correction recorded as
`MARK_SUPERSEDED` plus a new entry, and `po-001`'s payload intact.

#### The document model

The `FeedLedger` model is generated from
`document-models/feed-ledger/feed-ledger.json`. The reducer is hand-maintained
at `document-models/feed-ledger/v1/src/reducers/ingest.ts`:

- `recordEntry` appends a `RECORDED` entry stamped with the feed's `ts`, never
  local wall-clock, and advances the watermark to `max(watermark, sequence)`, so
  an out-of-order delivery can't regress it. Throws `DuplicateEntry` if the
  `externalId` is already present.
- `markSuperseded` flips an existing entry to `SUPERSEDED`, sets its
  `supersededBy`, and appends the correction as a new `RECORDED` entry,
  advancing the watermark the same way. Throws `UnknownEntry` if the target is
  missing or already superseded.

#### Tests

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest test
```

`document-models/feed-ledger/v1/tests/ingest.test.ts` covers the reducer,
`src/poller.test.ts` the poller end-to-end over a reactor.

#### Related recipes

- [`inbound-webhook-bridge`](https://github.com/powerhouse-inc/recipes/blob/main/inbound-webhook-bridge): the *push* twin. The
  feed calls you, same idempotency idea.
- [`cross-document-reactor`](https://github.com/powerhouse-inc/recipes/blob/main/cross-document-reactor) / [`saga`](https://github.com/powerhouse-inc/recipes/blob/main/saga):
  the same automation driven by *internal* events.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/external-feed-ingest)
</details>

<details id="recipe-full-text-search">
<summary><strong>Full-Text Search Processor</strong> — A Reactor `IProcessor` that indexes document state into a PostgreSQL full-text search table, enabling ranked keyword search across all documents managed by a Reactor instance.</summary>

### Full-Text Search Processor

A Reactor `IProcessor` that indexes document state into a PostgreSQL full-text search table, enabling ranked keyword search across all documents managed by a Reactor instance. A Reactor (`@powerhousedao/reactor`) stores documents and their operation history and routes each batch of operations to the processors registered with it.

#### How it works

When operations arrive, the processor:

1. Collects the last operation per document (earlier states are superseded).
2. Flattens the resulting document state into a single searchable string via `flattenToSearchableText`.
3. Upserts a row in `search_index` with the content and a PostgreSQL `tsvector`.
4. Handles `DELETE_DOCUMENT` actions by removing the corresponding row.

#### Architecture

| Module | Purpose |
|--------|---------|
| `processor.ts` | `SearchProcessor`: the `IProcessor` implementation |
| `schema.ts` | Kysely type definitions for the `search_index` table |
| `migrations.ts` | `up` / `down` functions to create/drop the table and `idx_search_tsv`, a GIN (inverted) index on `tsv` |
| `query.ts` | `createSearchQuery`: returns a `search(term, limit?)` helper using `ts_rank` |
| `utils.ts` | `flattenToSearchableText`: recursively extracts all string values from a JSON state |

#### Prerequisites

- PostgreSQL with full-text search support (`tsvector`, `plainto_tsquery`, `ts_rank`)
- [Kysely](https://kysely.dev/) database instance

#### Run it

```sh
pnpm start   # demo.ts: builds a reactor, indexes three documents, runs searches
pnpm test    # vitest against in-process PGlite
```

#### Usage

##### Run migrations

```ts
import { up } from "@powerhousedao/example-full-text-search";

await up(db);
```

##### Register the processor

```ts
import { SearchProcessor } from "@powerhousedao/example-full-text-search";

const processor = new SearchProcessor(db);
```

Hand the processor to the Reactor's `ProcessorManager`: `registerFactory("full-text-search", () => [{ processor, filter: { branch: ["main"] }, startFrom: "beginning" }])`. `demo.ts` makes the same call against a module built by `ReactorBuilder`.

##### Query the index

```ts
import { createSearchQuery } from "@powerhousedao/example-full-text-search";

const search = createSearchQuery(db);
const results = await search.search("budget allocation", 10);
// returns: [{ document_id, document_type, title, rank }]
```

#### Exports

Beyond `up`, `SearchProcessor`, and `createSearchQuery`, `index.ts` exports `down` (drops the index, then the table), `flattenToSearchableText`, and the types `SearchResult`, `SearchDB`, and `SearchIndex`.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/full-text-search)
</details>

<details id="recipe-group-principals">
<summary><strong>Group Principals</strong> — Who may approve an expense is a question a **roster document** answers.</summary>

### Group Principals

Who may approve an expense is a question a **roster document** answers. The
expense report's policy names a [`reactor-group`](https://npmjs.com/package/@powerhousedao/reactor-group)
document with a `{ group: <documentId> }` principal, and the reactor folds that
roster's membership whenever it decides an approval.

This recipe re-runs [`revocation-race`](https://github.com/powerhouse-inc/recipes/blob/main/revocation-race) with the revocation
as a **membership removal on a different document** than the one being judged.

#### What it demonstrates

- **Hire/offboard is one operation**: `addMember` / `removeMember` on the
  roster. No policy write, no per-document sweep.
- **The roster is an ordinary document**: a `powerhouse/reactor-group` governed
  by its own Alice-only auth scope, so Bob cannot enroll himself.
- **Membership is positional**: a `removeMember` timestamped *before* an
  accepted approval re-judges it, and the approval flips to a stored denial.
- **Fail closed without the roster**: a replica that cannot fold membership
  denies the synced approval, and converges when the roster's history arrives.

#### Run it

Group principals apply only with `authGroups`, third of the reactor's cascading
auth flags (`documentDecisions` → `authEnforcement` → `authGroups`). Below
`authGroups` a `{ group }` grant parses and stores but never matches, as
[`document-acl`](https://github.com/powerhouse-inc/recipes/blob/main/document-acl) warns. The catalog pins `6.2.3-dev.25`,
which carries that flag.

```sh
pnpm install
pnpm test    # vitest: admission, positional flip, two-replica convergence
pnpm start   # narrated single-reactor walkthrough
```

Alice, Bob and Carol each hold a `RenownCryptoSigner` key (`createSigner` in
`src/signers.ts`). `buildSignedReactor` gives each of them a `ReactorClient` built
with `withSigner`, so every action is signed for its document. It also gives the
reactor a trust policy (`trustPolicyFor`) that says which key may sign as which
address: under `authEnforcement`, a reactor with no trust policy refuses every
signed write but its own. The two-replica test gives both reactors the same policy,
because a load checks it too.

#### The shape of the policy

```ts
{
  id: "g-reviewers-approve",
  description: "the reviewers group may approve expenses",
  effect: "allow",
  principal: { group: rosterDocumentId },
  capability: { can: "execute", scope: "global", operation: ["APPROVE_EXPENSE"] },
}
```

The roster's document id is data, so which humans the grant covers is decided
by folding the roster's stream to the position of the operation being judged. A
`{ group }` grant on a roster is itself refused (`assertValidGrant` throws
`GroupPrincipalNotAllowedError`), so the fold is always one roster deep.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/group-principals)
</details>

<details id="recipe-inbound-webhook-bridge">
<summary><strong>Inbound Webhook Bridge</strong> — Receive external webhooks (Stripe-style), verify the signature **server-side against the raw request bytes**, and map verified events onto document actions.</summary>

### Inbound Webhook Bridge

Receive external webhooks (Stripe-style), verify the signature **server-side
against the raw request bytes**, and map verified events onto document actions.
This recipe is the inbound twin of [`discord-webhook-processor`](https://github.com/powerhouse-inc/recipes/blob/main/discord-webhook-processor)
(documents → external service).

#### The headline rule: verify the raw bytes

&gt; **`JSON.parse(body)` → `JSON.stringify(parsed)` breaks HMAC.** The signature
&gt; is computed over the exact bytes the provider sent. Re-serializing changes key
&gt; order, whitespace, and number formatting, so the signature no longer matches.

Always verify the raw body string, *then* parse it. This recipe uses a small
`node:http` listener precisely so it controls the bytes. A GraphQL/JSON
mutation resolver parses the body before your code runs, which is why
[the brief](https://github.com/powerhouse-inc/recipes/blob/main/briefs/04-inbound-webhook-bridge.md) recommends a dedicated
listener when raw-body access is awkward.

#### How it works

```
provider ──POST raw body + x-webhook-signature──▶ createWebhookServer (node:http)
                                                     │  1. read raw bytes (no parse yet)
                                                     │  2. verifyWebhook() — HMAC over `${t}.${rawBody}`,
                                                     │     constant-time compare, replay-window check
                                                     │  3. JSON.parse the verified bytes
                                                     ▼
                                                  WebhookBridge.handleEvent
                                                     │  4. resolve orderId → documentId
                                                     │  5. dedup vs persisted processedEventIds
                                                     │  6. map event type → typed action
                                                     ▼
                                                  client.executeAsync → Payment document
```

`client.executeAsync` hands the mapped action to the reactor, the
`@powerhousedao/reactor` instance that stores the documents and applies
operations to them. The bridge takes an `IReactorClient` built with `withSigner`,
so the action is signed as the bridge's own key. A reactor that verifies
signatures refuses unsigned writes. That action signature is separate from the
webhook signature below, which only proves the provider sent the request.

##### Signature scheme (modelled on Stripe)

The `x-webhook-signature` header is `t=<unixSeconds>,v1=<hmacHex>`, and the
signed payload is `` `${t}.${rawBody}` ``. Because the timestamp is inside that
payload, it can't be altered independently of the signature, which is what the
replay-window check relies on.

```ts
import { signWebhook, verifyWebhook } from "@powerhousedao/example-inbound-webhook-bridge";

const header = signWebhook(secret, rawBody, Math.floor(Date.now() / 1000));
const verdict = verifyWebhook({ secret, rawBody, signatureHeader: header, nowSeconds });
// { ok: true, timestampSeconds } | { ok: false, reason }
```

Verification (`src/signature.ts`) rejects: missing/malformed header,
signature mismatch (wrong secret *or* tampered/re-serialized body), and
timestamps outside the tolerance window (default 5 minutes). Comparison uses
`crypto.timingSafeEqual`.

##### Idempotency that survives restarts

Providers redeliver. Every event that mutates the document records its provider
`event.id` in the document's `processedEventIds` state. Because the dedup set
lives in **document state**, not in the memory of a long-running listener, it
survives a restart. The bridge (`src/webhook-bridge.ts`) short-circuits a known
event id, so no operation is appended, and the reducer refuses a duplicate if
two redeliveries race past that check.

#### The payment document model

A four-state machine, **generated** from
`document-models/payment/payment.json` via `pnpm generate`:

```
PENDING ──recordPayment──▶ PAID ──recordRefund──▶ REFUNDED
   └──────markFailed──────▶ FAILED
```

| Event type          | Action          |
|---------------------|-----------------|
| `payment.succeeded` | `recordPayment` |
| `payment.failed`    | `markFailed`    |
| `refund.created`    | `recordRefund`  |

State: `{ orderId, amountCents, currency, status, failureReason, processedEventIds }`.

The reducer logic (the state-machine guards + event-id dedup) is hand-maintained
at `document-models/payment/v1/src/reducers/payment.ts`.

#### Secrets

The signing secret is read **only on the server** and must never be bundled for
the browser. `WEBHOOK_SIGNING_SECRET` is declared as a required `secret` in the
`config` block of [`powerhouse.manifest.json`](https://github.com/powerhouse-inc/recipes/blob/main/inbound-webhook-bridge/powerhouse.manifest.json), and
loaded from the environment server-side.

#### Running

```sh
pnpm start   # runs the demo
pnpm test    # signature, reducer, and HTTP integration tests
```

The demo (`src/demo.ts`) prints the document's final state and history, showing
**exactly one** state-changing operation despite the tampered, duplicate, and
stale deliveries.

#### Related recipes

- [`rate-limiter`](https://github.com/powerhouse-inc/recipes/blob/main/rate-limiter): precedent for gating the write path.
- [`saga`](https://github.com/powerhouse-inc/recipes/blob/main/saga): what to read next if one webhook should fan out across
  multiple documents.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/inbound-webhook-bridge)
</details>

<details id="recipe-positional-delete">
<summary><strong>Positional Delete</strong> — Deletion as a **position in the merged operation order**, not a document-wide tombstone.</summary>

### Positional Delete

Deletion as a **position in the merged operation order**, not a document-wide
tombstone. A `deleteDocument` refuses only the operations that sort after it.
Operations that sort before it are legitimate history, even when they arrive later
over sync. Refusal stores the operation as a **denied operation** rather than dropping
it, so every reactor reaches the same verdict independently.

#### What it demonstrates

- The refused operation keeps its place in the stored stream with `deniedReason:
  "document deleted"`, readable through `garbageCollect(sortOperations(...))` and
  `isDenied(operation)` from `@powerhousedao/shared/document-model`.
- No origin verdict is shipped or trusted. Each reactor judges arriving history at
  its own position, which lets two reactors converge without coordinating (the
  `judges each operation at its position and converges` case).
- Once a reactor knows the delete, a newly submitted write fails its job outright
  (`DocumentDeletedError`) and nothing is stored.

#### Running

The demo is a plain split-brain over a custom `field-log` document model: Station B
keeps logging observations while Station A deletes the document, no clock tricks.

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

```text
[Station B] log "temp 18 °C" → ok
[Station A] deleteDocument → ok (B doesn't know yet)
[Station B] log "humidity 80 %" → ok

=== effective operations on Station A ===
  "wind 12 kn" → applied
  "temp 18 °C" → applied
  "humidity 80 %" → DENIED (document deleted)
=== effective operations on Station B ===   (identical)
```

#### How it works

The reactor is built with the `documentDecisions` feature flag, which replaces the
cached whole-document `isDeleted` check with a decision model over the document
stream:

```ts
const reactor = await new ReactorBuilder()
  .withDocumentModelSources([FieldLog, documentModelDocumentModelModule])
  .withExecutorConfig({ featureFlags: { documentDecisions: true } })
  .build();
```

Admission is the write path's decision at the stream heads: `decideAtHead` in
`@powerhousedao/reactor` compiles an append condition the store enforces at write
time. A load instead evaluates each operation at its own position. A delete arriving
late triggers re-evaluation of the tail it now precedes, which re-appends retracted
operations with a skip rather than rewriting history. The stored rows therefore keep
both copies, and `garbageCollect(sortOperations(...))` resolves them to the effective
stream that `src/demo.ts` prints.

#### Scope note: views on the retraction path

The "state as of the deletion" read is a **load-path** guarantee: on the reactor that
received the denied operation via sync, it was never applied, and `reactor.get()`
serves history up to the boundary. A reactor that had **already applied** an
operation before learning of the delete keeps its materialized view. The retraction
still lands in the effective operation stream, which is the consensus artifact, so
any rebuild or replay from it sees the boundary state. Both sides are covered in
`tests/positional-delete.test.ts`.

#### State shape

```graphql
type FieldLogState {
  observations: [Observation!]!
}

type Observation {
  id: ID!
  note: String!
  recordedBy: String!
}
```

One operation, `LOG_OBSERVATION`, whose reducer only enforces id uniqueness. Deletion
never touches model code: `DELETE_DOCUMENT` is a platform action on the `document`
scope.

`recordedBy` is the signer's address. Each station writes through a `ReactorClient`
that signs with its own `RenownCryptoSigner` key (`buildSignedReactor` in
`src/signers.ts`), and Station A signs the create and the delete by passing its
signer to `reactor.create` and `reactor.deleteDocument`. A reactor that verifies
signatures refuses an unsigned write to a v2-required document, and
`utils.createDocument()` returns one on those releases.

#### Tests

```sh
pnpm test
```

The last case covers the legacy path: without `documentDecisions`, one `isDeleted`
check rejects a whole incoming load, legitimate pre-delete history included.

#### Related recipes

- [`document-acl`](https://github.com/powerhouse-inc/recipes/blob/main/document-acl): authorization verdicts computed per operation at
  its position, on the same decision-model machinery.
- [`document-versioning`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning): replaying stored history through the
  latest reducer after a schema upgrade.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/positional-delete)
</details>

<details id="recipe-rate-limiter">
<summary><strong>Rate Limiter</strong> — A Reactor `IProcessor` paired with an `AuthService` gate to throttle users by signer address.</summary>

### Rate Limiter

A Reactor `IProcessor` paired with an `AuthService` gate to throttle users by signer address. The Reactor (`@powerhousedao/reactor`) is the Powerhouse node that stores documents and applies their operations.

#### How it works

Two components form a feedback loop.

1. **`RateLimiterProcessor`** sits inside the Reactor, counts operations per signer address (`operation.action.context.signer.user.address`) within a sliding time window, and calls `authService.cooldown()` when a user exceeds the threshold. The processor never throws.

2. **`AuthService`** sits in front of the Reactor (e.g. in a GraphQL resolver or HTTP middleware). Before forwarding a mutation, the caller checks `authService.isAllowed(address)`.

```
Client → [AuthService gate] → Reactor → RateLimiterProcessor → authService.cooldown()
              ↑                                                        |
              └────────────────────────────────────────────────────────┘
```

Operations without a signer are silently skipped. Counters live in memory and are empty after a restart.

#### Architecture

| Module | Purpose |
|--------|---------|
| `src/auth-service.ts` | `AuthService`: in-memory cooldown gate with `cooldown()`, `isAllowed()` (returns `AuthCheckResult`), and `getCooldownRemaining()` |
| `src/rate-limiter-processor.ts` | `RateLimiterProcessor`, the `IProcessor` implementation, plus `createRateLimiterFactory` and the `RateLimiterConfig` type |

#### Configuration

| Option | Type | Description |
|--------|------|-------------|
| `maxOperations` | `number` | Maximum operations allowed per user within the time window |
| `windowMs` | `number` | Length of the sliding time window in milliseconds |
| `cooldownMs` | `number` | How long a user is blocked after exceeding the limit |
| `filter` | `ProcessorFilter` | Which operations the processor subscribes to (document type, scope, branch, etc.) |

#### Usage

##### Register the processor

```ts
import { AuthService } from "@powerhousedao/example-rate-limiter/src/auth-service.js";
import { createRateLimiterFactory } from "@powerhousedao/example-rate-limiter/src/rate-limiter-processor.js";

// Shared instance — pass to both the GQL layer and the processor
const authService = new AuthService();

await processorManager.registerFactory(
  "rate-limiter",
  createRateLimiterFactory({
    authService,
    maxOperations: 100,
    windowMs: 60_000,    // 1-minute window
    cooldownMs: 300_000, // 5-minute cooldown
    filter: { branch: ["main"] },
  }),
);
```

##### Gate requests in your GraphQL / HTTP layer

```ts
const check = authService.isAllowed(userAddress);
if (!check.allowed) {
  res.set("Retry-After", String(Math.ceil(check.retryAfterMs! / 1000)));
  throw new Error(`Rate limited. Retry after ${check.retryAfterMs}ms`);
}
```

#### Tests

```sh
pnpm test
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/rate-limiter)
</details>

<details id="recipe-relational-db-subgraph">
<summary><strong>Relational DB Subgraph</strong> — A relational DB processor that catalogs every document it sees, with Kysely migrations, a typed query layer, and a GraphQL subgraph over the result.</summary>

### Relational DB Subgraph

A relational DB processor that catalogs every document it sees, with Kysely migrations, a typed query layer, and a GraphQL subgraph over the result. This recipe is the pattern `ph generate --processor` and `ph generate --subgraph` produce.

#### What it does

A Reactor (`@powerhousedao/reactor`) stores documents and their operation history and hands each batch of operations to the processors registered with it. The `CatalogProcessor` watches all documents flowing through the Reactor (document-type-agnostic) and maintains a denormalized relational view:

- `documents` stores document metadata: ID, type, name, content summary, revision, and `updated_at`.
- `document_tags` stores tags extracted from document state by `extractTags`, which reads the `tags` or `labels` array.

The GraphQL subgraph exposes this data via queries like `documents`, `document(id)`, `documentsByType`, and `documentsByTag`.

#### Mapping to `ph generate`

| Generated artifact | File in this recipe |
|---|---|
| `ph generate --processor` | `src/processor.ts`: `CatalogProcessor extends RelationalDbProcessor<CatalogDB>`, which gives the processor namespaced DB access, `initAndUpgrade()` to apply migrations, and a type-safe `query` builder |
| `ph generate --subgraph` | `src/subgraph.ts`: `createCatalogSchema` builds the GraphQL SDL and resolvers over the query layer, `startCatalogServer` serves them with graphql-yoga |
| Schema types | `src/schema.ts`: the Kysely DB interface `CatalogDB`, with the `DocumentRow` and `DocumentTagRow` row types |
| Migrations | `src/migrations.ts`: `up()` creates both tables and their indexes, `down()` drops them |
| Query layer | `src/query.ts`: `createCatalogQuery` returns typed reads with a join onto `document_tags`, filtering by type or tag, and `limit`/`offset` pagination |

#### Usage

```ts
import { Kysely } from "kysely";
import { createRelationalDb } from "@powerhousedao/reactor";
import { CatalogProcessor, startCatalogServer } from "@powerhousedao/example-relational-db-subgraph";

// 1. Create a Kysely instance (PGlite, PostgreSQL, etc.)
const db = new Kysely<CatalogDB>({ dialect });
const relationalDb = createRelationalDb(db);

// 2. Create and initialize the processor
const processor = new CatalogProcessor("catalog", { branch: ["main"] }, relationalDb);
await processor.initAndUpgrade();

// 3. Register with the Reactor processor manager
await processorManager.registerFactory("catalog", () => [
  {
    processor,
    filter: { branch: ["main"] },
    startFrom: "beginning",
  },
]);

// 4. Start the GraphQL subgraph server
startCatalogServer(db, 4002);
// → Catalog subgraph ready at http://localhost:4002/graphql
```

#### Supergraph composition

`createCatalogSchema` in `src/subgraph.ts` returns a standalone schema, so a gateway like Apollo Router or GraphQL Mesh can compose it alongside other subgraphs, such as the Reactor's built-in GraphQL endpoint. One request then spans the catalog and the other sources. Nothing in this recipe runs a gateway, so the composition itself is untested here.

#### Running it

```sh
pnpm test
```

Tests use PGlite (embedded PostgreSQL), so no external database is required. `pnpm start` runs `src/demo.ts`, which builds a Reactor, creates three documents, and prints the catalog rows.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/relational-db-subgraph)
</details>

<details id="recipe-revocation-race">
<summary><strong>Revocation Race</strong> — Convergent authorization across reactors.</summary>

### Revocation Race

Convergent authorization across reactors. Alice revokes Bob's approval grant on one
reactor (`@powerhousedao/reactor`, the Powerhouse node that stores documents and
applies their operations) while Bob approves an expense on another. **Both succeed
locally**, because no transaction spans two reactors. Both reactors still converge,
because each judges every operation **at its position in the merged order**.

#### What it demonstrates

- **After syncing both directions, both reactors reach the same verdict**, each
  re-judging remote history at its own position. No origin verdict is shipped or
  trusted.
- **Denials are consensus artifacts**: a refused operation keeps its place in the
  stored stream with a reason from a closed, replicated set. Inspect with
  `isDenied` / `garbageCollect(sortOperations(...))`.
- **A late-arriving revocation retracts an already-applied approval** in the
  effective stream (see the view scope note in
  [`positional-delete`](https://github.com/powerhouse-inc/recipes/blob/main/positional-delete)).

#### The rejected alternative

The alternative is to judge an operation once, at its origin, and ship the verdict
with it. That verdict would be wrong the moment a concurrent policy change sorts
before the operation, and every reactor would then have to either trust it
(divergence) or re-derive it anyway.

#### Policy setup

Grants name a scope: `auth` holds the policy stream, `global` holds domain
operations, and `*` covers every scope.

| id | effect | principal | capability |
|---|---|---|---|
| `g-alice-admin` | allow | Alice | `execute` on scope `auth` |
| `g-alice-all` | allow | Alice | `execute` on scope `*` |
| `g-anyone-submit` | allow | anyone | `execute` `SUBMIT_EXPENSE` on `global` |
| `g-bob-approve` | allow | Bob | `execute` `APPROVE_EXPENSE` on `global` |

Only Alice's reactor ever writes the auth scope, deliberately. The auth stream is
strictly timestamp-monotonic (a backdated policy edit is refused with
`AuthTimestampNotMonotonicError`) and is never reshuffled, so concurrent policy edits
from multiple reactors can conflict on merge. Positional judgment works only because
the policy stream itself has one authoritative order.

Alice and Bob sign with their own `RenownCryptoSigner` keys, through the clients
`buildSignedReactor` (`src/signers.ts`) builds on each reactor. A synced operation
keeps its signature, and the receiving reactor checks it on load against the same
trust policy (`trustPolicyFor`), so both reactors judge it as the same address.

#### State shape

```graphql
type ExpenseReportState {
  expenses: [Expense!]!
}

type Expense {
  id: ID!
  memo: String!
  amountCents: Int!
  status: ExpenseStatus!   # PENDING | APPROVED
  approvedBy: String
}
```

`SUBMIT_EXPENSE` and `APPROVE_EXPENSE` reducers validate domain invariants only
(duplicate id, unknown expense, double approval). Who may approve is platform policy.

#### Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

The demo runs the race twice on one `expense-report` document, with wall-clock
ordering both times. When the revocation sorts first, both reactors deny the
approval: the expense stays `PENDING` and the refusal is stored with
`deniedReason: "no grant permits this operation"`. When the approval sorts first,
both reactors keep it and the expense is `APPROVED`.

#### Tests

```sh
pnpm test
```

`tests/revocation-race.test.ts` covers both race orderings converging on both
reactors (with the denied reason pinned to `AUTH_NO_GRANT_REASON`), origin refusal
once the revocation is known, and the backdated-auth-operation guard.

#### Related recipes

- [`document-acl`](https://github.com/powerhouse-inc/recipes/blob/main/document-acl): the grant stack this recipe races (principals,
  capabilities, last-applicable-grant-wins).
- [`positional-delete`](https://github.com/powerhouse-inc/recipes/blob/main/positional-delete): the same positional machinery applied
  to deletion, including the load-path vs retraction-path view guarantee.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/revocation-race)
</details>

<details id="recipe-role-based-auth">
<summary><strong>Role-Based Auth</strong> — A custom document model where the creator is promoted to admin on first action, admins can grant or revoke admin and member roles, and a domain action (`writeNote`) is gated on member-or-higher.</summary>

### Role-Based Auth

A custom document model where the creator is promoted to admin on first action, admins can grant or revoke admin and member roles, and a domain action (`writeNote`) is gated on member-or-higher. A document model is a state schema plus the reducer that applies its operations, and all authorization here runs inside that reducer against `action.context.signer.user.address`.

#### What it demonstrates

Roles live in the document state, in the `admins` and `members` arrays, rather than in an external policy store. Every authorization failure is a named error class generated into `gen/access/error.ts` from the error list the spec declares for each operation.

#### State shape

```graphql
type RoleBasedAuthState {
  creator: String
  admins: [String!]!
  members: [String!]!
  notes: [Note!]!
}

type Note {
  id: OID!
  author: String!
  text: String!
  createdAt: DateTime!
}
```

#### Operations

| Operation | Who can call | Effect |
|---|---|---|
| `bootstrap` | anyone, once | Sets the caller as `creator` and pushes them into `admins`. Throws `AlreadyBootstrapped` on a second call. |
| `grantAdmin(address)` | admin | Promotes `address` to admin and removes it from `members` if present. |
| `revokeAdmin(address)` | admin | Removes `address` from admins. Throws `CannotRevokeCreator` on the creator, `LastAdmin` if the removal would empty the admin set. |
| `addMember(address)` | admin | Adds `address` to `members`. Throws `AddressAlreadyAdmin` if the address is already an admin. |
| `removeMember(address)` | admin | Removes `address` from `members` (no-op if absent). |
| `writeNote({ id, text, createdAt })` | admin or member | Appends `{ id, author, text, createdAt }` to `state.notes`. Throws `NotAuthorized` if the caller has no role. |

Every operation throws `NotAuthorized` if `action.context.signer` is missing.

#### Authorization pattern

Each reducer op begins with:

```ts
const address = action.context?.signer?.user?.address;
if (!address) throw new NotAuthorized("User is not authenticated");
```

Role-mutating ops additionally call `requireAdmin(state, address)`, which throws `NotAdmin`. `v1/gen/reducer.ts` wraps the state reducer with `createReducer`, whose default `baseReducer` catches the throw and records `error.message` as `operation.error` on the resulting document. Callers inspect the operation log to detect rejection.

The full implementation lives in `document-models/role-based-auth/v1/src/reducers/access.ts`. Codegen keeps its reducer bodies when it regenerates the model.

#### Regenerating the model

```sh
pnpm generate
```

This runs the catalog `ph-cli` against `document-models/role-based-auth/role-based-auth.json` and rewrites everything under `v1/gen/`, along with `v1/hooks.ts`, which imports `@powerhousedao/reactor-browser`. Edit the spec and regenerate rather than editing generated files.

#### Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

The demo runs in order: Alice bootstraps, Bob is rejected from `writeNote`, Alice adds Bob as a member, Bob writes a note. Then Bob is rejected from `grantAdmin`, Alice promotes Bob, Bob promotes Carol, and Carol is rejected from demoting the creator.

#### Tests

```sh
pnpm test
```

The suite in `document-models/role-based-auth/v1/tests/access.test.ts` covers the single-bootstrap invariant, missing-signer rejection, and the creator-cannot-be-demoted rule. `v1/tests/document-model.test.ts` is the codegen scaffold that checks document creation and the state and document type guards.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/role-based-auth)
</details>

<details id="recipe-saga">
<summary><strong>Saga</strong> — Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context.</summary>

### Saga

Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context.

#### What it demonstrates

- **`IProcessor` as a saga coordinator**: `SagaProcessor.onOperations` reacts to incoming operations and dispatches the follow-up actions on other documents through `IReactorClient.executeAsync()`, which signs each one with the client's signer (a reactor that verifies signatures refuses unsigned writes)
- **Saga correlation via DB**: a `saga_id` ties every step together, tracked entirely in the processor's own `saga_log` table (no changes to document interfaces)
- A re-entrancy guard keeps the processor from reacting to its own dispatched operations. `SagaProcessor` sets a `processing` flag while it dispatches, and `onOperations` returns immediately whenever that flag is already set (`src/processor.ts`).

#### How it works

1. Creates a drive, the container document the others live under, holding **Order-001**, **Payment-001**, and **Fulfillment-001**
2. Registers a `SagaProcessor` whose step definitions chain the renames: `Order-001 [CREATED]` dispatches `Payment-001 [REQUESTED]`, which dispatches `Fulfillment-001 [STARTED]`, which closes the saga with `Order-001 [FULFILLED]`
3. Triggering the saga by renaming the order document cascades through all three steps

#### Running

```sh
pnpm install
pnpm --filter @powerhousedao/saga start
```

#### Expected output

```
Saga Pattern Demo
==================

Demonstrates: processor-based saga coordination across documents,
with a traceable saga_id linking every step.

  Starting reactor... done (X.Xs)

  Creating drive... <drive-id>
  Creating order document... <order-id>
  Creating payment document... <payment-id>
  Creating fulfillment document... <fulfillment-id>

  Documents named: "Order-001", "Payment-001", "Fulfillment-001"

  Registered saga processor

--- Triggering saga: renaming Order-001 to Order-001 [CREATED] ---

--- Final document state ---

  Order:       "Order-001 [FULFILLED]"
  Payment:     "Payment-001 [REQUESTED]"
  Fulfillment: "Fulfillment-001 [STARTED]"

--- Saga log ---

  Saga ID: <uuid>

  Step: order-created
    <order-id> -> <payment-id>
    action: SET_NAME  status: dispatched
  Step: payment-requested
    <payment-id> -> <fulfillment-id>
    action: SET_NAME  status: dispatched
  Step: fulfillment-started
    <fulfillment-id> -> <order-id>
    action: SET_NAME  status: dispatched

+ Saga completed successfully
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/saga)
</details>

<details id="recipe-scoped-reads">
<summary><strong>Scoped Reads</strong> — The same policy that refuses a write decides what a read returns.</summary>

### Scoped Reads

The same policy that refuses a write decides what a read returns. A subject
that may not read a scope does not receive it. `IReactor` is inside the trust
boundary and serves every scope of every document to every caller, so the gate
sits on the `ReactorClient`. [`document-acl`](https://github.com/powerhouse-inc/recipes/blob/main/document-acl) and
[`group-principals`](https://github.com/powerhouse-inc/recipes/blob/main/group-principals) write through signing clients but read
straight from `IReactor`.

#### What it demonstrates

- **The gate is on the client**: `reactor.getByIdOrSlug()` serves all four
  scopes to anyone while `client.get()` serves Mallory only `auth` and
  `document`.
- **Per scope, not per document**: four identities get three views, and a
  withheld scope is *absent* from `document.state` rather than present and
  empty. `client.execute()` hands back a document gated as the client's own
  identity.
- **The client reads as its signer**: Alice's client is built with her
  `RenownCryptoSigner` key (`buildSignedReactor` in `src/signers.ts`), so a
  `client.get()` with no subject, and `client.execute()`, are gated as Alice.
  Bob and Carol write through clients of their own.
- **The read gate carries no feature flag**: with `featureFlags: {}` the read
  is filtered, while admission waits on `authEnforcement`.

#### An allow on execute confers read

Alice holds no read grant. She reads all of `global` because she may write one
operation in it: the operation list restricts what she may execute, not what
she may see. A read grant does not confer execute: Carol reads the expenses
and cannot submit one.

`document-acl`, `revocation-race` and `group-principals` all install an
administration grant of `{ can: "execute", scope: "*" }`, which now publishes
**every** domain scope to whoever it names. The grant here is scoped to `auth`,
which is all the auth-administration retention rule requires: a policy has to
leave some subject able to execute `SET_GRANT` on `auth`, and nothing wider.

#### A `{ group }` read grant follows the roster

Offboarding Bob withdraws his `global` and `local` scopes with no write to the
report's policy, and `header.revision.auth` never moves.

Naming a group publishes its roster to the naming document's audience. Carol
reads the reviewers roster she is not on, past its Alice-only policy, because
the report's `{ group }` grants cannot be evaluated without the member list.
Mallory, whom the report serves nothing, does not.

#### The two domain scopes

Of a `PHDocument`'s four state scopes, `auth` and `document` come back for
every holder, so anyone can evaluate the policy and see the metadata. That
leaves `global` and `local` as the only pair a read can tell apart. The
expenses go in `global`, the reviewers' confidential notes in `local`,
conventionally node-local data.

#### Running it

```sh
pnpm install
pnpm --filter @powerhousedao/example-scoped-reads start
```

`src/demo.ts` is the narrated walkthrough, and `tests/scoped-reads.test.ts`
holds one test per act of it, plus two with the feature flags off.

#### Version requirement

Per-scope read filtering ships in `6.2.2-dev.62`, well below the
`6.2.3-dev.25` this repo's catalog pins in `pnpm-workspace.yaml`. To run
against a local monorepo checkout instead:

```sh
cd ../powerhouse
pnpm build
pnpm test:e2e:recipes --filter scoped-reads --verbose
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/scoped-reads)
</details>

<details id="recipe-semantic-search">
<summary><strong>Semantic Search Processor</strong> — A Reactor `IProcessor` that embeds document content with an in-process model (Transformers.js) into PGlite's `vector` extension and answers cosine-similarity queries.</summary>

### Semantic Search Processor

A Reactor `IProcessor` that embeds document content with an in-process model (Transformers.js) into PGlite's `vector` extension and answers cosine-similarity queries. A Reactor (`@powerhousedao/reactor`) stores documents and their operation history and routes each batch of operations to the processors registered with it. No external API, no API key, no server: the `all-MiniLM-L6-v2` model runs in-process, and pgvector runs inside PGlite.

#### How it works

When operations arrive, the processor:

1. Collects the last operation per document (earlier states are superseded), flattens the resulting state into a single string, and truncates it to the model's effective window.
2. Hashes the text and **skips re-embedding when the hash is unchanged**.
3. Embeds the text into a 384-dimensional vector and upserts it into `semantic_index`.
4. Handles `DELETE_DOCUMENT` actions by removing the corresponding row.

Queries go through `searchSimilar(text, k)`: embed the query with the same model, then `ORDER BY embedding <=> $1 LIMIT k`. With normalized embeddings, `similarity = 1 - cosine distance`.

#### Run it

```sh
pnpm start   # runs demo.ts
pnpm test    # offline — uses a deterministic fake embedder
```

The demo creates ten documents on distinct topics, then runs semantic queries side by side with lexical full-text search over the same content. Queries like *"my car needs an oil change"* find *"Automobile Maintenance and Repair Manual"*, a hit lexical search misses because query and document share no words.

**First-run model download:** `demo.ts` downloads ~25 MB (quantized MiniLM) from the HuggingFace Hub into `.model-cache/` next to the sources. Later runs are fully offline, and tests inject a fake embedder (word-hash → pseudo-vector) so similarity ordering and processor mechanics are testable in CI.

#### Usage

```ts
import {
  up,
  embed,
  SemanticSearchProcessor,
  createSimilarityQuery,
} from "@powerhousedao/example-semantic-search";
import { KyselyPGlite } from "kysely-pglite";
import { vector } from "@electric-sql/pglite/vector";
import { Kysely } from "kysely";

// PGlite must be constructed with the vector extension
const pglite = new KyselyPGlite({ extensions: { vector } });
const db = new Kysely<SemanticSearchDB>({ dialect: pglite.dialect });
await up(db);

const processor = new SemanticSearchProcessor(db, embed);
// ...register with a ProcessorManager...

const query = createSimilarityQuery(db, embed);
const results = await query.searchSimilar("budget allocation", 10);
// [{ document_id, document_type, title, similarity }]
```

#### Notes & pitfalls

- **The embedding dimension is baked into the column type.** `vector(384)` matches `all-MiniLM-L6-v2`. The processor asserts `embedding.length === 384` before insert, so swapping models with a different dimension fails loudly instead of corrupting the index.
- Long content is **truncated, not chunked**. MiniLM attends to ~256 tokens, and `utils.ts` cuts at `MAX_EMBED_CHARS` (2 000 characters). Production systems should chunk long content into multiple rows.
- At demo scale the HNSW parameters don't matter. The approximate-nearest-neighbour index in `migrations.ts` takes pgvector's defaults (`m=16`, `ef_construction=64`), which hold until the table reaches many thousands of vectors.
- [`@powerhousedao/knowledge-note`](https://www.npmjs.com/package/@powerhousedao/knowledge-note), a published package running the same Transformers.js-and-pgvector stack, lazily `import()`s PGlite so registration survives deployments where the transitive runtime deps aren't installed. This Node-only recipe imports PGlite statically.

#### Related recipes

- [full-text-search](https://github.com/powerhouse-inc/recipes/blob/main/full-text-search): the lexical sibling, with the same layout and the same text extraction, so the two directories can be diffed file by file.
- [relational-db-subgraph](https://github.com/powerhouse-inc/recipes/blob/main/relational-db-subgraph): how to expose a read model like `semantic_index` over GraphQL.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/semantic-search)
</details>

<details id="recipe-signed-operations-verifier">
<summary><strong>Signed Operations Verifier</strong> — A standalone script that signs a document operation history with `RenownCryptoSigner`, then verifies each operation with the checks a reactor runs when it stores a write.</summary>

### Signed Operations Verifier

A standalone script that signs a document operation history with `RenownCryptoSigner`, then verifies each operation with the checks a reactor runs when it stores a write. `injectBadOperations()` corrupts one signature, edits the input of another, and deletes the signer context from a third, so the report separates valid operations from tampered, edited and unsigned ones.

#### What it demonstrates

Every signature is the 5-tuple `[timestamp, signerKey, actionHash, prevStateHash, signature]`. `signFor()` signs with `ISigner.signAction(action, { documentId, branch })`: the target names the document and branch whose log stores the action. `verifyOperation()` in `src/verify-operations.ts` then checks, in order:

1. An action with no `context.signer`, or an empty `signer.app.key`, is unsigned.
2. Element [1] must equal `signer.app.key` (`KEY_MISMATCH`).
3. A `v2:` hash is recomputed: `v2:` plus the unpadded base64url SHA-256 of the sorted-key JSON (`canonicalJson()`) of `["v2", documentId, branch, scope, type, id, timestampUtcMs, input, user.address, user.networkId, user.chainId, app.key]`. A 44-character hash is the legacy `RenownCryptoSigner` hash, SHA-256 over scope, type and input. Any other hash is `MALFORMED_TUPLE`, and a hash that does not recompute is `HASH_MISMATCH`.
4. The ECDSA P-256 signature over `\x19Signed Operation:\n{length}` and elements [0] to [3] must verify under the `did:key` in element [1] (`BAD_SIGNATURE`).

A v2 tuple is bound to one document and one signer, so checking operation #0 against another document fails with `HASH_MISMATCH`. A legacy tuple binds neither, and passes. `buildLegacyOperation()` signs a legacy tuple directly, so both schemes are verified on every release.

A reactor runs these checks itself, together with its document's signature policy and the host's trust policy, so a host does not wire a verifier. `@powerhousedao/reactor` exports the same integrity check as `verifyActionSignature`.

#### Run

```bash
pnpm --filter @powerhousedao/example-signed-operations-verifier test
pnpm --filter @powerhousedao/example-signed-operations-verifier start
```

#### Key APIs

| Import | API | Purpose |
|--------|-----|---------|
| `@renown/sdk/node` | `RenownCryptoSigner` | `ISigner` implementation using ECDSA P-256 and a `did:key` |
| `@renown/sdk/node` | `RenownCryptoBuilder` | Builder for the underlying crypto engine |
| `@renown/sdk/node` | `MemoryKeyStorage` | In-memory key pair storage for demos |
| `document-model` | `ISigner.signAction()` | Produces the signature tuple for an action and its target |

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/signed-operations-verifier)
</details>

<details id="recipe-subscription-cli">
<summary><strong>Subscription CLI</strong> — A standalone CLI for monitoring Powerhouse Reactor GraphQL subscriptions over WebSocket in real time.</summary>

### Subscription CLI

A standalone CLI for monitoring Powerhouse Reactor GraphQL subscriptions over WebSocket in real time.

Subscribes to `documentChanges` and optionally `jobChanges`, printing timestamped events to stdout.

#### Usage

```sh
pnpm start
```

With options:

```sh
pnpm start -- --url ws://localhost:4001/graphql/subscriptions \
  --type "powerhouse/billing-statement" \
  --parent-id "drive-abc-123" \
  --auth "eyJhbG..."
```

#### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--url <url>` | WebSocket endpoint | `ws://localhost:4001/graphql/subscriptions` |
| `--type <type>` | Filter `documentChanges` by document type | _(none)_ |
| `--parent-id <id>` | Filter `documentChanges` by parent document (drive) ID | _(none)_ |
| `--job-id <id>` | Also subscribe to `jobChanges` for a specific job | _(none)_ |
| `--auth <token>` | Bearer token for authentication | _(none)_ |
| `--help` | Show help message | |

#### Example output

```
[12:34:56.789] Connecting to ws://localhost:4001/graphql/subscriptions...
[12:34:56.801] Connected
[12:34:56.802] Subscribing to documentChanges (type: powerhouse/billing-statement)...
[12:34:56.803] Listening for events. Press Ctrl+C to stop.
[12:34:58.100] documentChanges [UPDATE] Invoice Q1 (powerhouse/billing-statement)
```

Press `Ctrl+C` to unsubscribe, dispose the WebSocket client, and exit.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/subscription-cli)
</details>

<details id="recipe-sync-health-monitor">
<summary><strong>Sync Health Monitor</strong> — Subscribes to `SyncEventTypes` on the Reactor EventBus and maintains a live health dashboard.</summary>

### Sync Health Monitor

Subscribes to `SyncEventTypes` on the Reactor EventBus and maintains a live health dashboard. Exposes metrics via a GraphQL subgraph.

#### What it shows

The recipe reaches into the built `ReactorModule` for two handles: `eventBus`, which the health monitor subscribes to, and `syncModule`, which registers the remote on each side. The demo then drives the two reactors through failure and recovery, so all five sync event types fire at least once.

#### How it works

1. Builds reactor A and reactor B, each on in-memory PGlite, an in-process Postgres, no external DB.
2. Wires them together with a shared `IChannelFactory` that creates `InternalChannel` pairs, handing operations from one reactor's outbox straight into the other's inbox with no network in between.
3. Attaches a `SyncHealthMonitor` to reactor A's `EventBus`, subscribing to all five sync event types (`SYNC_PENDING`, `SYNC_SUCCEEDED`, `SYNC_FAILED`, `DEAD_LETTER_ADDED`, `CONNECTION_STATE_CHANGED`). The monitor keeps counters, connection states, and the last 50 errors.
4. Serves those metrics through a `syncHealth` GraphQL query on `http://localhost:4001/graphql`, and redraws a terminal dashboard every two seconds.

##### Demo phases

| Phase | What happens | Events fired |
|-------|-------------|-------------|
| Normal sync | Create a document on A, syncs to B | `SYNC_PENDING`, `SYNC_SUCCEEDED` |
| Connection issue | Simulate disconnect → reconnect on the channel | `CONNECTION_STATE_CHANGED` (x3) |
| Failure | Make the channel throw, then create a document | `SYNC_PENDING`, `SYNC_FAILED`, `DEAD_LETTER_ADDED` |
| Recovery | Restore the channel, create another document | `SYNC_PENDING`, `SYNC_SUCCEEDED` |

##### Health status logic

| Status | Condition |
|--------|-----------|
| `healthy` | All connections up, low failure ratio, no dead letters |
| `degraded` | A connection is disconnected/reconnecting, failure ratio &gt;10%, or dead letters exist |
| `unhealthy` | Any connection is in `error` state |

#### Usage

```sh
pnpm install
pnpm start
```

##### JSON mode

```sh
pnpm start -- --json
```

Emits one JSON line per refresh interval instead of the visual dashboard.

##### GraphQL query

While the dashboard is running, query the subgraph:

```sh
curl -s http://localhost:4001/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ syncHealth { healthStatus pendingCount successCount failureCount deadLetterCount connectionStates { remoteName state } recentErrors { timestamp remoteName error } } }"}' \
  | jq .
```

##### Example output

```
Sync Health Monitor                            uptime 0h 0m 12s
============================================================
  Status:  HEALTHY

  Sync Operations
    pending: 0   succeeded: 2   failed: 0
    dead letters: 0

  Connections
    remoteB              connected

------------------------------------------------------------
  GraphQL: http://localhost:4001/graphql   Ctrl+C to quit
```

#### Tests

```sh
pnpm test
```

Unit tests verify the `SyncHealthMonitor` class in isolation using a standalone `EventBus` with synthetic events.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/sync-health-monitor)
</details>
{/* AUTO-GENERATED-RECIPE-DOCS-END */}

### Reactor Management

<details id="starting-the-reactor">
<summary>Starting the Reactor</summary>

### How to Start the Powerhouse Reactor

---

### Problem statement

You need to start the Powerhouse Reactor, the local service responsible for processing document model operations and managing state, typically for testing or development purposes.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- You are in the root directory of your Powerhouse project.

### Solution

> **Note:** For development, **Vetra Studio** (`ph vetra --watch`) is the recommended workflow as it includes the reactor functionality along with automatic code generation and live preview. Use `ph reactor` directly when you need to run the reactor service independently.

### Using Vetra (Recommended for Development)

```bash
ph vetra --watch
```

Vetra includes reactor functionality and provides:

- Automatic code generation when document models change
- Live preview of documents and editors
- Integrated development environment

### Using Reactor Directly

### Step 1: Navigate to Project Directory (if needed)

Ensure your terminal is in the root directory of your Powerhouse project.

```bash
cd <yourprojectname>
```

### Step 2: Run the Reactor Command

Execute the `ph reactor` command.

```bash
ph reactor
```

### Expected outcome

- The Reactor service starts, typically listening on `localhost:4001`.
- You will see log output indicating the reactor is running and ready to process operations.
- A GraphQL endpoint is usually available at `http://localhost:4001/graphql` for direct interaction and testing.

### Common issues and solutions

- Issue: Reactor fails to start, mentioning port conflicts.
  - Solution: Ensure port `4001` (or the configured reactor port) is not already in use by another application. Stop the conflicting application or configure the reactor to use a different port (if possible, check documentation).
- Issue: Errors related to storage or configuration.
  - Solution: Check the `powerhouse.manifest.json` and any reactor-specific configuration files for errors. Ensure storage providers (like local disk) are accessible and configured correctly.

### Related recipes

- [Launching Vetra Studio](#launching-vetra-studio)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

</details>

### Data Synchronisation

<details id="troubleshooting-document-syncing">
<summary>Troubleshooting Document Syncing: Supergraph vs. Drive Endpoints</summary>

### Troubleshooting Document Syncing: Supergraph vs. Drive Endpoints

---

### Problem statement

You've created or modified documents within a specific drive using Powerhouse Connect, but when you query the main GraphQL endpoint (`http://localhost:4001/graphql`), you don't see the changes or the documents you expected. This can lead to confusion about whether data is being synced correctly.

### Prerequisites

- Powerhouse CLI (`ph-cmd`) installed.
- A Powerhouse project initialized (`ph init`).
- Vetra Studio is running (`ph vetra --watch`) or the Powerhouse Reactor is running (`ph reactor`).
- You have attempted to create or modify documents in a drive (e.g., a "finances" drive).

### Solution

Understanding the different GraphQL endpoints in Powerhouse is crucial for effective troubleshooting:

1.  **The Supergraph Endpoint (`http://localhost:4001/graphql`):**
    - This is the main entry point for the supergraph, which combines various subgraphs (e.g., system information, user accounts, etc.).
    - While you can query many things here, it's generally **not** the endpoint for direct, real-time document content operations like `pushUpdates` for a specific drive.

2.  **Drive-Specific Endpoints (e.g., `http://localhost:4001/d/<driveId>` or `http://localhost:4001/d/<driveId>/graphql`):**
    - Each drive (e.g., "finances", "mydocs") has its own dedicated endpoint.
    - Operations that modify or directly interact with the content of a specific drive, such as creating new documents or pushing updates, are typically handled by this endpoint.
    - When you interact with documents in Powerhouse Connect, it communicates with these drive-specific endpoints.

**Troubleshooting Steps:**

1.  **Identify the Correct Endpoint:**
    - As illustrated in the scenario where a user was looking for documents in a "finances" drive, the key realization was needing to interact with the `http://localhost:4001/d/finances` endpoint for document-specific operations, not just `http://localhost:4001/graphql`.

2.  **Inspect Network Requests:**
    - Open your browser's developer tools (usually by pressing F12) and go to the "Network" tab.
    - Perform an action in Powerhouse Connect that involves a document (e.g., creating, saving).
    - Look for GraphQL requests. You'll often see operations like `pushUpdates`.
    - Examine the "Request URL" or "Path" for these requests. You'll likely see they are being sent to a drive-specific endpoint (e.g., `/d/finances`, `/d/powerhouse`).
    - The payload might show `operationName: "pushUpdates"`, confirming a document modification attempt.

3.  **Querying Drive Data:**
    - If you want to query the state of documents within a specific drive via GraphQL, ensure you are targeting that drive's GraphQL endpoint (often `http://localhost:4001/d/<driveId>/graphql` or through specific queries available on the main supergraph that reference the drive). The exact query structure will depend on your document models.

4.  **Clear Caches and Reset (If Necessary):**
    - Sometimes, old state or cached data can cause confusion. As a general troubleshooting step if issues persist:
      - Try deleting the `.ph` folder in your user's home directory (`~/.ph`). This folder stores global Powerhouse configurations and cached dependencies.
      - Clear browser storage (localStorage, IndexedDB) for the Connect application.

### Expected outcome

- You can correctly identify which GraphQL endpoint to use for different types of queries and operations.
- You understand that document-specific operations (like creating or updating documents in a drive) are typically handled by drive-specific endpoints.
- You can use browser developer tools to inspect network requests and confirm which endpoints Powerhouse Connect is using.
- Documents sync as expected, and you can retrieve their state by querying the appropriate endpoint.

### Common issues and solutions

- **Issue:** Documents created in Connect don't appear when querying `http://localhost:4001/graphql`.
  - **Solution:** You are likely querying the general supergraph. For document-specific data, ensure you are targeting the drive's endpoint (e.g., `http://localhost:4001/d/<driveId>`) or using queries designed to fetch data from specific drives. Inspect Connect's network activity to see the endpoint it uses for `pushUpdates`.
- **Issue:** Persistent syncing problems or unexpected behavior after trying the above.
  - **Solution:** Consider cleaning the global Powerhouse setup by removing `~/.ph`

</details>

<details id="resetting-your-localhost-environment">
<summary>Resetting Your Localhost Environment</summary>

### How to Reset Your Localhost Environment

---

### Problem statement

You are running Powerhouse locally (via `ph vetra --watch` or `ph connect`), but you can't find your local drive in the interface. Alternatively, you can see the drive or have recreated it, but the `DocumentModel` button is missing, preventing you from creating new document model schemas.

### Prerequisites

- Powerhouse Connect is running locally.
- The Powerhouse Connect interface is open in your browser.

### Solution

This issue is often caused by corrupted or inconsistent data stored in your browser's local storage for the Connect application. Clearing this storage forces a re-initialization of your local environment.

### Step 1: Open Settings

In the bottom-left corner of the Powerhouse Connect UI, click on the "Settings" menu.

### Step 2: Find the Danger Zone

In the settings panel that appears, scroll or navigate to the "Danger Zone" section.

### Step 3: Clear Local Storage

Click the "Clear storage" button. A confirmation prompt may appear. Confirming this action will wipe all application data stored in your browser for your local environment, including the state of your local drive.

### Step 4: Verify the Reset

The application should automatically refresh and re-initialize its state. If it doesn't, manually reload the page. Your local drive should now be present with the `DocumentModel` button restored.

### Expected outcome

- Your local drive is visible again in the Powerhouse Connect UI.
- The `DocumentModel` button is available inside the local drive.
- You can proceed to create and edit document models in your local environment.

### Common issues and solutions

- **Issue**: The problem persists after clearing storage.
  - **Solution**: Try clearing your browser's cache and cookies for the localhost domain. As a last resort, follow the recipe for [Clearing Package Manager Caches](#clearing-package-manager-caches) and reinstalling dependencies.

### Related recipes

- [Troubleshooting Document Syncing](#troubleshooting-document-syncing)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

</details>

<details id="clearing-package-manager-caches">
<summary>Clearing Package Manager Caches</summary>

### How to Clear Package Manager Caches

---

### Problem statement

You are encountering unexpected issues with dependencies, `ph-cmd` installation, or package resolution. Corrupted or outdated caches for your package manager (pnpm, npm, yarn) can often be the cause. Clearing the cache forces the package manager to refetch packages, which can resolve these problems.

### Prerequisites

- Terminal or command prompt access
- A package manager (pnpm, npm, or yarn) installed

### Solution

Choose the commands corresponding to the package manager you are using.

### For pnpm

`pnpm` has a robust set of commands to manage its content-addressable store.

```bash
# Verify the integrity of the cache
pnpm cache verify

# Remove orphaned packages from the store
pnpm store prune
```

### For npm

`npm` provides commands to clean and verify its cache.

```bash
# Verify the contents of the cache folder, which can fix some issues
npm cache verify

# If verification doesn't solve the issue, force clean the cache
npm cache clean --force
```

### For Yarn (v1 Classic)

Yarn Classic allows you to list and clean the cache.

```bash
# List the contents of the cache
yarn cache list

# Clean the cache
yarn cache clean --force
```

### Expected outcome

- The package manager's cache is cleared or verified.
- Subsequent installations will fetch fresh versions of packages, potentially resolving dependency-related errors.
- Your system is in a cleaner state for managing Powerhouse project dependencies.

### Common issues and solutions

- **Issue**: Problems persist after clearing the cache.
  - **Solution**: The issue might not be cache-related. Consider completely removing `node_modules` and lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) and running `pnpm install` (or equivalent) again.

### Related recipes

- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Managing and Updating Powerhouse Dependencies](#managing-and-updating-powerhouse-dependencies)

</details>
