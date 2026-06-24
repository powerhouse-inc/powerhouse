---
toc_max_heading_level: 2
---

# Cookbook

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

- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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

- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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

- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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

- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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

- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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

- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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
- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)

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
- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)
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
- [Powerhouse Builder Tools](/academy/GetStarted/BuilderTools)

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

| Recipe                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Audit Trail](https://github.com/powerhouse-inc/recipes/tree/main/audit-trail)                               | Reactor processor that builds an immutable audit log in PostgreSQL from `ActionSigner` context, with a GraphQL subgraph for querying entries by user, document, or time range. |
| [Batch Progress](https://github.com/powerhouse-inc/recipes/tree/main/batch-progress)                         | Multi-document creation with dependency ordering using `executeBatch` and real-time progress tracking via the EventBus.                                                        |
| [Cross-Document Reactor](https://github.com/powerhouse-inc/recipes/tree/main/cross-document-reactor)         | Event-driven cross-document automation using `ReactorClient` subscriptions to dispatch actions across related documents.                                                       |
| [Custom Read Model](https://github.com/powerhouse-inc/recipes/tree/main/custom-read-model)                   | Custom `IReadModel` registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view.                                                |
| [Discord Webhook Processor](https://github.com/powerhouse-inc/recipes/tree/main/discord-webhook-processor)   | Reactor processor that posts document operations to a Discord channel as rich embeds with automatic batching and HMAC-SHA256 signatures.                                       |
| [Document Snapshot Exporter](https://github.com/powerhouse-inc/recipes/tree/main/document-snapshot-exporter) | CLI tool for reliable read-after-write export of document state and operation history to JSON using Reactor consistency tokens.                                                |
| [Full-Text Search](https://github.com/powerhouse-inc/recipes/tree/main/full-text-search)                     | Reactor processor that indexes document state into a PostgreSQL full-text search table for ranked keyword search across all documents.                                         |
| [Rate Limiter](https://github.com/powerhouse-inc/recipes/tree/main/rate-limiter)                             | Reactor processor paired with an `AuthService` gate to throttle users by signer address using a sliding window.                                                                |
| [Relational DB Subgraph](https://github.com/powerhouse-inc/recipes/tree/main/relational-db-subgraph)         | Complete relational DB processor with Kysely migrations, typed schema, and a GraphQL subgraph for a document catalog.                                                          |
| [Saga](https://github.com/powerhouse-inc/recipes/tree/main/saga)                                             | Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context with re-entrancy guards.                       |
| [Signed Operations Verifier](https://github.com/powerhouse-inc/recipes/tree/main/signed-operations-verifier) | Standalone script that builds document operations with cryptographic signatures and verifies each one, demonstrating tamper detection via `ISigner`.                           |
| [Subscription CLI](https://github.com/powerhouse-inc/recipes/tree/main/subscription-cli)                     | CLI for monitoring Reactor GraphQL subscriptions over WebSocket in real time, printing timestamped events to stdout.                                                           |
| [Sync Health Monitor](https://github.com/powerhouse-inc/recipes/tree/main/sync-health-monitor)               | EventBus-based sync health dashboard with two-reactor sync monitoring and a GraphQL subgraph for metrics.                                                                      |

> See the [recipes repository](https://github.com/powerhouse-inc/recipes) for full source code, setup instructions, and prerequisites.

{/* AUTO-GENERATED-RECIPE-DOCS-START */}
{/* This content is automatically generated by scripts/generate-recipe-docs.ts. Do not edit directly. */}

<details id="recipe-audit-trail">
<summary>Audit Trail</summary>

### Audit Trail

A Reactor processor that inspects `ActionSigner` context on every operation to build an immutable audit log in PostgreSQL. Exposes a GraphQL subgraph for querying entries by user, document, or time range.

#### What it demonstrates

- **Signature/signer inspection** — extracting `user.address`, `networkId`, `chainId`, and app credentials from `operation.action.context.signer`
- **Relational DB processor** — batch-inserting structured rows via Kysely
- **Subgraph resolvers** — GraphQL API over the audit log using graphql-yoga
- **Operation context fields** — using `documentId`, `documentType`, `action.type`, and `timestampUtcMs`

#### Setup

```sh
pnpm install
pnpm build
```

#### Usage

##### Processor

```ts
import { Kysely, PostgresDialect } from "kysely";
import {
  up,
  AuditTrailProcessor,
  createAuditTrailFactory,
} from "@powerhousedao/example-audit-trail";

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
{
  auditByUser(address: "0xabc", limit: 10) {
    actionType
    documentId
    timestamp
  }
}

# By document
{
  auditByDocument(documentId: "doc-1", limit: 10) {
    signerAddress
    actionType
    timestamp
  }
}

# By time range
{
  auditByTimeRange(from: "2025-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z") {
    signerAddress
    actionType
    documentId
  }
}
```

#### Tests

```sh
pnpm test
```

Tests use [PGlite](https://github.com/electric-sql/pglite) for an in-memory PostgreSQL instance.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/audit-trail)

</details>

<details id="recipe-batch-progress">
<summary>Batch Progress</summary>

### Batch Progress

Demonstrates multi-document wizard creation with dependency ordering using Reactor's `executeBatch` and real-time progress tracking via the EventBus.

#### What it shows

A "Create Project" flow that atomically creates 4 documents with dependencies:

```
budget ──┐
          ├──► project ──► drive (add files)
scope  ──┘
```

- **budget** and **scope** create in parallel (no dependencies)
- **project** waits for both budget and scope
- **drive** adds all three as files after project completes

One call, one result, automatic dependency resolution.

##### Without Reactor

```ts
const budget = await createDocument(budgetId, initBudget);
const scope = await createDocument(scopeId, initScope);
// hope nothing interleaves...
const project = await createDocument(projectId, initProject);
await addFilesToDrive(driveId, [budget, scope, project]);
```

Four sequential calls, manual error handling, no atomicity.

##### With Reactor

```ts
await reactor.executeBatch({
  jobs: [
    {
      key: "budget",
      documentId: budgetId,
      actions: [initBudget],
      dependsOn: [],
    },
    { key: "scope", documentId: scopeId, actions: [initScope], dependsOn: [] },
    {
      key: "project",
      documentId: projectId,
      actions: [initProject],
      dependsOn: ["budget", "scope"],
    },
    {
      key: "drive",
      documentId: driveId,
      actions: [addFiles],
      dependsOn: ["project"],
    },
  ],
});
```

One call. Budget and scope run in parallel. Project waits for both. Drive waits for project. The reactor handles ordering, parallelism, and failure propagation.

#### How it works

1. **Embedded Reactor** — spins up an in-memory Reactor (PGlite, no external DB)
2. **Drive creation** — creates a drive document to hold the project files
3. **Batch submission** — submits 4 dependent jobs via `IReactor.executeBatch`
4. **EventBus tracking** — subscribes to `JOB_PENDING`, `JOB_RUNNING`, `JOB_WRITE_READY`, `JOB_READ_READY`, and `JOB_FAILED` events for real-time status updates
5. **Live progress** — renders a multi-bar terminal display showing each job's status

#### Job status lifecycle

```
PENDING → RUNNING → WRITE_READY → READ_READY
                                 ↘ FAILED
```

| Status        | Meaning                                       |
| ------------- | --------------------------------------------- |
| `PENDING`     | Job is queued but not yet started             |
| `RUNNING`     | Job is currently being executed               |
| `WRITE_READY` | Operations written to the operation store     |
| `READ_READY`  | Read models have finished indexing (terminal) |
| `FAILED`      | Job failed (terminal)                         |

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

#### License

AGPL-3.0-only

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/batch-progress)

</details>

<details id="recipe-cross-document-reactor">
<summary>Cross-Document Reactor</summary>

### Cross-Document Reactor

Event-driven cross-document automation using `ReactorClient` subscriptions.

#### What it demonstrates

- **`reactorClient.subscribe()`** — broad subscription watching all document changes
- **Cross-document workflows** — a change on one document triggers an action on a related document
- **`execute()` from within a subscription handler** — the reactor as an event-driven automation engine

#### How it works

1. Creates a drive with two documents: an **invoice** and a **task**, linked by naming convention (`Invoice-001` ↔ `Task-001-Invoice-001`)
2. Subscribes to all document changes with an empty search filter (`{}`)
3. When the invoice is renamed to include `[PAID]`, the subscription handler finds the related task and renames it to include `[CLOSED]`

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

#### License

AGPL-3.0-only

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/cross-document-reactor)

</details>

<details id="recipe-custom-read-model">
<summary>Custom Read Model</summary>

### Custom Read Model

A custom `IReadModel` implementation registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view. Demonstrates the read model lifecycle, the pre-ready guarantee, and how read models differ from processors.

#### How it works

`DocumentCountReadModel` implements `IReadModel` directly — it receives every operation written to the reactor's operation store via `indexOperations()` and increments an in-memory counter keyed by `context.documentType`.

```
Operation written → JOB_WRITE_READY → ReadModelCoordinator
                                        ├── preReady:  DocumentCountReadModel.indexOperations() ← our read model
                                        ├── preReady:  DocumentView, DocumentIndexer (built-in)
                                        ├── emit JOB_READ_READY  ← counts are already up to date here
                                        └── postReady: processors, subscriptions
```

##### Read model vs processor

|              | Read Model (IReadModel)                           | Processor (IProcessor)                        |
| ------------ | ------------------------------------------------- | --------------------------------------------- |
| Phase        | **Pre-ready** — completes before `JOB_READ_READY` | **Post-ready** — runs after `JOB_READ_READY`  |
| Purpose      | Derived views that must be queryable immediately  | Side-effects (webhooks, notifications, sync)  |
| Registration | `ReactorBuilder.withReadModel()`                  | `ProcessorManager.registerFactory()`          |
| Receives     | `OperationWithContext[]` via `indexOperations()`  | `OperationWithContext[]` via `onOperations()` |

##### Why implement IReadModel directly?

`BaseReadModel` provides catch-up/rewind via the `ViewState` table and requires `IOperationIndex`, `IWriteCache`, and `IConsistencyTracker` — useful for persistent read models but unnecessary for a simple in-memory counter. Implementing `IReadModel` directly keeps the example minimal and shows the core contract.

##### buildModule() internals

`ReactorBuilder.buildModule()` returns a `ReactorModule` with direct access to the event bus, database, operation store, and other internals — useful for advanced integration, testing, or custom wiring.

#### Architecture

| Module                             | Purpose                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/document-count-read-model.ts` | `DocumentCountReadModel` — the `IReadModel` implementation                                      |
| `src/index.ts`                     | Demo: builds a reactor, creates a document, shows the read model counts inside `JOB_READ_READY` |

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
  .withDocumentModels([
    /* your models */
  ])
  .withReadModel(countReadModel)
  .buildModule();

// After any job completes, counts are already up to date:
reactorModule.eventBus.subscribe(ReactorEventTypes.JOB_READ_READY, () => {
  console.log(countReadModel.getCounts());
});
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

#### Exports

```ts
export { DocumentCountReadModel } from "./src/document-count-read-model.js";
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/custom-read-model)

</details>

<details id="recipe-discord-webhook-processor">
<summary>Discord Webhook Processor</summary>

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

<details id="recipe-document-snapshot-exporter">
<summary>Document Snapshot Exporter</summary>

### Document Snapshot Exporter

CLI tool that exports document state and operation history to JSON files, demonstrating reliable read-after-write consistency using the Reactor API.

#### What it demonstrates

- **IReactor API** — low-level interface where mutations return `JobInfo` with consistency tokens
- **Consistency tokens** — passed to reads (`reactor.get()`, `reactor.getOperations()`) to guarantee the read reflects prior writes
- **OperationFilter** — filtering operations by action type, timestamp range, or revision
- **IReactor vs IReactorClient** — run with `--mode reactor` or `--mode client` to compare the two APIs side by side

##### IReactor vs IReactorClient

|                           | IReactor                                         | IReactorClient                        |
| ------------------------- | ------------------------------------------------ | ------------------------------------- |
| Mutations return          | `JobInfo` (must await manually)                  | The document (job awaited internally) |
| Consistency               | You pass `ConsistencyToken` to reads             | Managed automatically                 |
| Signing                   | Manual (pass `ISigner` to each call)             | Automatic via configured signer       |
| `getOperations()` returns | `Record<string, PagedResults>` (per-scope)       | `PagedResults` (flat)                 |
| Use when                  | You need fine-grained control over job lifecycle | You want a simpler, higher-level API  |

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

<details id="recipe-full-text-search">
<summary>Full-Text Search</summary>

### Full-Text Search Processor

A Reactor `IProcessor` that indexes document state into a PostgreSQL full-text search table, enabling ranked keyword search across all documents managed by a Reactor instance.

#### How it works

When operations arrive, the processor:

1. Collects the last operation per document (earlier states are superseded).
2. Flattens the resulting document state into a single searchable string via `flattenToSearchableText`.
3. Upserts a row in `search_index` with the content and a PostgreSQL `tsvector`.
4. Handles `DELETE_DOCUMENT` actions by removing the corresponding row.

#### Architecture

| Module          | Purpose                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `processor.ts`  | `SearchProcessor` — the `IProcessor` implementation                                  |
| `schema.ts`     | Kysely type definitions for the `search_index` table                                 |
| `migrations.ts` | `up` / `down` functions to create/drop the table and GIN index                       |
| `query.ts`      | `createSearchQuery` — returns a `search(term, limit?)` helper using `ts_rank`        |
| `utils.ts`      | `flattenToSearchableText` — recursively extracts all string values from a JSON state |

#### Prerequisites

- PostgreSQL with full-text search support (`tsvector`, `plainto_tsquery`, `ts_rank`)
- [Kysely](https://kysely.dev/) database instance

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

##### Query the index

```ts
import { createSearchQuery } from "@powerhousedao/example-full-text-search";

const search = createSearchQuery(db);
const results = await search.search("budget allocation", 10);
// returns: [{ document_id, document_type, title, rank }]
```

#### Exports

```ts
export { SearchProcessor } from "./processor.js";
export { createSearchQuery } from "./query.js";
export type { SearchResult } from "./query.js";
export type { SearchDB, SearchIndex } from "./schema.js";
export { flattenToSearchableText } from "./utils.js";
export { up, down } from "./migrations.js";
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/full-text-search)

</details>

<details id="recipe-rate-limiter">
<summary>Rate Limiter</summary>

### Rate Limiter

A Reactor `IProcessor` paired with an `AuthService` gate to throttle users by signer address, preventing any single user from overwhelming the system with excessive operations.

#### How it works

The recipe has two components that form a feedback loop:

1. **`RateLimiterProcessor`** sits inside the Reactor and observes every operation. It extracts the signer address from `operation.action.context.signer.user.address`, counts operations per user within a sliding time window, and calls `authService.cooldown()` when a user exceeds the threshold. The processor never throws — it only signals.

2. **`AuthService`** sits in front of the Reactor (e.g. in a GraphQL resolver or HTTP middleware). Before forwarding a mutation, the caller checks `authService.isAllowed(address)`. If the user is on cooldown, the response includes `retryAfterMs` so the client knows when to retry.

```
Client → [AuthService gate] → Reactor → RateLimiterProcessor → authService.cooldown()
              ↑                                                        |
              └────────────────────────────────────────────────────────┘
```

Operations without a signer are silently skipped. Counters are in-memory and reset on processor disconnect or restart.

#### Architecture

| Module                          | Purpose                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/auth-service.ts`           | `AuthService` — in-memory cooldown gate with `cooldown()`, `isAllowed()`, and `getCooldownRemaining()` |
| `src/rate-limiter-processor.ts` | `RateLimiterProcessor` — the `IProcessor` implementation; also exports `createRateLimiterFactory`      |

#### Configuration

| Option          | Type              | Description                                                                       |
| --------------- | ----------------- | --------------------------------------------------------------------------------- |
| `maxOperations` | `number`          | Maximum operations allowed per user within the time window                        |
| `windowMs`      | `number`          | Length of the sliding time window in milliseconds                                 |
| `cooldownMs`    | `number`          | How long a user is blocked after exceeding the limit                              |
| `filter`        | `ProcessorFilter` | Which operations the processor subscribes to (document type, scope, branch, etc.) |

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
    windowMs: 60_000, // 1-minute window
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

##### Check cooldown status

```ts
const remainingMs = authService.getCooldownRemaining(userAddress);
```

#### Exports

```ts
export { AuthService } from "./src/auth-service.js";
export type { AuthCheckResult } from "./src/auth-service.js";
export {
  RateLimiterProcessor,
  createRateLimiterFactory,
} from "./src/rate-limiter-processor.js";
export type { RateLimiterConfig } from "./src/rate-limiter-processor.js";
```

#### Tests

```sh
pnpm test
```

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/rate-limiter)

</details>

<details id="recipe-relational-db-subgraph">
<summary>Relational DB Subgraph</summary>

### Relational DB Subgraph

A complete relational DB processor recipe demonstrating the academy flagship tutorial pattern:

- **RelationalDbProcessor** — extends the base class with `initAndUpgrade()`, namespaced DB, and type-safe `query` builder
- **Kysely migrations** — up/down migrations creating `documents` and `document_tags` tables
- **Typed schema** — full Kysely DB interface with `CatalogDB`, `DocumentRow`, and `DocumentTagRow`
- **Type-safe queries** — Kysely query layer with joins, filtering by type/tag, and pagination
- **GraphQL subgraph** — graphql-yoga server exposing the catalog data, ready for supergraph composition

#### What it does

The `CatalogProcessor` watches all documents flowing through the Reactor (document-type-agnostic) and maintains a denormalized relational view:

- **`documents`** table — stores document metadata (ID, type, name, content summary, revision)
- **`document_tags`** table — stores tags extracted from document state

The GraphQL subgraph exposes this data via queries like `documents`, `document(id)`, `documentsByType`, and `documentsByTag`.

#### Mapping to `ph generate`

| Generated artifact        | File in this recipe                                                              |
| ------------------------- | -------------------------------------------------------------------------------- |
| `ph generate --processor` | `src/processor.ts` — `CatalogProcessor extends RelationalDbProcessor<CatalogDB>` |
| `ph generate --subgraph`  | `src/subgraph.ts` — GraphQL SDL + resolvers backed by the query layer            |
| Schema types              | `src/schema.ts` — Kysely DB interface                                            |
| Migrations                | `src/migrations.ts` — `up()`/`down()` functions                                  |
| Query layer               | `src/query.ts` — type-safe Kysely queries with joins                             |

#### Usage

```ts
import { Kysely } from "kysely";
import { createRelationalDb } from "@powerhousedao/reactor";
import {
  CatalogProcessor,
  startCatalogServer,
} from "@powerhousedao/example-relational-db-subgraph";

// 1. Create a Kysely instance (PGlite, PostgreSQL, etc.)
const db = new Kysely<CatalogDB>({ dialect });
const relationalDb = createRelationalDb(db);

// 2. Create and initialize the processor
const processor = new CatalogProcessor(
  "catalog",
  { branch: ["main"] },
  relationalDb,
);
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

This subgraph can be composed into a supergraph alongside other subgraphs (e.g., the Reactor's built-in GraphQL endpoint). With a gateway like Apollo Router or GraphQL Mesh, you can query documents from the catalog and other sources in a single request.

#### Running tests

```sh
pnpm test
```

Tests use PGlite (embedded PostgreSQL) — no external database required.

#### License

AGPL-3.0-only

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/relational-db-subgraph)

</details>

<details id="recipe-saga">
<summary>Saga</summary>

### Saga

Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context.

#### What it demonstrates

- **`IProcessor` as a saga coordinator** — a processor that reacts to operations and dispatches follow-up actions on other documents
- **Saga correlation via DB** — a `saga_id` ties every step together, tracked entirely in the processor's own table (no changes to document interfaces)
- **`IReactor.execute()` from within a processor** — the processor dispatches actions to other documents in response to incoming operations
- **Re-entrancy guard** — prevents the processor from reacting to its own dispatched operations

#### How it works

1. Creates a drive with three documents: **Order-001**, **Payment-001**, and **Fulfillment-001**
2. Registers a `SagaProcessor` with step definitions that form a chain:
   - `Order-001 [CREATED]` &rarr; dispatches rename on Payment to `Payment-001 [REQUESTED]`
   - `Payment-001 [REQUESTED]` &rarr; dispatches rename on Fulfillment to `Fulfillment-001 [STARTED]`
   - `Fulfillment-001 [STARTED]` &rarr; dispatches rename on Order to `Order-001 [FULFILLED]`
3. Triggering the saga by renaming the order document cascades through all three steps
4. The saga log table records every step with a shared `saga_id` for traceability

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

#### License

AGPL-3.0-only

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/saga)

</details>

<details id="recipe-signed-operations-verifier">
<summary>Signed Operations Verifier</summary>

### Signed Operations Verifier

A standalone script that builds a document operation history with cryptographic signatures, then verifies each one. Demonstrates detection of unsigned and tampered operations, plus signer identity chain extraction.

#### What it demonstrates

- **`ISigner` interface** via `RenownCryptoSigner` from `@renown/sdk`
- **`RenownCryptoSigner`** construction using `MemoryKeyStorage` + `RenownCryptoBuilder` (no filesystem or network needed)
- **`verifyOperationSignature()`** — low-level per-signature verification with a custom `ActionVerificationHandler`
- **`createSignatureVerifier()`** — higher-level operation verifier from `@renown/sdk`
- **`validateHeader()`** — document header signature validation
- **Signature tuple structure** — `[timestamp, publicKey, actionHash, prevStateHash, signature]`
- **Signer identity chain** — user address/networkId/chainId + app name/key

#### Run

```bash
pnpm install
pnpm --filter @powerhousedao/example-signed-operations-verifier test
```

#### Key APIs

| Import                | API                          | Purpose                                        |
| --------------------- | ---------------------------- | ---------------------------------------------- |
| `document-model/core` | `verifyOperationSignature()` | Verify a single signature tuple                |
| `document-model/core` | `buildSignedAction()`        | Create a signed operation from an action       |
| `document-model/core` | `actionSigner()`             | Construct an `ActionSigner` with identity info |
| `@renown/sdk/node`    | `RenownCryptoSigner`         | `ISigner` implementation using ECDSA P-256     |
| `@renown/sdk/node`    | `RenownCryptoBuilder`        | Builder for the underlying crypto engine       |
| `@renown/sdk/node`    | `MemoryKeyStorage`           | In-memory key pair storage for demos           |
| `@renown/sdk/node`    | `createSignatureVerifier()`  | Higher-level full-operation verifier           |

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/signed-operations-verifier)

</details>

<details id="recipe-subscription-cli">
<summary>Subscription CLI</summary>

### Subscription CLI

A standalone CLI for monitoring Powerhouse Reactor GraphQL subscriptions over WebSocket in real time.

Subscribes to `documentChanges` and optionally `jobChanges`, printing timestamped events to stdout. Useful for debugging, integration testing, and observing Reactor activity.

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

| Flag               | Description                                            | Default                                     |
| ------------------ | ------------------------------------------------------ | ------------------------------------------- |
| `--url <url>`      | WebSocket endpoint                                     | `ws://localhost:4001/graphql/subscriptions` |
| `--type <type>`    | Filter `documentChanges` by document type              | _(none)_                                    |
| `--parent-id <id>` | Filter `documentChanges` by parent document (drive) ID | _(none)_                                    |
| `--job-id <id>`    | Also subscribe to `jobChanges` for a specific job      | _(none)_                                    |
| `--auth <token>`   | Bearer token for authentication                        | _(none)_                                    |
| `--help`           | Show help message                                      |                                             |

#### Example output

```
[12:34:56.789] Connecting to ws://localhost:4001/graphql/subscriptions...
[12:34:56.801] Connected
[12:34:56.802] Subscribing to documentChanges (type: powerhouse/billing-statement)...
[12:34:56.803] Listening for events. Press Ctrl+C to stop.
[12:34:58.100] documentChanges [UPDATE] Invoice Q1 (powerhouse/billing-statement)
```

Press `Ctrl+C` for clean shutdown.

[View source on GitHub →](https://github.com/powerhouse-inc/recipes/tree/main/subscription-cli)

</details>

<details id="recipe-sync-health-monitor">
<summary>Sync Health Monitor</summary>

### Sync Health Monitor

Subscribes to `SyncEventTypes` on the Reactor EventBus and maintains a live health dashboard. Exposes metrics via a GraphQL subgraph.

#### What it shows

- **EventBus subscriptions** — listens to all five sync event types (`SYNC_PENDING`, `SYNC_SUCCEEDED`, `SYNC_FAILED`, `DEAD_LETTER_ADDED`, `CONNECTION_STATE_CHANGED`)
- **ReactorModule internals** — accesses `eventBus` and `syncModule` from the built `ReactorModule`
- **Two-reactor sync** — wires two embedded reactors via a custom `InternalChannel` (no network, direct in-process delivery)
- **GraphQL subgraph** — serves a `syncHealth` query with counters, connection states, and recent errors
- **Live dashboard** — refreshing terminal display with health status, sync counters, and connection states

#### How it works

1. **Two embedded reactors** — builds reactor A and reactor B, each with in-memory PGlite
2. **Internal channels** — a shared `IChannelFactory` creates `InternalChannel` pairs that deliver operations directly between reactors
3. **Health monitor** — subscribes to reactor A's `EventBus` for all `SyncEventTypes`, maintains counters and connection state
4. **GraphQL server** — serves the health metrics via a `syncHealth` query on `http://localhost:4001/graphql`
5. **Demo scenario** — runs through four phases: normal sync, connection state changes, simulated failure, and recovery

##### Demo phases

| Phase            | What happens                                   | Events fired                                       |
| ---------------- | ---------------------------------------------- | -------------------------------------------------- |
| Normal sync      | Create a document on A, syncs to B             | `SYNC_PENDING`, `SYNC_SUCCEEDED`                   |
| Connection issue | Simulate disconnect → reconnect on the channel | `CONNECTION_STATE_CHANGED` (x3)                    |
| Failure          | Make the channel throw, then create a document | `SYNC_PENDING`, `SYNC_FAILED`, `DEAD_LETTER_ADDED` |
| Recovery         | Restore the channel, create another document   | `SYNC_PENDING`, `SYNC_SUCCEEDED`                   |

##### Health status logic

| Status      | Condition                                                                               |
| ----------- | --------------------------------------------------------------------------------------- |
| `healthy`   | All connections up, low failure ratio, no dead letters                                  |
| `degraded`  | A connection is disconnected/reconnecting, failure ratio &gt;10%, or dead letters exist |
| `unhealthy` | Any connection is in `error` state                                                      |

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

#### License

AGPL-3.0-only

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
