# React Hooks

On this page we're providing an overview of the available hooks you can make use of as a builder.

<details>
<summary>Need a refresher on React Hooks?</summary>

React Hooks allow you to use various React features directly within your functional components. You can use built-in Hooks or combine them to create your own custom Hooks.

**What are Custom Hooks?**
A custom hook is a JavaScript function whose name starts with "use" and that calls other Hooks. They are used to:

- Reuse stateful logic between components.
- Abstract complex logic into a simpler interface.
- Isolate side effects, particularly those managed by `useEffect`.

**Key Built-in Hooks Examples:**

- `useState`: Lets a component "remember" information (state).
- `useEffect`: Lets a component perform side effects (e.g., data fetching, subscriptions, manually changing the DOM).
- `useContext`: Lets a component receive information from distant parent components without explicitly passing props through every level of the component tree.

**Naming Convention:**
Hook names must always start with `use` followed by a capital letter (e.g., `useState`, `useOnlineStatus`).

**Rules of Hooks:**

1.  **Only Call Hooks at the Top Level**: Don't call Hooks inside loops, conditions, or nested functions.
2.  **Only Call Hooks from React Functions**: Call Hooks from React functional components or from custom Hooks.

It's important to note that a function should only be named and treated as a hook if it actually utilizes one or more built-in React hooks. If a function (even if named `useSomething`) doesn't call any built-in hooks, it behaves like a regular JavaScript function, and making it a "hook" offers no specific React advantages.

</details>

# Editor state management hooks

This library provides hooks intended to be used by editors (including drive editors) which will be rendered inside of Powerhouse host-applications such as Connect, Switchboard, Fusion or a Vetra Studio Drive.

Learn more about the [Editors](/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors)
Learn more about the [Drive Editors](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer)

## Key concepts

### Reactor

All of the data used by these hooks is ultimately derived from the `Reactor`, which manages the asynchronous eventually consistent state of drives and documents. Learn more about the [Reactor](/academy/Architecture/WorkingWithTheReactor)

### Selected drives, folders and documents

In the application, there are certain items that can be set as "selected".

- selected drive
- selected folder
- selected document

We provide hooks for getting the selected item for each:

`useSelectedDrive`
`useSelectedFolder`
`useSelectedDocument`

Folders and documents are part of a given drive, so they will both be undefined if the selected drive is undefined.

_Either_ a folder or a document can be selected but not both, so if one is defined then the other will be undefined.

To set the selected drive, we provide a function `setSelectedDrive` which takes either a `DocumentDriveDocument` or a `DocumentDriveDocument['header']['slug']`.

To set the selected document/folder, we provide a function `setSelectedNode` which returns a setter function which can be used for _both_ documents and folders. This function takes either a `Node` or a slug which can be the url slug or the node's id.

## Hooks

<details>
<summary>Reactor</summary>
```ts
function useReactor(): Reactor | undefined
```

Returns the reactor instance.

Usage

```jsx
import { useReactor } from '@powerhousedao/state`

function MyEditorComponent() {
  const reactor = useReactor();
}
```

</details>

### Drives

<details>
<summary>useDrives</summary>

```ts
function useDrives(): DocumentDriveDocument[] | undefined;
```

Returns the drives for a reactor.

Usage

```jsx
import { useDrives } from "@powerhousedao/state";

function MyEditorComponent() {
  const drives = useDrives();
}
```

</details>

<details>
<summary>useDriveById</summary>

```ts
function useDriveById(
  id: string | null | undefined,
): DocumentDriveDocument | undefined;
```

Returns a drive by id.

Usage

```jsx
import { useDriveById } from "@powerhousedao/state";

function MyEditorComponent() {
  const driveById = useDriveById();
}
```

</details>

<details>
<summary>useSelectedDrive</summary>

```ts
function useSelectedDrive(): DocumentDriveDocument | undefined;
```

Returns the selected drive. You can use the selected drive with `setSelectedDrive`.

Usage

```jsx
import { useSelectedDrive } from "@powerhousedao/state";

function MyEditorComponent() {
  const selectedDrive = useSelectedDrive();
}
```

</details>

<details>
<summary>drive properties convenience hooks</summary>

We provide hooks for accessing various properties on the drive object for your convenience. These use the above hooks to get a drive and then return properties in the object.

```ts
/** Returns the remote URL for a drive. */
function useDriveRemoteUrl(
  driveId: string | null | undefined,
): string | undefined;

