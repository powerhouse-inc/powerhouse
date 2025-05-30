# Creating Powerhouse packages

This tutorial guides you through creating a Powerhouse Document Model, from initial setup to publishing a distributable package. We'll leverage the Powerhouse CLI and Connect Studio Mode for a streamlined development experience.

<details>
<summary>Key Commands</summary>

-   `pnpm install -g ph-cmd`: Installs the Powerhouse CLI globally.
-   `ph init`: Initializes a new Powerhouse project or sets up the local environment.
-   `ph connect`: Runs Connect in Studio Mode for local development and testing.
-   `ph generate <YourModelName.phdm.zip>`: Generates scaffolding code from an exported document model specification.
-   `ph generate --editor YourModelName --document-types powerhouse/YourModelName`: Generates an editor template for a document model.
-   `pnpm build`: Builds the project for production.
-   `pnpm run test`: Runs unit tests.
-   `npm login`: Logs into your NPM account.
-   `npm publish`: Publishes your package to NPM.
-   `ph install @your-org-ph/your-package-name`: Installs a published package into a local Powerhouse environment.

</details>

## Phase 1: Setup and Initialization

### 1.1. Install Powerhouse CLI
Ensure you have the Powerhouse Command Line Interface (`ph-cmd`) installed. This tool is crucial for managing your Powerhouse projects.
```bash
pnpm install -g ph-cmd
```
:::info
Refer to the [Prerequisites](/academy/MasteryTrack/BuilderEnvironment/StandardDocumentModelWorkflow) guide for detailed installation instructions for Node.js, pnpm, and Git if you haven't set them up yet.
:::

### 1.2. Initialize Your Project Environment
Before creating a specific project, or if you're setting up your environment for the first time to use Connect Studio Mode, initialize the Powerhouse environment. This command prepares your local setup, including a local Reactor configuration.
```bash
ph init
```
If you are starting a new project to be packaged, this command will also prompt you for a project name. This name will be used for your package.

<details>
<summary> How to make use of different branches? </summary>

When installing or using the Powerhouse CLI commands you are able to make use of the dev & staging branches. These branches contain more experimental features then the latest stable release the PH CLI uses by default. They can be used to get access to a bugfix or features under development.

| Command | Description |
|---------|-------------|
| **pnpm install -g ph-cmd** | Install latest stable version |
| **pnpm install -g ph-cmd@dev** | Install development version |
| **pnpm install -g ph-cmd@staging** | Install staging version |
| **ph init** | Use latest stable version of the boilerplate |
| **ph init --dev** | Use development version of the boilerplate |
| **ph init --staging** | Use staging version of the boilerplate |
| **ph use** | Switch all dependencies to latest production versions |
| **ph use dev** | Switch all dependencies to development versions |
| **ph use prod** | Switch all dependencies to production versions |

Please be aware that these versions can contain bugs and experimental features that aren't fully tested.
</details>

### 1.3. Launch Connect in Studio Mode
Connect is your local development hub. Running it in Studio Mode spins up a local instance with a local Reactor, allowing you to define, build, and test document models.
```bash
ph connect
```
This command typically opens Connect in your browser at `http://localhost:3000/`.

:::info
**Powerhouse Reactors** are essential nodes in the Powerhouse network. They store documents, manage versions, resolve conflicts, and verify document operation histories by rerunning them. Reactors can be configured for local storage (as in Studio Mode), centralized cloud storage, or decentralized storage networks.
:::

## Phase 2: Document Model Specification

### 2.1. Define the Document Model Schema
Within Connect Studio Mode, navigate to the Document Model Editor. Here, you'll specify the structure of your document model using GraphQL Schema Definition Language (SDL).
-   **State Schema:** Describes the data fields and types within your document (e.g., `ToDoItem` with `id`, `text`, `checked` fields).
-   This schema is the blueprint for your document model's data.

### 2.2. Define Document Model Operations
In the same editor, specify the operations (state transitions) for your document model. These are also defined using GraphQL, specifically input types.
-   **Operations Schema:** Specifies the actions that can be performed on the document (e.g., `AddTodoItemInput`, `UpdateTodoItemInput`, `DeleteTodoItemInput`).
-   Each input type details the parameters required for an operation.
-   **Best Practices:**
    *   Clearly define operations (often aligning with CRUD principles).
    *   Use GraphQL input types for operation parameters.
    *   Ensure operations reflect user intent for a clean API.

### 2.3. Export Document Model Specification
Once your schema and operations are defined in Connect, export the specification. This will download a `.phdm.zip` file (e.g., `YourModelName.phdm.zip`). Save this file in the root of your Powerhouse project directory.

## Phase 3: Implementation and Testing

### 3.1. Generate Scaffolding Code
Use the Powerhouse CLI to process the exported `.phdm.zip` file and generate the necessary boilerplate code for your document model.
```bash
ph generate YourModelName.phdm.zip
```
This command creates a new directory under `document-models/YourModelName/` containing:
-   A JSON file with the document model specification.
-   A GraphQL file with the state and operation schemas.
-   A `gen/` folder with autogenerated TypeScript types, action creators, and utility functions based on your schema.
-   A `src/` folder where you'll implement your custom logic (reducers, utils).

