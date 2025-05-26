# Standard Document Model Workflow
This tutorial will guide you through the process of creating a new document model using the Document Model Editor in the Connect app. 
We'll use the Document Model Boilerplate, which provides code generation for scaffolding editors and models. 
This boilerplate ensures compatibility with host applications like Connect and the Reactors for seamless document model and editor integration.

<details>
<summary>Available NPM commands</summary>

-   `generate`: Updates the generated code according to the JSON spec and GraphQL schema.
-   `lint`: Checks for errors with ESLint and TypeScript checking.
-   `format`: Formats the code using Prettier.
-   `build`: Builds the library project using Vite.
-   `storybook`: Starts Storybook in development mode.
-   `build-storybook`: Builds Storybook.
-   `test`: Runs Jest for testing.

</details>

# Run Connect Locally

Running Connect locally allows builders and developers to create, test, and deploy document models.   
Connect can be locally launched through a simple CLI command using the provided npm package.   
Once launched, the studio allows any developer or document model builder to run a local instance of the Connect hub on their machine and begin working immediately.

## Setup of the local reactor

:::info
**Powerhouse Reactors** are the nodes in the network that store documents, resolve conflicts and rerun operations to verify document event histories.   
Reactors can be configured for local storage, centralized cloud storage or on a decentralized storage network.
:::

When using Connect in Studio mode a local reactor will be spun up which will function as the back-end to your local Connect frond-end service. This local reactor will make use of your local document storage and will eventually be able to sync with other reactors on the network, or the 'Powergrid', you will set up.

## Let's get started

Connect can be spun up through CLI commands in your favorite IDE. 
Connect offers an interface to add your graphql schema and configure the settings of your document model. 
Start with the following command to get started with the Powerhouse CLI

```
$ pnpm install -g ph-cmd
```

Your next step is to initialize the CLI with the following command. This will prompt the creation of a local configuratior file and accompagning reactor set up in .ph/documents.

```
ph init
```
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

To run a local version of the Connect in Studio Mode use the following command

```
ph connect
```

### 1. Defining Your Document Model GraphQL Schema
Start by creating your own document model library.

Step 1: Run the following command to set up your document model library:

```bash
ph init
```

Step 2: Use the Document Model Editor in the Connect app:

Launch Connect Studio Mode:

```bash
ph connect
```
## Document Model Creation

At the core of Connect is the Document Model Editor. This powerful editor enables business analysts, user researchers, or aspiring document model builders to craft a GraphQL Schema Definition that reflects the business domain the document model will operate in. The schema serves as the foundation of the document model, defining its structure and how it interacts with the broader business processes. To learn more about domain modeling, please visit our section on Document Model dee

Open the Document Model Editor to define your document schema.
This schema will define the structure and fields for your document model using GraphQL.


### 2. Defining Document Model Operations
Using the Document Model Operations Editor, define the operations for your document model and their GraphQL counterparts. These operations will handle state changes within your document model.

**Best Practices:**

- Clearly define CRUD operations (Create, Read, Update, Delete).
- Use GraphQL input types to specify the parameters for each operation.
- Ensure that operations align with user intent to maintain a clean and understandable API.

### 3. Generating Scaffolding Code
Export your document model as a .zip file from Connect.
Import the .zip file into your project directory created in Step 1.
Run the following command to generate the scaffolding code:

```bash
ph generate YourModelName.phdm.zip
```

This will create a new directory under /document-models containing:

JSON file with the document model specification.
GraphQL file with state and operation schemas.
A gen/ folder with autogenerated code.
A src/ folder for your custom code implementation.

### 4. Implementing Reducer Code and Unit Tests
Navigate to the reducer directory:

```bash
cd document-models/"YourModelName"/src/reducers
```

Implement the reducer functions for each document model operation. These functions will handle state transitions.

Add utility functions in:

```bash
document-models/"YourModelName"/src/utils.ts
```

Write unit tests to ensure the correctness of your reducers:

Test files should be located in:

```bash
document-models/"YourModelName"/src/reducers/tests
```

Run the tests:

```bash
pnpm run test
```

Test the editor functionality:

```bash
ph connect
```

### 5. Implementing Document Editors
Generate the editor template for your document model:

```bash
ph generate -- --editor YourModelName --document-types powerhouse/YourModelName
```

The --editor flag specifies the name of your document model.
The --document-types flag links the editor to your document model type.
After generation:

Open the editor template:

```bash
editors/YourModelName/editor.tsx
```

Customize the editor interface to suit your document model.

### 6. Testing the Document Editor
Run the Connect app to test your document editor:

```bash
ph connect
```

Verify that the editor functions as expected.
Perform end-to-end testing to ensure smooth integration between the document model and its editor.

### 7. Adding a Manifest File
Create a manifest file to describe your document model and editor. This enables proper integration with the host application.

**Example manifest.json:**

```json
{
  "name": "your-model-name",
  "description": "A brief description of your document model.",
  "category": "your-category", // e.g., "Finance", "People Ops", "Legal"
  "publisher": {
    "name": "your-publisher-name",
    "url": "your-publisher-url"
  },
  "documentModels": [
    {
      "id": "your-model-id",
      "name": "your-model-name"
    }
  ],
  "editors": [
    {
      "id": "your-editor-id",
      "name": "your-editor-name",
      "documentTypes": ["your-model-id"]
    }
  ]
}
```

### Steps to finalize:

Place the manifest file at your project root.
Update your index.js to export your modules and include the new document model and editor.

### Final Thoughts
You've now successfully created a Document Model and its corresponding Editor using the Connect app! 🚀

Next Steps:
- Expand functionality: Add more operations or complex logic to your document model.
- Improve UX: Enhance the document editor for a smoother user experience.
- Integrate with other systems: Use APIs or GraphQL to connect your document model with external services.