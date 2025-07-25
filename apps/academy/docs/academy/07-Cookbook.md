# Cookbook

## Powerhouse CLI recipes
This section covers recipes related to the `ph-cmd`, the command-line tool for Powerhouse project initialization, code generation, package management, and running local development environments.

<details id="installing-ph-cmd">
<summary>Installing 'ph-cmd'</summary>

## How to install Powerhouse CLI
---

## Problem statement
You need to install the Powerhouse CLI (`ph-cmd`) to create and manage Powerhouse projects.

## Prerequisites
- node.js 22 installed
- pnpm package manager 10 installed
- Terminal or command prompt access

## Solution

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

## Expected outcome
- Powerhouse CLI (`ph-cmd`) installed globally on your system
- Access to all Powerhouse CLI commands for project creation and management

## Common issues and solutions
- Issue: Permission errors during installation
  - Solution: Use `sudo` on Unix-based systems or run as administrator on Windows
- Issue: Version conflicts
  - Solution: Clean your system using the uninstallation recipe before installing a new version

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
</details>

<details id="uninstalling-ph-cmd">
<summary>Uninstalling 'ph-cmd'</summary>

## How to uninstall Powerhouse CLI
---

## Problem statement
You want to perform a clean installation of the Powerhouse CLI.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A terminal or IDE

## Solution

### Step 1: Uninstall `ph-cmd`
```bash
pnpm uninstall -g ph-cmd   
```

### Step 2: Remove the global setups folder 
```bash
rm -rf ~/.ph 
```

## Expected outcome
- Your system should now be clean from the Powerhouse CLI

## Common issues and solutions
- Issue: Outdated version
  - Solution: Uninstall and reinstall the Powerhouse CLI

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
- [Create A New Powerhouse Project](/academy/GetStarted/CreateNewPowerhouseProject)
</details>

<details id="setting-up-or-resetting-the-global-powerhouse-configuration">
<summary>Setting up or Resetting the Global Powerhouse Configuration</summary>

## How to set up or reset the global Powerhouse configuration
---

## Problem statement
You need to initialize the global Powerhouse configuration for the first time, or reset it to resolve issues or start fresh. This might also involve switching to a specific dependency environment like staging.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- Terminal or command prompt access

## Solution

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

## Expected outcome
- A `~/.ph` directory is created or reset.
- The global project is configured, potentially using the specified environment (e.g., staging).
- You are ready to initialize or work with Powerhouse projects using the defined global settings.

## Common issues and solutions
- Issue: Commands fail after removing `~/.ph`.
  - Solution: Ensure you run `ph setup-globals` afterwards.
