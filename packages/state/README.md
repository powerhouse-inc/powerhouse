# Editor state management hooks

This library provides hooks intended to be used by editors (including drive editors) which will be rendered inside of Powerhouse applications such as Connect and Vetra.

## Key concepts

### Reactor

All of the data used by these hooks is ultimately derived from the `Reactor`, which manages the asynchronous eventually consistent state of drives and documents.

### Initialization

Since the data in our components needs to be synchronized with the state of the parent application, you need to initialize your data on first load.

We have provided a hook for you to use to do this:

`useInitializePHApp`

Your editor components should call this hook at the top of their definition.

### Selected drives, folders and documents
In the application, there are certain items that can be set as "selected". 

- selected drive
- selected folder
- selected document

We provide hooks for getting the selected item for each:

`useSelectedDrive` / `useLoadableSelectedDrive`
`useSelectedFolder` / `useLoadableSelectedFolder`
`useSelectedDocument` / `useLoadableSelectedDocument`

Folders and documents are part of a given drive, so they will both be undefined if the selected drive is undefined.

_Either_ a folder or a document can be selected but not both, so if one is defined then the other will be undefined.

To set the selected drive, we provide a `useSetSelectedDrive` hook which returns a setter function takes a drive id.

To set the selected document/folder, we provide one hook `useSetSelectedNode` which returns a setter function which can be used for _both_ documents and folders. This function takes a `nodeId` which can be either the id of a document or the id of a folder.

### Jotai atoms
Under the hood, we use Jotai atoms in the application, but _you do not need to know anything about Jotai to use them_. The hooks all return the data as represented by their return types.

You can take a look at https://jotai.org/ for interest sake.

### Loadable data
For your convenience, each hook that returns data like `use{Something}` has a corresponding `useLoadable{Something}` which returns the same data wrapped with a `Loadable` object.

The `Loadable` type looks like this:

```ts
type Loadable<Value> = {
    state: 'loading';
} | {
    state: 'hasError';
    error: unknown;
} | {
    state: 'hasData';
    data: Awaited<Value>;
};
```

This allows you to access asynchronous data in your components without needing to await data, and lets you know if data is still pending, in an error state or is available. Note that the `error` key is only defined when `state` is 'hasError', and the `data` key is only available when `state` is 'hasData'.

In practice this looks like:

```jsx
function MyEditor() {
  const loadableSomething = useLoadableSomething();

  if (loadableSomething.state === 'loading') {
    return <div>...loading</div>;
  }

  if (loadableSomething.state === 'hasError') {
    // we know that `loadableSomething.error` is defined
    return <ErrorComponent error={loadableSomething.error} />
  }

  // we have checked the other state possibilities, so now we know that `loadableSomething.data` is defined
  return <MyComponent something={loadableSomething.data} />
}
```

## Hooks

### Initialization

Call the initialization hook at the top level of all of your editor components like so:

```ts
import { useInitializePHApp } from '@powerhousedao/state'

function MyEditor() {
  useInitializePHApp();
}
```

### Reactor
```ts
function useReactor(): Reactor | undefined
```

Returns the reactor instance. 
*NOTE:* The reactor instance does not have a loadable counterpart.

##### Usage
```jsx
import { useReactor } from '@powerhousedao/state`

function MyEditorComponent() {
  const reactor = useReactor();
}
```

### Drives

#### useDrives/useLoadableDrives
```ts
function useDrives(): DocumentDriveDocument[] | undefined
```
Returns the drives for a reactor.

```ts
function useLoadableDrives(): Loadable<DocumentDriveDocument[] | undefined>
```
Returns a loadable of the drives for a reactor.

##### Usage

```jsx
import { useDrives, useLoadableDrives } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const drives = useDrives();
  // returns loading/error/data
  const loadableDrives = useLoadableDrives();
}
```

#### useDriveById/useLoadableDriveById
```ts
function useDriveById(id: string | null | undefined): DocumentDriveDocument | undefined
```

Returns a drive by id.

```ts
function useLoadableDriveById(id: string | null | undefined): Loadable<DocumentDriveDocument | undefined>
```
Returns a loadable of a drive by id.

##### Usage

```jsx
import { useDriveById, useLoadableDriveById } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const driveById = useDriveById();
  // returns loading/error/data
  const loadableDriveById = useLoadableDriveById();
}
```

#### useSelectedDrive/useLoadableSelectedDrive/useSelectedDriveId
```ts
Returns the selected drive */
function useSelectedDrive(): DocumentDriveDocument | undefined
```

Returns the selected drive

```ts
function useLoadableSelectedDrive(): Loadable<DocumentDriveDocument | undefined>

