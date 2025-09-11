# Build a drive explorer

**Drive Explorers (or Drive Apps)** enhance how contributors and organizations interact with document models.
They create an 'app-like' experience by providing a **custom interface** for exploring and interacting with the contents of a drive.
:::tip What is a Drive Explorer or Drive App?
A Drive Explorer or Drive App offers a tailored application designed around its document models.
Think of a Drive Explorer as a specialized lens—it offers **different ways to visualize, organize, and interact with** the data stored within a drive, making it more intuitive and efficient for specific use cases.
:::

### Drive explorers are purpose-built

Organizations typically build Drive Explorers for specific use cases, often packaging them with a corresponding document model. This allows for customized user experiences, streamlined workflows, and maximized efficiency for contributors.

Drive Explorers or Drive Apps **bridge the gap between raw data and usability**, unlocking the full potential of document models within the Powerhouse framework.

### Key features of drive apps

- **Custom Views & Organization** – Drive Apps can present data in formats like Kanban boards, list views, or other structured layouts to suit different workflows.
- **Aggregated Insights** – They can provide high-level summaries of important details across document models, enabling quick decision-making.
- **Enhanced Interactivity** – Drive Apps can include widgets, data processors, or read models to process and display document data dynamically.

## Build a drive app

Drive Apps provide custom interfaces for interacting with the contents of a drive.
Let's start with a **quick overview** of the three steps for building a Drive App. We will then apply these steps to create our **To-do List Drive App**.

### Step 1. Generate the scaffolding code

Use the `generate drive editor` command to create the basic template structure for your Drive App:

```bash
ph generate --drive-editor <Drive App>
```

### Step 2. Update the manifest file

After creating your Drive App, you need to update its `manifest.json` file.
This file identifies your project and its components within the Powerhouse ecosystem.

### Step 3. Customize the drive app

Review the generated template and modify it to better suit your document model:

1. Remove unnecessary files and components
2. Add custom views specific to your data model
3. Implement specialized interactions for your use case

### About the drive app template

The default template provides a solid foundation. It contains:

- A tree structure navigation panel
- Basic file/folder operations
- Standard layout components

But the real power comes from tailoring the interface to your specific document models.
Now, let's implement a specific example for the to-do list we've been working on throughout this guide.

## Implementation example: To-do drive explorer

This example demonstrates how to create a To-do Drive Explorer application using the Powerhouse platform.
The application allows users to create and manage to-do lists with a visual progress indicator.

:::warning Heads-up!
If you've been following the Mastery Track, you can continue with the to-do list document model and Powerhouse project you've created. For more details, you can refer to the [Document Model Creation guide](/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema).

If not, you can follow the shortened guide below to prepare your project for this tutorial.

<details>
<summary>Prepare your Powerhouse Project to create a custom drive</summary>

### 1. Create a To-do document model:

- Initialize a new project with `ph init` and give it a project name.

- Start by running Connect locally with `ph connect`