### 3.2. Implement Reducer Logic
Reducers are pure functions that implement the state transition logic for each operation defined in your schema. Navigate to `document-models/YourModelName/src/reducers/to-do-list.ts` (or similar, based on your model name).
-   Implement the functions for each operation (e.g., `addTodoItemOperation`, `updateTodoItemOperation`).
-   These functions take the current state and an action (containing input data) and return the new state.
-   Powerhouse handles immutability behind the scenes.

### 3.3. Write Unit Tests for Reducers
It's crucial to test your reducer logic. Write unit tests in the `document-models/YourModelName/src/reducers/tests/` directory.
-   Verify that each operation correctly transforms the document state.
-   Use the auto-generated action creators from the `gen/` folder to create operation actions for your tests.
Run tests using:
```bash
pnpm run test
```

### 3.4. Implement the Document Editor
A document editor provides the user interface for interacting with your document model in Connect. Generate an editor template:
```bash
ph generate --editor YourModelName --document-types powerhouse/YourModelName
```
-   The `--editor YourModelName` flag specifies the document model this editor is for.
-   The `--document-types powerhouse/YourModelName` flag links the editor to the specific document type defined in your model specification (ensure this matches what you set in Connect).

This creates a template file, typically at `editors/your-model-name/editor.tsx`.
-   Customize this React component to build your UI.
-   You can use standard HTML, Tailwind CSS (available in Connect), or import custom CSS.
-   Utilize components from `@powerhousedao/document-engineering` for consistency and rapid development. @Callmet Reference back to document engineering


### 3.5. Test the Editor
Run Connect locally to see your editor in action:
```bash
ph connect
```
Create a new document of your defined type. Interact with your editor, test all functionalities, and ensure it correctly dispatches actions to the reducers and reflects state changes.

## Phase 4: Packaging and Publishing

Once your document model and editor are implemented and tested, you can package them for distribution. A Powerhouse Package is a modular unit that can group document models, editors, scripts, and processors.

### 4.1. Prepare Project for Packaging
If you didn't initialize your project with `ph init` intending it as a package, ensure your project structure is set up correctly. The `ph init` command is designed to create this structure.
-   `document-models/`: Contains your document models.
-   `editors/`: Contains your editor components.
-   `src/`: Often used for shared utilities or can be part of the model/editor structure.
-   (Optional) `processors/`, `scripts/` for advanced functionalities.

### 4.2. Specify Package Details in `package.json`
Navigate to the `package.json` file in your project root. This file is crucial for NPM publishing.
-   **`name`**: Follow a scoped naming convention, e.g., `@your-org-ph/your-package-name`. The `-ph` suffix helps identify Powerhouse ecosystem packages.
-   **`version`**: Use semantic versioning (e.g., `1.0.0`).
-   **`author`**: Your name or organization.
-   **`license`**: e.g., `AGPL-3.0-only`.
-   **`main`**: The entry point of your package (e.g., `index.js` or `dist/index.js`).
-   **`publishConfig`**: For scoped packages intended to be public, add:
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
  "files": [ // Ensure your build output and necessary files are included
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

### 4.3. Add a Manifest File (`manifest.json`)
Create a `manifest.json` file in your project root. This file describes your package's contents (document models, editors) and helps host applications like Connect understand and integrate your package.

Example `manifest.json`:
```json
{
  "name": "@yourorg-ph/your-package-name", // it's recommended to use an organization-specific NPM account (e.g., `yourorg-ph`).
  "description": "A brief description of your package and its document models.",
  "category": "your-category", // e.g., "Finance", "People Ops", "Legal"
  "publisher": {
    "name": "your-publisher-name", // Your organization or name
    "url": "your-publisher-url"   // Link to your website or repository
  },
  "documentModels": [
    {
      "id": "powerhouse/YourModelName", // Document type string as defined in Connect
      "name": "YourModelName"          // Human-readable name
    }
  ],
  "editors": [
    {
      "id": "your-editor-id",          // A unique ID for the editor component
      "name": "YourModelName Editor",  // Human-readable name
      "documentTypes": ["powerhouse/YourModelName"] // Links editor to document type(s)
    }
  ]
}
```
Update your project's main `index.js` or entry point to export your document models and editors so they can be discovered by Powerhouse applications.

### 4.4. Build Your Project
Compile and optimize your project for production:
```bash
pnpm build
```
This command typically creates a `dist/` or `build/` directory with the compiled assets. Ensure your `package.json`'s `files` array includes this directory and other necessary assets like `manifest.json`, `document-models`, and `editors` if they are not part of the build output but need to be in the package.

### 4.5. Version Control
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

2.  **Publish the Package:**
    ```bash
    npm publish
    ```
    If your package is scoped and public, NPM will use the `publishConfig` from your `package.json`. If not set there, you might need `npm publish --access public`.

### 4.7. Using Your Published Package
Once published, your package can be installed and used in any Powerhouse environment (like another local Connect instance or a deployed Reactor setup).
```bash
ph install @your-org-ph/your-package-name
```
This command makes the document models and editors defined in your package available within that Powerhouse instance.

Congratulations! You've successfully created, packaged, and published a Powerhouse Document Model. This enables modularity, reusability, and collaboration within the Powerhouse ecosystem.