```
Returns a loadable of the selected drive

```ts
function useSelectedDriveId(): string | undefined
```

Uses the `useSelectedDrive` hook and returns the selected drive id. Equivalent to using the `useSelectedDrive` hook to get the selected drive and then accessing `drive.header.id`

##### Usage

```jsx
import { useSelectedDrive, useLoadableSelectedDrive } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const selectedDrive = useSelectedDrive();
  const selectedDriveId = useSelectedDriveId();
  // returns loading/error/data
  const loadableSelectedDrive = useLoadableSelectedDrive();
}
```

#### useSetSelectedDrive
```ts
function useSetSelectedDrive(): (driveId: string | undefined) => void
```
Returns a function that sets the selected drive with a drive id. Call this setter with `undefined` to deselect.

##### Usage

```jsx
import { useSetSelectedDrive } from '@powerhousedao/state';

function MyEditorComponent() {
  // returns a setter function with signature:
  // (driveId: string | undefined) => void
  const setSelectedDrive = useSetSelectedDrive();
  const drives = useDrives();

  return (
    <div>
      {drives?.map((drive) => (
        <button onClick={() => setSelectedDrive(drive.header.id)}>
          {drive.header.name}
        </button>
      ))}
    </div>
  );
}
```

#### drive properties convenience hooks
We provide hooks for accessing various properties on the drive object for your convenience. These use the above hooks to get a drive and then return properties in the object.

```ts
/** Returns the remote URL for a drive. */
function useDriveRemoteUrl(driveId: string | null | undefined): string | undefined

/** Returns the pull responder trigger for a drive. */
function useDrivePullResponderTrigger(
  driveId: string | null | undefined,
): Trigger | undefined

/** Returns the pull responder URL for a drive. */
function useDrivePullResponderUrl(driveId: string | null | undefined): string | undefined

/** Returns whether a drive is remote. */
function useDriveIsRemote(driveId: string | null | undefined): boolean

/** Returns the sharing type for a drive. */
function useDriveSharingType(driveId: string | null | undefined): SharingType | undefined

/** Returns  whether a drive is available offline. */
function useDriveAvailableOffline(driveId: string | null | undefined): boolean
```

##### Usage

```jsx
import { 
  useDriveRemoteUrl,
  useDrivePullResponderTrigger,
  useDrivePullResponderUrl,
  useDriveIsRemote,
  useDriveSharingType,
  useDriveAvailableOffline,
} from '@powerhousedao/state';

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
  })
}
```

### Documents

#### useDocuments/useLoadableDocuments
```ts
function useDocuments(): PHDocument[] | undefined
```
Returns the documents for the selected drive.

```ts
function useLoadableDocuments(): Loadable<PHDocument[] | Promise<PHDocument[]> | undefined>
```
Returns a loadable of the documents for the selected drive.

##### Usage

```jsx
import { useDocuments, useLoadableDocuments } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const documents = useDocuments();
  // returns loading/error/data
  const loadableDocuments = useLoadableDocuments();
}
```

#### useSelectedDocument/useLoadableSelectedDocument
```ts
function useSelectedDocument(): PHDocument | undefined
```
Returns the selected document.

```ts
function useLoadableSelectedDocument(): Loadable<Promise<PHDocument | undefined>>
```
Returns a loadable of the selected document.

##### Usage

```jsx
import { useSelectedDocument, useLoadableSelectedDocument } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const selectedDocument = useSelectedDocument();
  // returns loading/error/data
  const loadableSelectedDocument = useLoadableSelectedDocument();
}
```

#### useDocumentById/useLoadableDocumentById
```ts
function useDocumentById(id: string | null | undefined): PHDocument | undefined
```
Returns a document by id.

```ts
function useLoadableDocumentById(id: string | null | undefined): Loadable<PHDocument | undefined>
```
Returns a loadable of a document by id.

##### Usage

```jsx
import { useDocumentById, useLoadableDocumentById } from '@powerhousedao/state';

function MyEditorComponent() {
  const myDocumentId = 'some-document-id';
  // undefined until loaded
  const documentById = useDocumentById(myDocumentId);
  // returns loading/error/data
  const loadableDocumentById = useLoadableDocumentById(myDocumentId);
}
```

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
}

type FolderNode = {
  id: string;
  kind: string;
  name: string;
  parentFolder: string | null | undefined;
}

type Node = FileNode | FolderNode;
```