- Download the `todolist.phdm.zip` file from the [todo-demo-package GitHub repository](https://github.com/powerhouse-inc/todo-demo-package/blob/production/todolist.phdm.zip).
- Place the downloaded file in the root of your project directory.
- Generate the document model:

  ```bash
  ph generate todolist.phdm.zip
  ```

### 2. Add the reducer code:

- Copy the code from [`base-operations.ts`](https://github.com/powerhouse-inc/todo-demo-package/blob/production/document-models/to-do-list/src/reducers/base-operations.ts)
- Paste it into `document-models/to-do/src/reducers/base-operations.ts`

### 3. Generate a document editor:

```bash
ph generate --editor ToDoList --document-types powerhouse/todolist
```

### 4. Add the editor code:

- Copy the code from [`editor.tsx`](https://github.com/powerhouse-inc/todo-demo-package/blob/production/editors/to-do-list/editor.tsx)
- Paste it into `editors/to-do-list/editor.tsx`
</details>
:::

## Generate the drive explorer app

### 1. Generate a drive explorer app:

```bash
ph generate --drive-editor todo-drive-explorer
```

### 2. Update the `powerhouse.manifest.json` file:

- The manifest file contains metadata for your package that is displayed when other users install it. Update the manifest to register your new Drive App:

```json
{
  "name": "To-do List Package",
  "description": "A simple todo list with a dedicated Drive Explorer App",
  "category": "Productivity",
  "publisher": {
    "name": "Powerhouse",
    "url": "https://www.powerhouse.inc/"
  },
  "documentModels": [
    {
      "id": "to-do-list",
      "name": "To-do List"
    }
  ],
  "editors": [
    {
      "id": "to-do-list-editor",
      "name": "To-do List Editor",
      "documentTypes": ["todo-list"]
    }
  ],
  "apps": [
    {
      "id": "todo-drive-explorer",
      "name": "To-do Drive App",
      "driveEditor": "todo-drive-explorer"
    }
  ],
  "subgraphs": [],
  "importScripts": []
}
```

### 3. Remove Unnecessary Default Components:

- First, let's remove some default template files that we won't need for this specific demo. If you want to see what the default template looks like before removing files, you can run `ph connect` at any time.

```bash
rm -rf editors/todo-drive-explorer/hooks
rm -rf editors/todo-drive-explorer/components/FileItemsGrid.tsx
rm -rf editors/todo-drive-explorer/components/FolderItemsGrid.tsx
rm -rf editors/todo-drive-explorer/components/FolderTree.tsx
```

### 4. Create custom components for your drive explorer:

- Next, create the following files. These will define the data types for our to-do items and provide the custom React components for our Drive Explorer.

<details>
<summary>Create `editors/todo-drive-explorer/types/todo.ts`</summary>

     This file defines the TypeScript type `ToDoState`. It specifies the shape of to-do document data within the Drive Explorer, combining the document's revision information with its global state. This ensures that our components work with a predictable and strongly-typed data structure.

     ```typescript
     import { type ToDoListDocument} from "../../../document-models/to-do-list/index.js"

      export type ToDoState = {
         documentType: string;
         revision: {
            global: number;
            local: number;
         };
         global: ToDoListDocument["state"]["global"];
      };
      ```

</details>

<details>
<summary>Create `editors/todo-drive-explorer/components/ProgressBar.tsx`</summary>

     This is a simple React component that renders a visual progress bar. It takes a `value` and `max` number to calculate the percentage of completed tasks. It also displays the percentage and has a special state for when there are no tasks.

     ```tsx
      import type { FC } from 'react';

      interface ProgressBarProps {
      value: number;
      max: number;
      }

      export const ProgressBar: FC<ProgressBarProps> = ({ value, max }) => {
      if (max === 0) {
         return (
            <div className="w-full bg-gray-200 rounded-full h-4">
            <div className="bg-gray-300 h-4 rounded-full text-xs text-center text-gray-500">
               No tasks
            </div>
            </div>
         );
      }

      const percentage = Math.min(100, (value / max) * 100);

      return (
         <div className="w-full bg-gray-200 rounded-full h-4 relative">
            <div
            className="bg-blue-500 h-4 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-black">
            {Math.round(percentage)}%
            </div>
         </div>
      );
      };
      ```
      </details>

   <details>
   <summary>Update `editors/todo-drive-explorer/components/DriveExplorer.tsx`</summary>

This is the main component of our Drive Explorer. It fetches all `powerhouse/todo` documents from the drive, displays them in a table with their progress, and allows a user to click on a document to open it in the `EditorContainer`. It also includes a button to create new documents.

```typescript
import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import type { FileNode, GetDocumentOptions, Node } from "document-drive";
import { EditorContainer, EditorContainerProps } from "./EditorContainer.js";
import type { DocumentModelModule } from "document-model";
import { CreateDocumentModal } from "@powerhousedao/design-system";
import { CreateDocument } from "./CreateDocument.js";
import { type DriveEditorContext, useDriveContext } from "@powerhousedao/reactor-browser";
import { ProgressBar } from "./ProgressBar.js";

import { type ToDoState } from "../types/todo.js"

interface DriveExplorerProps {
driveId: string;
nodes: Node[];
onAddFolder: (name: string, parentFolder?: string) => void;
onDeleteNode: (nodeId: string) => void;
renameNode: (nodeId: string, name: string) => void;
onCopyNode: (nodeId: string, targetName: string, parentId?: string) => void;
context: DriveEditorContext;
}

export function DriveExplorer({
driveId,
nodes,
context,
}: DriveExplorerProps) {
const { getDocumentRevision } = context;

const [activeDocumentId, setActiveDocumentId] = useState<
   string | undefined
>();
const [openModal, setOpenModal] = useState(false);
const selectedDocumentModel = useRef<DocumentModelModule | null>(null);
const { addDocument, documentModels, useDriveDocumentStates } = useDriveContext();

const [state, fetchDocuments] = useDriveDocumentStates({ driveId });

useEffect(() => {
   fetchDocuments(driveId).catch(console.error);
}, [activeDocumentId]);

const { todoNodes } = useMemo(() => {
   return Object.keys(state).reduce(
      (acc, curr) => {
      const document = state[curr];
      if (document.documentType.startsWith("powerhouse/todo")) {
         acc.todoNodes[curr] = document as ToDoState;
      }

      return acc;
      },
      {
      todoNodes: {} as Record<string, ToDoState>,
      },
   );
}, [state]);


const handleEditorClose = useCallback(() => {
   setActiveDocumentId(undefined);
}, []);

const onCreateDocument = useCallback(
   async (fileName: string) => {
      setOpenModal(false);

      const documentModel = selectedDocumentModel.current;
      if (!documentModel) return;

      const node = await addDocument(
      driveId,
      fileName,
      documentModel.documentModel.id,
      );

      selectedDocumentModel.current = null;
      setActiveDocumentId(node.id);
   },
   [addDocument, driveId],
);

const onSelectDocumentModel = useCallback(
   (documentModel: DocumentModelModule) => {
      selectedDocumentModel.current = documentModel;
      setOpenModal(true);
   },
   [],
);

const onGetDocumentRevision = useCallback(
   (options?: GetDocumentOptions) => {
      if (!activeDocumentId) return;
      return getDocumentRevision?.(activeDocumentId, options);
   },
   [getDocumentRevision, activeDocumentId],
);

const filteredDocumentModels = documentModels;


const fileNodes = nodes.filter((node) => node.kind === "file") as FileNode[];
// Get the active document info from nodes
const activeDocument = activeDocumentId
   ? fileNodes.find((file) => file.id === activeDocumentId)
   : undefined;

const documentModelModule = activeDocument
   ? context.getDocumentModelModule(activeDocument.documentType)
   : null;

const editorModule = activeDocument
   ? context.getEditor(activeDocument.documentType)
   : null;


return (
   <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-4 overflow-y-auto">
      {activeDocument && documentModelModule && editorModule ? (
            <EditorContainer
            context={{
               ...context,
               getDocumentRevision: onGetDocumentRevision,
            }}
            documentId={activeDocumentId!}
            documentType={activeDocument.documentType}
            driveId={driveId}
            onClose={handleEditorClose}
            title={activeDocument.name}
            documentModelModule={documentModelModule}
            editorModule={editorModule}
            />
      ) : (
         <>
            <h2 className="text-lg font-semibold mb-4">ToDos:</h2>
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
               <thead className="bg-gray-50">
                  <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tasks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                  </tr>
               </thead>
               <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(todoNodes).map(([documentId, todoNode]) => (
                  <tr key={documentId} className="hover:bg-gray-50">
                     <td className="px-6 py-4 whitespace-nowrap">
                        <div
                        onClick={() => setActiveDocumentId(documentId)}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                        {documentId}
                        </div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {todoNode.documentType}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {todoNode.global.stats.total}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {todoNode.global.stats.checked}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-32">
                        <ProgressBar
                           value={todoNode.global.stats.checked}
                           max={todoNode.global.stats.total}
                        />
                        </div>
                     </td>
                  </tr>
                  ))}
               </tbody>
            </table>
            </div>

            {/* Create Document Section */}
            <CreateDocument
            createDocument={onSelectDocumentModel}
            documentModels={filteredDocumentModels}
            />
         </>
      )}
      </div>

      {/* Create Document Modal */}
      <CreateDocumentModal
      onContinue={onCreateDocument}
      onOpenChange={(open) => setOpenModal(open)}
      open={openModal}
      />
   </div>
);
}
```

   </details>

   <details>
   <summary>Update `editors/todo-drive-explorer/components/EditorContainer.tsx`</summary>

This component acts as a wrapper for the document editor. When a user selects a document in `DriveExplorer.tsx`, this component mounts the appropriate editor (`to-do-list` editor in this case) and provides it with the necessary context and properties to function. It also renders the `DocumentToolbar` which provides actions like closing, exporting, and viewing revision history.

```typescript
import {
useDriveContext,
exportDocument,
type User,
type DriveEditorContext,
} from "@powerhousedao/reactor-browser";
import {
documentModelDocumentModelModule,
type DocumentModelModule,
type EditorContext,
type EditorProps,
type PHDocument,
type EditorModule,
type Operation,
} from "document-model";
import { useTimelineItems, getRevisionFromDate } from "@powerhousedao/common";
import {
DocumentToolbar,
RevisionHistory,
DefaultEditorLoader,
generateLargeTimeline,
type TimelineItem,
} from "@powerhousedao/design-system";
import { useState, Suspense, type FC, useCallback } from "react";

export interface EditorContainerProps {
driveId: string;
documentId: string;
documentType: string;
onClose: () => void;
title: string;
context: Omit<DriveEditorContext, "getDocumentRevision"> &
   Pick<EditorContext, "getDocumentRevision">;
documentModelModule: DocumentModelModule<PHDocument>;
editorModule: EditorModule;
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
const { driveId, documentId, documentType, onClose, title, context, documentModelModule, editorModule } = props;

const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null);
const [showRevisionHistory, setShowRevisionHistory] = useState(false);
const { useDocumentEditorProps } = useDriveContext();
const user = context.user as User | undefined;
const timelineItems = useTimelineItems(documentId);

const { dispatch, error, document } = useDocumentEditorProps({
   documentId,
   documentType,
   driveId,
   documentModelModule,
   user,
});

const onExport = useCallback(async () => {
   if (document) {
      const ext = documentModelModule.documentModel.extension;
      await exportDocument(document, title, ext);
   }
}, [document?.revision.global, document?.revision.local]);

const loadingContent = (
   <div className="flex-1 flex justify-center items-center h-full">
      <DefaultEditorLoader />
   </div>
);

if (!document) return loadingContent;

const moduleWithComponent = editorModule as EditorModule<PHDocument>;
const EditorComponent = moduleWithComponent.Component;

return showRevisionHistory ? (
   <RevisionHistory
      documentId={documentId}
      documentTitle={title}
      globalOperations={document.operations.global}
      key={documentId}
      localOperations={document.operations.local}
      onClose={() => setShowRevisionHistory(false)}
   />
) : (
   <Suspense fallback={loadingContent}>
      <DocumentToolbar
      onClose={onClose}
      onExport={onExport}
      onShowRevisionHistory={() => setShowRevisionHistory(true)}
      onSwitchboardLinkClick={() => {}}
      title={title}
      timelineButtonVisible
      timelineItems={timelineItems.data}
      onTimelineItemClick={setSelectedTimelineItem}
      />
      <EditorComponent
      context={{
         ...context,
         readMode: !!selectedTimelineItem,
         selectedTimelineRevision: getRevisionFromDate(
            selectedTimelineItem?.startDate,
            selectedTimelineItem?.endDate,
            document.operations.global,
         ),
      }}
      dispatch={dispatch}
      document={document}
      error={error}
      />
   </Suspense>
);
};
```

   </details>

- In case you are getting stuck and want to verify your progress with the reference repository you can find the example repository of the [Todo-demo-package here](/academy/MasteryTrack/DocumentModelCreation/ExampleToDoListRepository)

### 3. Run the application:

- With the code for our Drive App in place, it's time to see it in action. Run Connect in Studio mode:

  ```bash
  ph connect
  ```

  ![Todo Drive Explorer Demo](https://raw.githubusercontent.com/powerhouse-inc/todo-drive-explorer/9a87871e61460e73ddf8635fd756a0cd991306d6/demo.gif)

### Now it's your turn!

Start building your own drive apps, explorers or experiences.
Congratulations on completing this tutorial!
You've successfully built a custom Drive Explorer, enhancing the way users interact with document models.

Now, take a moment to think about the possibilities!

- What **unique Drive Experiences** could you create for your own projects?
- How can you tailor interfaces and streamline workflows to unlock the full potential of your document models?

The Powerhouse platform provides the tools. It's time to start building!