- Issue: Need to use specific local dependencies globally.
  - Solution: Use `ph use local /path/to/local/packages`.

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Using Different Branches in Powerhouse](#using-different-branches-in-powerhouse)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
- [GraphQL Schema Best Practices](/academy/MasteryTrack/WorkWithData/GraphQLAtPowerhouse)
</details>

<details id="using-different-branches-in-powerhouse">
<summary>Using Different Branches in Powerhouse</summary>

## How to use different branches in Powerhouse
---

## Problem statement
You need to access experimental features, bugfixes, or development versions of Powerhouse components that aren't yet available in the stable release.

## Prerequisites
- Terminal or command prompt access
- pnpm package manager 10 installed
- Node.js 22 installed

## Solution

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

## Expected outcome
- Access to the specified version of Powerhouse components
- Ability to test experimental features or bugfixes
- Project configured with the chosen branch's dependencies

## Common issues and solutions
- Issue: Experimental features not working as expected
  - Solution: This is normal as these versions may contain untested features. Consider switching back to stable versions if issues persist.
- Issue: Version conflicts between components
  - Solution: Ensure all components are using the same branch version. Use `ph use` commands to synchronize versions.

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- Updating Your Powerhouse Project Dependencies
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
</details>

<details id="using-different-package-managers-with-powerhouse">
<summary>Using Different Package Managers with Powerhouse</summary>

## How to use different package managers with Powerhouse
---

## Problem statement
You want to use a different package manager (npm, yarn, or bun) instead of pnpm for managing Powerhouse projects and dependencies.

## Prerequisites
- Node.js 22 installed
- Your preferred package manager installed (npm, yarn, or bun)
- Terminal or command prompt access

## Solution

### Step 1: Install the CLI with Your Preferred Package Manager
Choose the appropriate installation command based on your package manager:

```bash
# Using npm
npm install -g ph-cmd

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

## Expected outcome
- Powerhouse CLI installed and accessible through your preferred package manager
- Ability to manage Powerhouse projects using your chosen package manager
- Proper PATH configuration for global binaries

## Common issues and solutions
- Issue: Command not found after installation
  - Solution: Ensure the global binary directory is in your PATH (especially for yarn and bun)
  - Solution: Try running the command with the full path to verify installation
- Issue: Permission errors during installation
  - Solution: Use `sudo` on Unix-based systems or run as administrator on Windows
- Issue: Package manager conflicts
  - Solution: Stick to one package manager per project to avoid lockfile conflicts

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
- [Yarn Global Installation Guide](https://classic.yarnpkg.com/lang/en/docs/cli/global/)
- [Bun Installation Guide](https://bun.sh/docs/installation#how-to-add-your-path)
</details>

## Powerhouse Environment recipes
This section covers recipes for setting up and managing Powerhouse environments, from local development to production servers.

<details id="setting-up-a-production-environment">
<summary>Setting up a Production Environment</summary>

## How to set up a Production Powerhouse Environment
---

## Problem statement
You need to set up a new production-ready server to host and run your Powerhouse services (Connect and Switchboard).

## Prerequisites
- A Linux-based server (Ubuntu or Debian recommended) with `sudo` privileges.
- A registered domain name.
- DNS `A` records for your `connect` and `switchboard` subdomains pointing to your server's public IP address.

## Solution

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
-   **Packages to install:** You can pre-install any Powerhouse packages you need. (Optional)
-   **Database:** Choose between a local PostgreSQL setup or connecting to a remote database.
-   **SSL Certificate:** Select Let's Encrypt for a production setup. You will need to provide your domain and subdomains.

## Expected outcome
- Powerhouse Connect and Switchboard services are installed, configured, and running on your server.
- Nginx is set up as a reverse proxy with SSL certificates from Let's Encrypt.
- Services are managed by PM2 and will restart automatically on boot or if they crash.
- You can access your services securely at `https://connect.yourdomain.com` and `https://switchboard.yourdomain.com`.

## Common issues and solutions
- **Issue:** `ph: command not found`
  - **Solution:** Ensure you have reloaded your shell with `source ~/.bashrc` or have restarted your terminal session.
- **Issue:** Let's Encrypt SSL certificate creation fails.
  - **Solution:** Verify that your domain's DNS records have fully propagated and are pointing to the correct server IP. This can take some time.
- **Issue:** Services fail to start.
  - **Solution:** Check the service logs for errors using `ph service logs` or `pm2 logs`.

## Related recipes
- [Installing a Custom Powerhouse Package](#installing-a-custom-powerhouse-package)

## Further reading
- [Full Setup Guide](/academy/MasteryTrack/Launch/SetupEnvironment)
</details>

## Powerhouse Project recipes
This section focuses on creating, configuring, and managing Powerhouse projects, which are collections of document models, editors, and other resources.

<details id="initializing-a-new-project-and-document-model">
<summary>Initializing a New Project & Document Model</summary>

## How to initialize a new project and document model
---

## Problem statement
You need to create a new, empty document model within a Powerhouse project using the local Connect application (Studio mode) to represent a workflow of a business process.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (see [Initializing a Powerhouse Project Recipe](#powerhouse-cli-recipes)) or follow Step 1 & 2 below.
- Access to a terminal or command prompt
- A web browser

## Solution

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

### Step 3: Start the Local Connect Application
Run the `connect` command to start the local development environment:
```bash
ph connect
```
Wait for the output indicating the server is running (e.g., `Local: http://localhost:3000/`).

### Step 4: Open Connect in Browser
A browser window should open automatically to `http://localhost:3000/`. If not, navigate there manually.

### Step 5: Access Your Local Drive
Click on your local drive displayed on the Connect interface.

### Step 6: Create the Document Model
In the "New Document" section at the bottom of the page, click the `DocumentModel` button.

## Expected outcome
- An empty document model is created and opened in the Document Model Editor within the Connect application.
- You are ready to start defining the schema and logic for your new model.

## Common issues and solutions
- Issue: `ph connect` command fails.
  - Solution: Ensure `ph-cmd` is installed correctly (`ph-cmd --version`). Check for port conflicts if `3000` is already in use. Make sure you are inside the project directory created by `ph init`.
- Issue: Browser window doesn't open automatically.
  - Solution: Manually open `http://localhost:3000/` in your browser.
- Issue: Cannot find the `DocumentModel` button.
  - Solution: Ensure you have navigated into your local drive within the Connect application first.

## Related recipes
- [Initializing a Powerhouse Project](#powerhouse-cli-recipes)
- Designing a Document Model Schema (WIP)
- Implementing Document Model Reducers (Details to be added)

## Further reading
- [GraphQL Schema Best Practices](/academy/MasteryTrack/WorkWithData/GraphQLAtPowerhouse)
</details>

<details id="generating-reducers-from-a-document-model-file">
<summary>Generating Reducers from a Document Model File</summary>

## How to Generate Reducers from a Document Model File
---

## Problem statement
You have a Powerhouse Document Model defined in a `.phdm` or `.phdm.zip` file and need to generate the corresponding reducer functions for your project.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- A `.phdm` or `.phdm.zip` file containing your document model definition, placed in your project (e.g., at the root).

## Solution

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

## Expected outcome
- Reducer functions corresponding to the operations defined in your document model are generated.
- The generated code is ready to be integrated into your project's state management logic.

## Common issues and solutions


## Related recipes
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)
- Generating a Document Editor

</details>

<details id="updating-your-powerhouse-project-dependencies">
<summary>Updating Your Powerhouse Project Dependencies</summary>

## How to Update Your Powerhouse Project Dependencies
---

## Problem statement
The update command allows you to update your Powerhouse dependencies to their latest versions based on the version ranges specified in your package.json.

```bash
ph update [options]
```

**Examples**
#### Update dependencies based on package.json ranges
```bash
ph update
```

#### Force update to latest dev versions
```bash
ph update --force dev
```

#### Force update to latest stable versions
```bash
ph update --force prod
```

#### Use a specific package manager
```bash
ph update --package-manager pnpm
```
</details>

<details id="running-connect-with-https-and-a-custom-port">
<summary>Running Connect with HTTPS and a Custom Port</summary>

## How to Run Connect with HTTPS and a Custom Port
---

## Problem statement
You need to run the local Powerhouse Connect application using HTTPS, possibly on a different port than the default, for scenarios like testing on a remote server (e.g., EC2) or complying with specific network requirements.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- Potentially, valid SSL/TLS certificates if running in a non-localhost environment that requires trusted HTTPS. (The `--https` flag may use self-signed certificates for local development).

## Solution

### Step 1: Navigate to Project Directory
Ensure your terminal is in the root directory of your Powerhouse project.
```bash
cd <yourprojectname>
```

### Step 2: Run Connect with Flags
Execute the `ph connect` command, adding the `--https` flag to enable HTTPS and the `--port` flag followed by the desired port number.
```bash
# Example using port 8442
ph connect --port 8442 --https
```

### Step 3: Access Connect
Open your web browser and navigate to the specified address. Remember to use `https` and include the custom port.
```
https://<your-hostname-or-ip>:<port>
# Example: https://localhost:8442
# Example: https://my-ec2-instance-ip:8442
```
You might encounter a browser warning about the self-signed certificate; you may need to accept the risk to proceed for local/development testing.

## Expected outcome
- The Powerhouse Connect application starts and serves traffic over HTTPS on the specified port.
- You can access the Connect interface securely using the `https` protocol.

## Common issues and solutions
- Issue: Browser shows security warnings (e.g., "Your connection is not private").
  - Solution: This is expected when using the default self-signed certificate generated by `--https`. For development or internal testing, you can usually proceed by accepting the risk. For production or public-facing scenarios, configure Connect with properly signed certificates (consult Powerhouse documentation for advanced configuration).
- Issue: Port conflict (e.g., `"Port <port> is already in use"`).
  - Solution: Choose a different port number that is not currently occupied by another application.
- Issue: Cannot access Connect from a remote machine.
  - Solution: Ensure the port is open in any firewalls (on the server and potentially network firewalls). Verify you are using the correct public IP address or hostname of the machine running Connect.

## Related recipes
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
- [GraphQL Schema Best Practices](/academy/MasteryTrack/WorkWithData/GraphQLAtPowerhouse)
</details>


## Document & Drive Editor recipes
This section provides guidance on generating and customizing editors for Document Models and custom interfaces for Drives.

<details id="generating-a-document-editor">
<summary>Generating a Document Editor</summary>

## How to Generate a Document Editor
---

## Problem statement
You have a Powerhouse document model and need to create a user interface (editor) for it to be used within the Connect application.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- A document model generated or defined within the project (e.g., in the `document-models` directory).

## Solution

### Step 1: Navigate to Project Directory
Ensure your terminal is in the root directory of your Powerhouse project.
```bash
cd <yourprojectname>
```

### Step 2: Generate the Editor Template
Run the `generate` command, specifying the editor name (usually matching the document model name) and the associated document type.

```bash
# Replace <ModelName> with the name of your document model (e.g., To-do List)
# Replace <docType> with the identifier for your document (e.g., powerhouse/todolist)
ph generate --editor <ModelName> --document-types <docType>
```

## Expected outcome
- A new directory is created under `editors/` (e.g., `editors/<model-name>/`).
- An `editor.tsx` file is generated within that directory, containing a basic template for your document editor.
- You can now customize `editor.tsx` to build your desired UI using HTML, Tailwind CSS, or custom CSS.

## Related recipes
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)
- [Generating a Custom Drive Explorer](#generating-a-custom-drive-explorer)

## Further reading
- [Build a Todo-list Editor](/academy/GetStarted/BuildToDoListEditor)
</details>

<details id="generating-a-custom-drive-explorer">
<summary>Generating a Custom Drive Explorer</summary>

## How to Generate a Custom Drive Explorer
---

## Problem statement
You need a custom, application-like interface to browse, organize, or interact with specific types of documents stored within a Powerhouse drive, going beyond the standard file listing.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)

## Solution

### Step 1: Navigate to Project Directory
Ensure your terminal is in the root directory of your Powerhouse project.
```bash
cd <yourprojectname>
```

### Step 2: Generate the Drive Explorer Template
Run the `generate` command, specifying the `--drive-editor` flag and a name for your drive explorer application.

```bash
# Replace <drive-app-name> with a suitable name for your drive explorer (e.g., todo-drive-explorer)
ph generate --drive-editor <drive-app-name>
```

## Expected outcome
- A new directory is created under `editors/` (e.g., `editors/<drive-app-name>/`).
- Template files (`EditorContainer.tsx`, components, hooks, etc.) are generated within that directory, providing a basic structure for a drive explorer.
- You can now customize these files to create your specific drive interface, potentially removing default components and adding custom views relevant to your document models.
- Remember to update your `powerhouse.manifest.json` to register the new app.

## Related recipes
- [Generating a Document Editor](#generating-a-document-editor)

## Further reading
- [Build a Drive-Explorer](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer)
</details>

<details id="adding-a-new-drive-via-graphql-mutation">
<summary>Adding a New Drive via GraphQL Mutation</summary>

## How to Add a New Remote Drive via GraphQL Mutation
---

## Problem statement
You want to programmatically add a new remote drive to your Powerhouse Connect environment using a GraphQL mutation. This is useful for automation, scripting, or integrating with external systems.

## Prerequisites
- Access to the Switchboard or remote reactor (server node) of your Connect instance.
- The GraphQL endpoint for your instance (e.g., `https://staging.switchboard.phd/graphql/system`).
- Appropriate permissions to perform mutations.

## Solution

### Step 1: Access the GraphQL Playground or Client
Open the GraphQL Playground at your endpoint (e.g., [https://staging.switchboard.phd/graphql/system](https://staging.switchboard.phd/graphql/system)), or use a GraphQL client of your choice.

### Step 2: Prepare the Mutation
Use the following mutation to create a new drive, set a name and add a drive icon. Weither or not you define a ID & Slug is up to you:

```graphql
mutation Mutation($name: String!, $icon: String, $addDriveId: String, $slug: String) {
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

## Expected outcome
- A new drive is created and accessible in your Connect environment.
- The drive can be managed or accessed using the generated URL.

## Related recipes
- [Configuring Drives](/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

## Further reading
- [GraphQL Playground](https://www.apollographql.com/docs/apollo-server/testing/graphql-playground/)
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)

</details>


## Reactor recipes
Learn how to manage the Powerhouse Reactor, the local service for processing document model operations and state.

<details id="starting-the-reactor">
<summary>Starting the Reactor</summary>

## How to Start the Powerhouse Reactor
---

## Problem statement
You need to start the Powerhouse Reactor, the local service responsible for processing document model operations and managing state, typically for testing or development purposes.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- You are in the root directory of your Powerhouse project.

## Solution

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

## Expected outcome
- The Reactor service starts, typically listening on `localhost:4001`.
- You will see log output indicating the reactor is running and ready to process operations.
- A GraphQL endpoint is usually available at `http://localhost:4001/graphql` for direct interaction and testing.

## Common issues and solutions
- Issue: Reactor fails to start, mentioning port conflicts.
  - Solution: Ensure port `4001` (or the configured reactor port) is not already in use by another application. Stop the conflicting application or configure the reactor to use a different port (if possible, check documentation).
- Issue: Errors related to storage or configuration.
  - Solution: Check the `powerhouse.manifest.json` and any reactor-specific configuration files for errors. Ensure storage providers (like local disk) are accessible and configured correctly.

## Related recipes
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)
- Testing with GraphQL (Details to be added)

</details>

## Package Development recipes
These recipes guide you through creating, installing, and managing Powerhouse Packages, which are reusable collections of document models and editors.

<details id="installing-a-custom-powerhouse-package">
<summary>Installing a Custom Powerhouse Package</summary>

## How to Install a Custom Powerhouse Package
---

## Problem statement
You have developed and published a Powerhouse package (containing document models, editors, etc.) to npm, or you have a local package, and you need to install it into another Powerhouse project.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`) where you want to install the package.
- The custom package is either published to npm or available locally.

## Solution

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
Check your project's `package.json` and `powerhouse.manifest.json` to ensure the package dependency has been added correctly. Run `ph connect` to see if the components from the installed package are available.

## Expected outcome
- The custom Powerhouse package is downloaded and installed into your project's dependencies.
- The `powerhouse.manifest.json` is updated (if necessary) to reflect the installed package.
- Document models, editors, drive explorers, or other components from the package become available within the target project.

## Common issues and solutions
- Issue: Package not found (npm).
  - Solution: Double-check the package name for typos. Ensure the package is published and accessible on npm.
- Issue: Path not found (local).
  - Solution: Verify the relative or absolute path to the local package directory is correct.
- Issue: Conflicts with existing project components or dependencies.
  - Solution: Resolve version conflicts or naming collisions as needed. Review the installed package's structure and dependencies.

## Related recipes
- [Publishing a Powerhouse Package](#publishing-a-powerhouse-package)
- [Initializing a Powerhouse Project](#initializing-a-new-project-and-document-model)

</details>

<details id="managing-powerhouse-dependencies-and-versions">
<summary>Managing Powerhouse Dependencies and Versions</summary>

## How to Manage Powerhouse Dependencies and Versions
---
> **Note:** This is a temporary solution until version control is fully implemented in Powerhouse. Future updates may change how dependencies are managed.

## Problem statement
You need to understand and manage different types of dependencies in your Powerhouse project, including:
- Monorepo dependencies (from the Powerhouse core repository)
- Project-specific dependencies (from published npm packages)
- Boilerplate dependencies

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed
- A Powerhouse project initialized (`ph init`)
- npm account (if you need to publish packages)

## Solution

### Understanding Different Types of Dependencies

1. **Monorepo Dependencies**
   - The Powerhouse monorepo has three main branches:
     - `main` (stable)
     - `dev` (development)
     - `staging` (pre-release)
   - You can use these branches by:
     ```bash
     # Install dev version of CLI
     pnpm install -g ph-cmd@dev
     
     # Initialize project with dev dependencies
     ph init --dev
     ```

2. **Project Dependencies**
   - These are dependencies from published npm packages
   - Update them using:
     ```bash
     # Update to latest stable versions
     ph use
     
     # Update to development versions
     ph use dev
     
     # Update to production versions
     ph use prod
     ```

3. **Publishing Updated Dependencies**
   - If you make changes to dependencies, you need to:
     1. Update the dependencies in your project
     2. Publish the updated package to npm
     3. Other projects will then get the new version when they run `ph install`

### Important Notes

1. **Breaking Changes**
   - Currently, updating Connect versions might break older packages
   - Always test thoroughly after updating dependencies
   - Consider publishing to a private npm registry for testing

2. **Local Development**
   - Using `ph use` in a project folder only affects that specific project
   - Other projects will still download the latest published version from npm
   - For testing, you can publish to your own npm account

## Expected outcome
- Clear understanding of different dependency types
- Ability to manage and update dependencies appropriately
- Knowledge of when to publish updated packages

## Common issues and solutions
- Issue: Dependencies not updating as expected
  - Solution: Ensure you're using the correct `ph use` command for your needs
- Issue: Breaking changes after updates
  - Solution: Test thoroughly and consider publishing to a private npm registry first
- Issue: Confusion about which version is being used
  - Solution: Check your package.json and powerhouse.manifest.json for current versions

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Using Different Branches in Powerhouse](#using-different-branches-in-powerhouse)
- [Setting up or Resetting the Global Powerhouse Configuration](#setting-up-or-resetting-the-global-powerhouse-configuration)

## Further reading
- [Powerhouse Builder Tools](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
- [GraphQL Schema Best Practices](/academy/MasteryTrack/WorkWithData/GraphQLAtPowerhouse)

</details>

<details id="packaging-and-publishing-a-powerhouse-project">
<summary>Packaging and Publishing a Powerhouse Project</summary>

## How to Package and Publish a Powerhouse Project
---

## Problem statement
You have created a collection of document models, editors, or other components and want to share it as a reusable package on a public or private npm registry. Publishing a package allows other projects to install and use your creations easily.

## Prerequisites
- A completed Powerhouse project that you are ready to share.
- An account on [npmjs.com](https://www.npmjs.com/) (or a private registry).
- Your project's `package.json` should have a unique name and correct version.
- You must be logged into your npm account via the command line.

## Solution

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

## Expected outcome
- Your Powerhouse project is successfully published to the npm registry.
- Other developers can now install your package into their projects using `ph install @your-org/your-package-name`.
- Your Git repository is updated with the new version information.

## Common issues and solutions
- **Issue**: "403 Forbidden" or "You do not have permission" error on publish.
  - **Solution**: Ensure your package name is unique and not already taken on npm. If it's a scoped package (`@scope/name`), make sure the organization exists and you have permission to publish to it. For public scoped packages, you must include `--access public`.

## Related recipes
- [Installing a Custom Powerhouse Package](#installing-a-custom-powerhouse-package)
- [Managing Powerhouse Dependencies and Versions](#managing-powerhouse-dependencies-and-versions)

</details>

## Data Synchronisation recipes
This section helps troubleshoot and understand data synchronization within the Powerhouse ecosystem, including interactions between different services and components.

<details id="troubleshooting-document-syncing">
<summary>Troubleshooting Document Syncing: Supergraph vs. Drive Endpoints</summary>

## Troubleshooting Document Syncing: Supergraph vs. Drive Endpoints
---

## Problem statement
You've created or modified documents within a specific drive using Powerhouse Connect, but when you query the main GraphQL endpoint (`http://localhost:4001/graphql`), you don't see the changes or the documents you expected. This can lead to confusion about whether data is being synced correctly.

## Prerequisites
- Powerhouse CLI (`ph-cmd`) installed.
- A Powerhouse project initialized (`ph init`).
- The Powerhouse Reactor is running (`ph reactor`).
- Powerhouse Connect is running (`ph connect`).
- You have attempted to create or modify documents in a drive (e.g., a "finances" drive).

## Solution

Understanding the different GraphQL endpoints in Powerhouse is crucial for effective troubleshooting:

1.  **The Supergraph Endpoint (`http://localhost:4001/graphql`):**
    *   This is the main entry point for the supergraph, which combines various subgraphs (e.g., system information, user accounts, etc.).
    *   While you can query many things here, it's generally **not** the endpoint for direct, real-time document content operations like `pushUpdates` for a specific drive.

2.  **Drive-Specific Endpoints (e.g., `http://localhost:4001/d/<driveId>` or `http://localhost:4001/d/<driveId>/graphql`):**
    *   Each drive (e.g., "finances", "mydocs") has its own dedicated endpoint.
    *   Operations that modify or directly interact with the content of a specific drive, such as creating new documents or pushing updates, are typically handled by this endpoint.
    *   When you interact with documents in Powerhouse Connect, it communicates with these drive-specific endpoints.

**Troubleshooting Steps:**

1.  **Identify the Correct Endpoint:**
    *   As illustrated in the scenario where a user was looking for documents in a "finances" drive, the key realization was needing to interact with the `http://localhost:4001/d/finances` endpoint for document-specific operations, not just `http://localhost:4001/graphql`.

2.  **Inspect Network Requests:**
    *   Open your browser's developer tools (usually by pressing F12) and go to the "Network" tab.
    *   Perform an action in Powerhouse Connect that involves a document (e.g., creating, saving).
    *   Look for GraphQL requests. You'll often see operations like `pushUpdates`.
    *   Examine the "Request URL" or "Path" for these requests. You'll likely see they are being sent to a drive-specific endpoint (e.g., `/d/finances`, `/d/powerhouse`).
    *   The payload might show `operationName: "pushUpdates"`, confirming a document modification attempt.

3.  **Querying Drive Data:**
    *   If you want to query the state of documents within a specific drive via GraphQL, ensure you are targeting that drive's GraphQL endpoint (often `http://localhost:4001/d/<driveId>/graphql` or through specific queries available on the main supergraph that reference the drive). The exact query structure will depend on your document models.

4.  **Clear Caches and Reset (If Necessary):**
    *   Sometimes, old state or cached data can cause confusion. As a general troubleshooting step if issues persist:
        *   Try deleting the `.ph` folder in your user's home directory (`~/.ph`). This folder stores global Powerhouse configurations and cached dependencies. 
        *   Clear browser storage (localStorage, IndexedDB) for the Connect application.

## Expected outcome
- You can correctly identify which GraphQL endpoint to use for different types of queries and operations.
- You understand that document-specific operations (like creating or updating documents in a drive) are typically handled by drive-specific endpoints.
- You can use browser developer tools to inspect network requests and confirm which endpoints Powerhouse Connect is using.
- Documents sync as expected, and you can retrieve their state by querying the appropriate endpoint.

## Common issues and solutions
-   **Issue:** Documents created in Connect don't appear when querying `http://localhost:4001/graphql`.
    -   **Solution:** You are likely querying the general supergraph. For document-specific data, ensure you are targeting the drive's endpoint (e.g., `http://localhost:4001/d/<driveId>`) or using queries designed to fetch data from specific drives. Inspect Connect's network activity to see the endpoint it uses for `pushUpdates`.
-   **Issue:** Persistent syncing problems or unexpected behavior after trying the above.
    -   **Solution:** Consider cleaning the global Powerhouse setup by removing `~/.ph`
    
</details>

<details id="resetting-your-localhost-environment">
<summary>Resetting Your Localhost Environment</summary>

## How to Reset Your Localhost Environment
---

## Problem statement
You are running Powerhouse Connect locally (via `ph connect`), but you can't find your local drive in the interface. Alternatively, you can see the drive or have recreated it, but the `DocumentModel` button is missing, preventing you from creating new document model schemas.

## Prerequisites
- Powerhouse Connect is running locally.
- The Powerhouse Connect interface is open in your browser.

## Solution
This issue is often caused by corrupted or inconsistent data stored in your browser's local storage for the Connect application. Clearing this storage forces a re-initialization of your local environment.

### Step 1: Open Settings
In the bottom-left corner of the Powerhouse Connect UI, click on the "Settings" menu.

### Step 2: Find the Danger Zone
In the settings panel that appears, scroll or navigate to the "Danger Zone" section.

### Step 3: Clear Local Storage
Click the "Clear storage" button. A confirmation prompt may appear. Confirming this action will wipe all application data stored in your browser for your local environment, including the state of your local drive.

### Step 4: Verify the Reset
The application should automatically refresh and re-initialize its state. If it doesn't, manually reload the page. Your local drive should now be present with the `DocumentModel` button restored.

## Expected outcome
- Your local drive is visible again in the Powerhouse Connect UI.
- The `DocumentModel` button is available inside the local drive.
- You can proceed to create and edit document models in your local environment.

## Common issues and solutions
- **Issue**: The problem persists after clearing storage.
  - **Solution**: Try clearing your browser's cache and cookies for the localhost domain. As a last resort, follow the recipe for [Clearing Package Manager Caches](#clearing-package-manager-caches) and reinstalling dependencies.

## Related recipes
- [Troubleshooting Document Syncing](#troubleshooting-document-syncing)
- [Initializing a New Project & Document Model](#initializing-a-new-project-and-document-model)

</details>

<details id="clearing-package-manager-caches">
<summary>Clearing Package Manager Caches</summary>

## How to Clear Package Manager Caches
---

## Problem statement
You are encountering unexpected issues with dependencies, `ph-cmd` installation, or package resolution. Corrupted or outdated caches for your package manager (pnpm, npm, yarn) can often be the cause. Clearing the cache forces the package manager to refetch packages, which can resolve these problems.

## Prerequisites
- Terminal or command prompt access
- A package manager (pnpm, npm, or yarn) installed

## Solution

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

## Expected outcome
- The package manager's cache is cleared or verified.
- Subsequent installations will fetch fresh versions of packages, potentially resolving dependency-related errors.
- Your system is in a cleaner state for managing Powerhouse project dependencies.

## Common issues and solutions
- **Issue**: Problems persist after clearing the cache.
  - **Solution**: The issue might not be cache-related. Consider completely removing `node_modules` and lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) and running `pnpm install` (or equivalent) again.

## Related recipes
- [Installing 'ph-cmd'](#installing-ph-cmd)
- [Uninstalling 'ph-cmd'](#uninstalling-ph-cmd)
- [Managing Powerhouse Dependencies and Versions](#managing-powerhouse-dependencies-and-versions)

</details>
