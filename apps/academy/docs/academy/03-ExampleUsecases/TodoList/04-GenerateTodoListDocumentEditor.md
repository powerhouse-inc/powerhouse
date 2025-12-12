# Step 4 — Generating a document model editor for `TodoList` documents

## Generate the editor template

Run the command below to generate the editor template for the `TodoList` document model.  
This command reads the `TodoList` document model definition from the `document-models` folder and generates the editor template in the `editors/todo-list-editor` folder.

```bash
ph generate --editor TodoListEditor --document-types powerhouse/todo-list
```

Notice the `--editor` flag which specifies the editor name, and the `--document-types` flag defines the document type `powerhouse/todo-list`.

Once complete, you'll have a new directory structure:

```
editors/todo-list-editor/
├── components/
│   └── EditName.tsx          # Auto-generated component for editing document name
├── editor.tsx                # Main editor component (do not change this)
└── module.ts                 # Editor module export (do not change this)
```

 ## Check your work

To make sure all works as expected, we should:

- check types
run: `pnpm tsc`

- check linting
run: `pnpm lint`

- check tests
run: `pnpm test`

- test in connect
run: `pnpm connect` — you should now be able to create a `TodoList` type document and open it. You will see the generic `EditName` component in the document

- make sure your code matches the code in the completed step branch
run: `git diff your-branch-name step-4-complete-generated-todo-list-document-editor`

## Up next: adding UI components for updating our `TodoList` documents

Next, we will add some UI components to create, read, update, and delete data in our `TodoList` document editor.