#### useNodes/useLoadableNodes
Ideally you should not need to handle the list of nodes directly, since we already provide documents and folders. But these hooks are provided just in case.

```ts
function useNodes(): Node[] | undefined
```
Returns the nodes for a drive.

```ts
function useLoadableNodes(): Loadable<Node[] | undefined>
```
Returns a loadable of the nodes for a drive.

##### Usage

```jsx
import { useNodes, useLoadableNodes } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const nodes = useNodes();
  // returns loading/error/data
  const loadableNodes = useLoadableNodes();
}
```

#### useSetSelectedNode
Use the setter function returned by this hook to set the selected drive or selected folder. Call the setter with `undefined` to deselect.

```ts
function useSetSelectedNode(): (nodeId: string | undefined) => void
```
Returns a function that sets the selected node (document or folder) with a node id.

##### Usage

```jsx
import { useSetSelectedNode } from '@powerhousedao/state';

function MyEditorComponent() {
  const myFolderId = 'some-folder-id';
  const myDocumentId = 'some-document-id';
  const setSelectedNode = useSetSelectedNode();

  return (
    <div>
      <button onClick={() => setSelectedNode(myFolderId)}>Set selected folder</button>
      <button onClick={() => setSelectedNode(myDocumentId)}>Set selected document</button>
    </div>
  )
}
```

#### useNodeById
```ts
function useNodeById(id: string | null | undefined): Node | undefined
```
Returns a node in the selected drive by id.

##### Usage

```jsx
import { useNodeById } from '@powerhousedao/state';

function MyEditorComponent() {
  const myFolderId = 'some-folder-id';
  const myDocumentId = 'some-document-id';
  const myFolderNode = useNodeById(myFolderId);
  const myFileNode = useNodeById(myDocumentId);
}
```

#### useSelectedFolder/useLoadableSelectedFolder
```ts
function useSelectedFolder(): FolderNode | undefined
```
Returns the selected folder.

```ts
function useLoadableSelectedFolder(): Loadable<Promise<FolderNode | undefined>>
```
Returns a loadable of the selected folder.

##### Usage

```jsx
import { useSelectedFolder, useLoadableSelectedFolder } from '@powerhousedao/state';

function MyEditorComponent() {
  // undefined until loaded
  const selectedFolder = useSelectedFolder();
  // returns loading/error/data
  const loadableSelectedFolder = useLoadableSelectedFolder();
}
```

#### useSelectedNodePath
```ts
function useSelectedNodePath(): Node[]
```
Returns the path to the selected node. Useful for navigational components like breadcrumbs.

##### Usage

```jsx
import { useSelectedNodePath } from '@powerhousedao/state';

function MyEditorComponent() {
  const nodes = useSelectedNodePath();

  return <Breadcrumbs nodes={nodes}>
}
```

#### useChildNodes/useFolderChildNodes/useFileChildNodes

```ts
function useChildNodes(): Node[]
```
Returns the child nodes for the selected drive or folder.

```ts
function useFolderChildNodes(): FolderNode[]
```
Returns the folder child nodes for the selected drive or folder.

```ts
function useFileChildNodes(): FileNode[]
```
Returns the file (document) child nodes for the selected drive or folder.

##### Usage

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

#### useChildNodesForId/useFolderChildNodesForId/useFileChildNodesForId
```ts
function useChildNodesForId(id: string | null | undefined): Node[]
```
Returns the child nodes for a drive or folder by id.
```ts
function useFolderChildNodesForId(id: string | null | undefined): FolderNode[]
```
Returns the folder child nodes for a drive or folder by id.
```ts
function useFileChildNodesForId(id: string | null | undefined): FileNode[]
```
Returns the file (document) child nodes for a drive or folder by id.

##### Usage

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

#### useNodeName/useNodeKind
```ts
function useNodeName(id: string | null | undefined): string | undefined
```
Returns the name of a node.
```ts
function useNodeKind(id: string | null | undefined): NodeKind | undefined
```
Returns the kind of a node.

##### Usage

```jsx
import { useNodeName, useNodeKind } from '@powerhousedao/state';

function MyEditorComponent() {
  const nodeId = 'some-node-id';
  const nodeName = useNodeName(nodeId);
  const nodeKind = useNodeKind(nodeId);

  if (nodeKind === 'file') {
    return <File name={nodeName} />;
  }

  if (nodeKind === 'folder') {
    return <Folder name={nodeName} />;
  }
}
```