/** Returns the pull responder trigger for a drive. */
function useDrivePullResponderTrigger(
  driveId: string | null | undefined,
): Trigger | undefined;

/** Returns the pull responder URL for a drive. */
function useDrivePullResponderUrl(
  driveId: string | null | undefined,
): string | undefined;

/** Returns whether a drive is remote. */
function useDriveIsRemote(driveId: string | null | undefined): boolean;

/** Returns the sharing type for a drive. */
function useDriveSharingType(
  driveId: string | null | undefined,
): SharingType | undefined;

/** Returns  whether a drive is available offline. */
function useDriveAvailableOffline(driveId: string | null | undefined): boolean;
```

Usage

```jsx
import {
  useDriveRemoteUrl,
  useDrivePullResponderTrigger,
  useDrivePullResponderUrl,
  useDriveIsRemote,
  useDriveSharingType,
  useDriveAvailableOffline,
} from "@powerhousedao/state";

function MyEditorComponent() {
  const myDriveId = "some-drive-id";
  const driveRemoteUrl = useDriveRemoteUrl(myDriveId);
  const drivePullResponderTrigger = useDrivePullResponderTrigger(myDriveId);
  const drivePullResponderUrl = useDrivePullResponderUrl(myDriveId);
  const driveIsRemote = useDriveIsRemote(myDriveId);
  const driveSharingType = useDriveSharingType(myDriveId);
  const driveAvailableOffline = useDriveAvailableOffline(myDriveId);

  console.log({
    driveRemoteUrl,
    drivePullResponderTrigger,
    drivePullResponderUrl,
    driveIsRemote,
    driveSharingType,
    driveAvailableOffline,
  });
}
```

</details>

### Documents

<details>
<summary>useAllDocuments/useSelectedDriveDocuments</summary>

```ts
function useAllDocuments(): PHDocument[] | undefined;
```

Returns all of the documents in the reactor.

```ts
function useSelectedDriveDocuments(): PHDocument[] | undefined;
```

Returns the documents in the reactor for the selected drive.

Usage

```jsx
import {
  useAllDocuments,
  useSelectedDriveDocuments,
} from "@powerhousedao/state";

function MyEditorComponent() {
  const allDocuments = useAllDocuments();
  const selectedDriveDocuments = useSelectedDriveDocuments();
}
```

</details>

<details>
<summary>useSelectedDocument</summary>

```ts
function useSelectedDocument(): PHDocument | undefined;
```

Returns the selected document. You can set the selected document with `setSelectedNode`.

Usage

```jsx
import { useSelectedDocument } from "@powerhousedao/state";

function MyEditorComponent() {
  const selectedDocument = useSelectedDocument();
}
```

</details>

<details>
<summary>useDocumentById</summary>

```ts
function useDocumentById(id: string | null | undefined): PHDocument | undefined;
```

Returns a document by id.

Usage

```jsx
import { useDocumentById } from "@powerhousedao/state";

function MyEditorComponent() {
  const myDocumentId = "some-document-id";
  const documentById = useDocumentById(myDocumentId);
}
```

</details>

### Nodes

"Nodes" refers to the items found in a given drive's `state.global.nodes` array. Nodes can represent both files (documents) and folders.

A document in a drive will have a node in the drive's node list which has the same id as the document.

Nodes have an optional `parentFolder` field, which is the id of a folder node in the drive when it is defined. If it is undefined, the node is a direct child of the drive.

A given folder node's children are the nodes in the drive's node list which have their parent folder set to the folder node's id.

```ts
type FileNode = {
  documentType: string;
  id: string;
  kind: string;
  name: string;
  parentFolder: string | null | undefined;
};

type FolderNode = {
  id: string;
  kind: string;
  name: string;
  parentFolder: string | null | undefined;
};

type Node = FileNode | FolderNode;
```

<details>
<summary>useNodes</summary>

Ideally you should not need to handle the list of nodes directly, since we already provide documents and folders. But these hooks are provided just in case.

```ts
function useNodes(): Node[] | undefined;
```

Returns the nodes for a drive.

Usage

```jsx
import { useNodes } from "@powerhousedao/state";

