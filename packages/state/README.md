# Editor state management hooks

This library provides hooks intended to be used by editors (including drive editors) which will be rendered inside of Powerhouse applications such as Connect and Vetra.

## Key concepts

### Reactor

All of the data used by these hooks is ultimately derived from the `Reactor`, which manages the asynchronous eventually consistent state of drives and documents.


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


### Reactor
```ts
function useReactor(): Reactor | undefined
```

Returns the reactor instance. 

##### Usage
```jsx
import { useReactor } from '@powerhousedao/state`

function MyEditorComponent() {
  const reactor = useReactor();
}
```

### Drives

#### useDrives
```ts
function useDrives(): DocumentDriveDocument[] | undefined
```
Returns the drives for a reactor.

##### Usage

```jsx
import { useDrives } from '@powerhousedao/state';

function MyEditorComponent() {
  const drives = useDrives();
}
```

#### useDriveById
```ts
function useDriveById(id: string | null | undefined): DocumentDriveDocument | undefined
```

Returns a drive by id.

##### Usage

```jsx
import { useDriveById } from '@powerhousedao/state';

function MyEditorComponent() {
  const driveById = useDriveById();
}
```

#### useSelectedDrive
```ts
function useSelectedDrive(): DocumentDriveDocument | undefined
```

Returns the selected drive. You can se the selected drive with `setSelectedDrive`.

##### Usage

```jsx
import { useSelectedDrive } from '@powerhousedao/state';

function MyEditorComponent() {
  const selectedDrive = useSelectedDrive();
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

#### useAllDocuments/useSelectedDriveDocuments
```ts
function useAllDocuments(): PHDocument[] | undefined
```
Returns all of the documents in the reactor.

```ts
function useSelectedDriveDocuments(): PHDocument[] | undefined
```
Returns the documents in the reactor for the selected drive.

##### Usage

```jsx
import { useAllDocuments, useSelectedDriveDocuments } from '@powerhousedao/state';

function MyEditorComponent() {
  const allDocuments = useAllDocuments();
  const selectedDriveDocuments = useSelectedDriveDocuments();
}
```

#### useSelectedDocument
```ts
function useSelectedDocument(): PHDocument | undefined
```
Returns the selected document. You can set the selected document with `setSelectedNode`.

##### Usage

```jsx
import { useSelectedDocument } from '@powerhousedao/state';

function MyEditorComponent() {
  const selectedDocument = useSelectedDocument();
}
```

#### useDocumentById
```ts
function useDocumentById(id: string | null | undefined): PHDocument | undefined
```
Returns a document by id.

##### Usage

```jsx
import { useDocumentById } from '@powerhousedao/state';

function MyEditorComponent() {
  const myDocumentId = 'some-document-id';
  const documentById = useDocumentById(myDocumentId);
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

#### useNodes
Ideally you should not need to handle the list of nodes directly, since we already provide documents and folders. But these hooks are provided just in case.

```ts
function useNodes(): Node[] | undefined
```
Returns the nodes for a drive.

##### Usage

```jsx
import { useNodes} from '@powerhousedao/state';

function MyEditorComponent() {
  const nodes = useNodes();
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

#### useSelectedFolder
```ts
function useSelectedFolder(): FolderNode | undefined
```
Returns the selected folder. You can set the selected folder with `setSelectedNode`

##### Usage

```jsx
import { useSelectedFolder } from '@powerhousedao/state';

function MyEditorComponent() {
  const selectedFolder = useSelectedFolder();
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

### Vetra packages and modules

Vetra packages hold code which can plug into your Connect application. This includes common default modules like the document model document model editor and document drive document model, as well as the modules from your local project and the various packages you have installed.

These modules can be for:

- document models
- editors
- subgraphs
- import scripts
- processors

Each Vetra package contains a `modules` field which optionally contains lists of these modules.

#### useVetraPackages

```ts
function useVetraPackages(): VetraPackage[] | undefined
```

Returns all of the Vetra packages in your Connect app.

##### Usage

```jsx
import { useVetraPackages } from '@powerhousedao/state'

function MyEditorComponent() {
  const vetraPackages = useVetraPackages()
}
```

#### useDocumentModelModules

```ts
function useDocumentModelModules(): DocumentModelModule[] | undefined
```

Returns the document model modules from your Vetra packages.

##### Usage

```jsx
import { useDocumentModelModules } from '@powerhousedao/state'

function MyEditorComponent() {
  const documentModelModules = useDocumentModelModules()
}
```

#### useDocumentModelModuleById

```ts
function useDocumentModelModuleById(): DocumentModelModule[] | undefined
```

Returns the document model for a given id (document type).
*NOTE* What we call here an id is really the value in the "document type" field in the document model editor
*NOTE* Connect assumes that these document types (ids) are unique. It is your responsibility to enforce this.

##### Usage

```jsx
import { useDocumentModelModuleById } from '@powerhousedao/state'

function MyEditorComponent() {
  const documentType = 'my-org/my-document';
  const documentModelModuleById = useDocumentModelModuleById(documentType)
}
```

#### useEditorModules

```ts
function useEditorModules(): EditorModule[] | undefined
```

Returns the editor modules from your Vetra packages.

##### Usage

```jsx
import { useEditorModules } from '@powerhousedao/state'

function MyEditorComponent() {
  const editorModules = useEditorModules()
}
```

#### useDriveEditorModules

```ts
function useDriveEditorModules(): DriveEditorModule[] | undefined
```

Returns the drive editor modules from your Vetra packages.

##### Usage

```jsx
import { useDriveEditorModules } from '@powerhousedao/state'

function MyDriveEditorComponent() {
  const driveEditorModules = useDriveEditorModules()
}
```

#### useProcessorModules

```ts
function useProcessorModules(): ProcessorModule[] | undefined
```

Returns the processor modules from your Vetra packages.

##### Usage

```jsx
import { useProcessorModules } from '@powerhousedao/state'

function MyProcessorComponent() {
  const processorModules = useProcessorModules()
}
```

#### useSubgraphModules

```ts
function useSubgraphModules(): SubgraphModule[] | undefined
```

Returns the subgraph modules from your Vetra packages.

##### Usage

```jsx
import { useSubgraphModules } from '@powerhousedao/state'

function MySubgraphComponent() {
  const subgraphModules = useSubgraphModules()
}
```

#### useImportScriptModules

```ts
function useImportScriptModules(): ImportScriptModule[] | undefined
```

Returns the import script modules from your Vetra packages.

##### Usage

```jsx
import { useImportScriptModules } from '@powerhousedao/state'

function MyImportScriptComponent() {
  const importScriptModules = useImportScriptModules()
}
```