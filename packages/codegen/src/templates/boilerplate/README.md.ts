import { md } from "@tmpl/core";

export const readmeTemplate = md`
# Document Model Boilerplate

This Document Model Boilerplate provides code generation for scaffolding editors and models.
It ensures compatibility with host applications like Connect and the Reactors for seamless document model and editor integration.

## Standard Document Model Workflow with help of the boilerplate.

This tutorial will guide you through the process of creating a new document model and its editor.

<details>
<summary>Available NPM commands</summary>

- \`generate\`: Generates the starting code of a document model, editor, drive app, processor or subgraph.
- \`lint\`: Checks for errors with oxlint, including type-aware rules and TypeScript type checking.
- \`format\`: Formats the code using oxfmt.
- \`build\`: Builds the library project using Vite.
- \`connect\`: Runs the project's \`connect\` host (\`ph run connect\`): Connect in Studio Mode.
- \`dev\`: Runs the project's \`dev\` host (\`ph run dev\`): a Switchboard and a Connect that load this project's code.
- \`storybook\`: Starts Storybook in development mode.
- \`build-storybook\`: Builds Storybook.
- \`test\`: Runs Jest for testing.

</details>

### 1. Running the project

The following command gives you access to all the powerhouse CLI tools available, install it globally if you are a poweruser.

~~~bash
npm install ph-cmd
~~~

Now you are able to launch the project's dev stack, a Switchboard and a Connect that load this project's code:

~~~bash
npm run dev
~~~

This runs \`ph run dev\`. The applications this project can run are its hosts, defined under \`hosts/\` and started with \`ph run <host>\` (for example \`ph run connect\` or \`ph run switchboard\`). See \`hosts/README.md\`.

### 2. Planning Your Document Model

Decide the state of your document model and the operations that change it.
Follow one of our tutorials on Academy to get familiar with the process.

**Best Practices:**

- Clearly define CRUD operations (Create, Read, Update, Delete).
- Give each operation an input that specifies its parameters.
- Ensure that operations align with user intent to maintain a clean and understandable API.

### 3. Generating Scaffolding Code

Run the following command to generate the starting code of a document model:

~~~bash
npm run generate -- document-model --name YourModelName --code-first
~~~

This will create a new directory under /document-models containing:

A v1/definition.ts file with the document model's metadata and state.
A v1/modules/ folder with its operations and their reducers.
A v1/tests/ folder with a starting test.
An upgrades/ folder that lists the model's versions.

### 4. Implementing Reducer Code and Unit Tests

Navigate to the modules directory:

~~~bash
cd document-models/your-model-name/v1/modules
~~~

Declare each operation there with its input, its errors and its reducer. The reducers handle state transitions.

Write unit tests to ensure the correctness of your reducers:

Test files should be located in:

~~~bash
document-models/your-model-name/v1/tests
~~~

Run the tests:

~~~bash
npm test
~~~

Test the editor functionality:

~~~bash
npm run connect
~~~

### 5. Implementing Document Editors

Generating a document model also generates a starting editor for it. To generate another editor:

~~~bash
npm run generate -- editor --name "Your Editor Name" --document-type your-package/your-model-name
~~~

The --name flag specifies the name of the editor.
The --document-type flag links the editor to your document model type.
After generation:

Open the editor template:

~~~bash
editors/your-editor-name/editor.tsx
~~~

Customize the editor interface to suit your document model.

### 6. Testing the Document Editor

Run the Connect app to test your document editor:

~~~bash
npm run connect
~~~

Verify that the editor functions as expected.
Perform end-to-end testing to ensure smooth integration between the document model and its editor.

### 7. Adding a Manifest File

Create a manifest file to describe your document model and editor. This enables proper integration with the host application.

**Example manifest.json:**

~~~json
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
~~~

### Steps to finalize:

Place the manifest file at your project root.
Update your index.js to export your modules and include the new document model and editor.

### Final Thoughts

You've now successfully created a Document Model and its corresponding Editor using the Connect app!

Next Steps:

- Expand functionality: Add more operations or complex logic to your document model.
- Improve UX: Enhance the document editor for a smoother user experience.
- Integrate with other systems: Use APIs or GraphQL to connect your document model with external services.
`.raw;