function MyEditorComponent() {
  const nodes = useNodes();
}
```

</details>

<details>
<summary>useNodeById</summary>

```ts
function useNodeById(id: string | null | undefined): Node | undefined;
```

Returns a node in the selected drive by id.

Usage

```jsx
import { useNodeById } from "@powerhousedao/state";

function MyEditorComponent() {
  const myFolderId = "some-folder-id";
  const myDocumentId = "some-document-id";
  const myFolderNode = useNodeById(myFolderId);
  const myFileNode = useNodeById(myDocumentId);
}
```

</details>

<details>
<summary>useSelectedFolder</summary>

```ts
function useSelectedFolder(): FolderNode | undefined;
```

Returns the selected folder. You can set the selected folder with `setSelectedNode`

Usage

```jsx
import { useSelectedFolder } from "@powerhousedao/state";

function MyEditorComponent() {
  const selectedFolder = useSelectedFolder();
}
```

</details>

<details>
<summary>useSelectedNodePath</summary>

```ts
function useSelectedNodePath(): Node[];
```

Returns the path to the selected node. Useful for navigational components like breadcrumbs.

Usage

```jsx
import { useSelectedNodePath } from '@powerhousedao/state';

function MyEditorComponent() {
  const nodes = useSelectedNodePath();

  return <Breadcrumbs nodes={nodes}>
}
```

</details>

<details>
<summary>useChildNodes/useFolderChildNodes/useFileChildNodes</summary>

```ts
function useChildNodes(): Node[];
```

Returns the child nodes for the selected drive or folder.

```ts
function useFolderChildNodes(): FolderNode[];
```

Returns the folder child nodes for the selected drive or folder.

```ts
function useFileChildNodes(): FileNode[];
```

Returns the file (document) child nodes for the selected drive or folder.

Usage

```jsx
import { useChildNodes, useFolderChildNodes, useFileChildNodes } from '@powerhousedao/state';

function MyEditorComponent() {
  const nodes = useChildNodes();
  const fileNodes = useChildFileNodes();
  const folderNodes = useChildFolderNodes();

  return (
    <div>
     <FilesAndFolders nodes={nodes}>
     <Files fileNodes={fileNodes}>
     <Folders folderNodes={folderNodes}>
    </div>
 )
}
```

</details>

<details>
<summary>useChildNodesForId/useFolderChildNodesForId/useFileChildNodesForId</summary>

```ts
function useChildNodesForId(id: string | null | undefined): Node[];
```

Returns the child nodes for a drive or folder by id.

```ts
function useFolderChildNodesForId(id: string | null | undefined): FolderNode[];
```

Returns the folder child nodes for a drive or folder by id.

```ts
function useFileChildNodesForId(id: string | null | undefined): FileNode[];
```

Returns the file (document) child nodes for a drive or folder by id.

Usage

```jsx
import { useChildNodesForId, useFolderChildNodesForId, useFileChildNodesForId } from '@powerhousedao/state';

function MyEditorComponent() {
  const driveOrFolderId = 'some-drive-or-folder-id';
  const nodes = useChildNodesForId(driveOrFolderId);
  const fileNodes = useFileChildNodesForId(driveOrFolderId);
  const folderNodes = useFolderChildNodesForId(driveOrFolderId);

  return (
    <div>
     <FilesAndFolders nodes={nodes}>
     <Files fileNodes={fileNodes}>
     <Folders folderNodes={folderNodes}>
    </div>
 )
}
```

</details>

<details>
<summary>useNodeName/useNodeKind</summary>

```ts
function useNodeName(id: string | null | undefined): string | undefined;
```

Returns the name of a node.

```ts
function useNodeKind(id: string | null | undefined): NodeKind | undefined;
```

Returns the kind of a node.

Usage

```jsx
import { useNodeName, useNodeKind } from "@powerhousedao/state";

function MyEditorComponent() {
  const nodeId = "some-node-id";
  const nodeName = useNodeName(nodeId);
  const nodeKind = useNodeKind(nodeId);

  if (nodeKind === "file") {
    return <File name={nodeName} />;
  }

  if (nodeKind === "folder") {
    return <Folder name={nodeName} />;
  }
}
```

</details>

### Vetra packages and modules

Vetra packages hold code which can plug into your Connect application. This includes common default modules like the document model document model editor and document drive document model, as well as the modules from your local project and the various packages you have installed.

These modules can be for:

- document models
- editors
- subgraphs
- import scripts
- processors

Each Vetra package contains a `modules` field which optionally contains lists of these modules.

<details>
<summary>useVetraPackages</summary>

```ts
function useVetraPackages(): VetraPackage[] | undefined;
```

Returns all of the Vetra packages in your Connect app.

Usage

```jsx
import { useVetraPackages } from "@powerhousedao/state";

