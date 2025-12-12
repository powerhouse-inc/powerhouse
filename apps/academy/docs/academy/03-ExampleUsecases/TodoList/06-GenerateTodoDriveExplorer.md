# Step 6 - Generate the custom drive editor for managing our `TodoList` documents

in Connect, a "drive" is just a document with the type "powerhouse/drive", which is specifically created for containing and managing other documents. 

A "drive editor" is just an editor that specifically works on documents with the type "powerhouse/document-drive".

When you create a new drive in Connect, you are creating a new document of the "powerhouse/document-drive" type.

So far, we have been working in a drive editor called "Generic Drive Explorer" which is the default drive editor and is designed to work with any document type.

We can also create our own custom drive explorer and restrict it to only working on `TodoList` documents. This lets us add more special features than are possible when you need to support any type of document.

## Generating the `TodoDriveExplorer` drive editor

To generate our `TodoDriveExplorer`, run the following command:

```bash
ph generate --drive-editor TodoDriveApp --allowed-document-types powerhouse/todo-list
```

This will generate the following file structure:

```bash
editors
│   ├── todo-drive-explorer
│   │   ├── components
│   │   │   ├── CreateDocument.tsx        # component for creating now documents
│   │   │   ├── DriveContents.tsx         # component for showing the documents in the drive
│   │   │   ├── DriveExplorer.tsx         # wrapper for the various other components
│   │   │   ├── EmptyState.tsx            # shown when there are no documents
│   │   │   ├── Files.tsx                 # shows a list of the file nodes (documents) in the drive
│   │   │   ├── Folders.tsx               # shows a list of the folder nodes in the drive
│   │   │   ├── FolderTree.tsx            # shows the files and folders in the drive in a traditional sidebar format
│   │   │   └── NavigationBreadcrumbs.tsx # allows navigating the folders in a drive
│   │   ├── config.ts                      # configuration for the drive including which document types are allowed
│   │   ├── editor.tsx                    # main editor component (do not change this)
│   │   └── module.ts                     # module export for the editor (do not change this)
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
run: `pnpm connect` — you should now be able to create a new drive with the type "TodoDriveExplorer" and use it the same as you would the "Generic Drive Explorer", except it should only allow you to create `TodoList` type documents.

- make sure your code matches the code in the completed step branch
run: `git diff your-branch-name step-6-complete-generated-todo-drive-explorer`

## Up next: adding a shared component for showing stats about todos in both our `TodoListEditor` and `TodoDriveExplorer`

Next, we will add a UI component that is useful in both of our different editors.