function MyEditorComponent() {
  const vetraPackages = useVetraPackages();
}
```

</details>

<details>
<summary>useDocumentModelModules</summary>

```ts
function useDocumentModelModules(): DocumentModelModule[] | undefined;
```

Returns the document model modules from your Vetra packages.

Usage

```jsx
import { useDocumentModelModules } from "@powerhousedao/state";

function MyEditorComponent() {
  const documentModelModules = useDocumentModelModules();
}
```

</details>

<details>
<summary>useDocumentModelModuleById</summary>

```ts
function useDocumentModelModuleById(): DocumentModelModule[] | undefined;
```

Returns the document model for a given id (document type).
_NOTE_ What we call here an id is really the value in the "document type" field in the document model editor
_NOTE_ Connect assumes that these document types (ids) are unique. It is your responsibility to enforce this.

Usage

```jsx
import { useDocumentModelModuleById } from "@powerhousedao/state";

function MyEditorComponent() {
  const documentType = "my-org/my-document";
  const documentModelModuleById = useDocumentModelModuleById(documentType);
}
```

</details>

<details>
<summary>useEditorModules</summary>

```ts
function useEditorModules(): EditorModule[] | undefined;
```

Returns the editor modules from your Vetra packages.

Usage

```jsx
import { useEditorModules } from "@powerhousedao/state";

function MyEditorComponent() {
  const editorModules = useEditorModules();
}
```

</details>

<details>
<summary>useDriveEditorModules</summary>

```ts
function useDriveEditorModules(): DriveEditorModule[] | undefined;
```

Returns the drive editor modules from your Vetra packages.

Usage

```jsx
import { useDriveEditorModules } from "@powerhousedao/state";

function MyDriveEditorComponent() {
  const driveEditorModules = useDriveEditorModules();
}
```

</details>

<details>
<summary>useProcessorModules</summary>

```ts
function useProcessorModules(): ProcessorModule[] | undefined;
```

Returns the processor modules from your Vetra packages.

Usage

```jsx
import { useProcessorModules } from "@powerhousedao/state";

function MyProcessorComponent() {
  const processorModules = useProcessorModules();
}
```

</details>

<details>
<summary>useSubgraphModules</summary>

```ts
function useSubgraphModules(): SubgraphModule[] | undefined;
```

Returns the subgraph modules from your Vetra packages.

Usage

```jsx
import { useSubgraphModules } from "@powerhousedao/state";

function MySubgraphComponent() {
  const subgraphModules = useSubgraphModules();
}
```

</details>

<details>
<summary>useImportScriptModules</summary>

```ts
function useImportScriptModules(): ImportScriptModule[] | undefined;
```

Returns the import script modules from your Vetra packages.

Usage

```jsx
import { useImportScriptModules } from "@powerhousedao/state";

function MyImportScriptComponent() {
  const importScriptModules = useImportScriptModules();
}
```

</details>

## More documentation coming soon!

Global access to drive state: A top-level, possibly context-based, way to introspect and interact with any document and its state tree without manually passing things around.

Global dispatcher access: A utility or API (probably a hook or service function) where they give a document ID and get back all the relevant dispatch functions — kind of like a command palette for document ops.

### Core Hooks & Patterns

- useDocumentField
- useReadDocumentField
- useUpdateDocumentField
- useDocumentDispatch(docId): updateX, delete, ...

### Global Drive Access

- How to access and manipulate the global document tree
- How to inspect children from parent context
- Tree traversal utilities (if any)

### Convenience APIs

- Utility functions like getDispatchFunctions(docId)
- "Quick Start" to manipulate any document like a pro

### Working with Context

- DriveContext: what lives there, how to use it
- Example: using context to get current doc, sibling docs

### Best Practices & Patterns

- When to use useDocumentField vs getDispatch
- Composing document fields into custom logic
