---
toc_max_heading_level: 2
---

# React Hooks

This page provides a reference for the hooks available in `@powerhousedao/reactor-browser`. These hooks are intended to be used by editors (including drive editors) which will be rendered inside Powerhouse host-applications such as Connect, Switchboard, Fusion or a Vetra Studio Drive.

- Learn more about [Editors](/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors)
- Learn more about [Drive-apps](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer)

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

## Key Concepts

### Reactor

All of the data used by these hooks is ultimately derived from the `Reactor`, which manages the asynchronous eventually consistent state of drives and documents. Learn more about the [Reactor](/academy/Architecture/WorkingWithTheReactor).

### Dispatch Function

Many hooks return a `dispatch` function for modifying documents. The dispatch function has this signature:

```typescript
function dispatch(
  actionOrActions: Action | Action[] | undefined,
  onErrors?: (errors: Error[]) => void
): void
```

**Parameters:**
- `actionOrActions` — The action or array of actions to dispatch to the document
- `onErrors` — Optional callback invoked with any errors that occurred during action execution

---

## Quick Reference

| Category | Hooks |
|----------|-------|
| **Selected Document** | `useSelectedDocument`, `useSelectedDocumentId`, `useSelectedDocumentOfType` |
| **Document by ID** | `useDocumentById`, `useDocumentsByIds`, `useDocumentOfType` |
| **Document Cache** | `useDocumentCache`, `useGetDocument`, `useGetDocuments`, `useGetDocumentAsync` |
| **Drives** | `useDrives`, `useSelectedDrive`, `useSelectedDriveSafe`, `useSelectedDriveId` |
| **Nodes & Folders** | `useSelectedNode`, `useSelectedFolder`, `useNodeById`, `useNodePathById` |
| **Items in Drive** | `useNodesInSelectedDrive`, `useFileNodesInSelectedDrive`, `useFolderNodesInSelectedDrive`, `useDocumentsInSelectedDrive` |
| **Items in Folder** | `useNodesInSelectedFolder`, `useFileNodesInSelectedFolder`, `useFolderNodesInSelectedFolder`, `useDocumentsInSelectedFolder` |
| **Node Actions** | `useNodeActions` |
| **Modals** | `usePHModal`, `showPHModal`, `closePHModal`, `showCreateDocumentModal`, `showDeleteNodeModal` |
| **Revision History** | `useRevisionHistoryVisible`, `showRevisionHistory`, `hideRevisionHistory` |
| **Timeline** | `useSelectedTimelineItem`, `useSelectedTimelineRevision` |
| **Config** | `useAllowedDocumentTypes`, `useIsDragAndDropEnabled`, `useIsExternalControlsEnabled` |

---

## Selected Document

### `useSelectedDocumentId`

Returns the ID of the currently selected document.

```typescript
function useSelectedDocumentId(): string | undefined
```

**Returns:** The selected document's ID, or `undefined` if no file node is selected.

---

### `useSelectedDocument`

Returns the selected document along with a dispatch function.

```typescript
function useSelectedDocument(): readonly [
  PHDocument | undefined,
  (actionOrActions: Action | Action[] | undefined, onErrors?: (errors: Error[]) => void) => void
]
```

**Returns:** A tuple `[document, dispatch]` where:
- `document` — The selected document, or `undefined` if none selected
- `dispatch` — A function to dispatch actions to the document

**Example:**

```tsx
import { useSelectedDocument } from '@powerhousedao/reactor-browser';

function DocumentViewer() {
  const [document, dispatch] = useSelectedDocument();

  if (!document) {
    return <p>No document selected</p>;
  }

  return (
    <div>
      <h1>{document.name}</h1>
      <p>Type: {document.header.documentType}</p>
    </div>
  );
}
```

**See also:** [`useSelectedDocumentOfType`](#useselecteddocumentoftype), [`useDocumentById`](#usedocumentbyid)

---

### `useSelectedDocumentOfType`

Returns the selected document of a specific type along with a dispatch function. Throws an error if the found document has a different type.

```typescript
function useSelectedDocumentOfType<TDocument extends PHDocument, TAction extends Action>(
  documentType: string
): [TDocument, DocumentDispatch<TAction>]

function useSelectedDocumentOfType(documentType: null | undefined): never[]
```

**Parameters:**
- `documentType` — The expected document type string (e.g., `"powerhouse/budget-statement"`)

**Returns:** A tuple `[document, dispatch]` with the document typed as `TDocument`.

**Throws:**
- `NoSelectedDocumentError` — When no document is selected

**Example:**

```tsx
import { useSelectedDocumentOfType } from '@powerhousedao/reactor-browser';
import type { BudgetStatementDocument, BudgetStatementAction } from './types';

function BudgetEditor() {
  const [document, dispatch] = useSelectedDocumentOfType<
    BudgetStatementDocument,
    BudgetStatementAction
  >('powerhouse/budget-statement');

  const handleUpdate = () => {
    dispatch(
      { type: 'UPDATE_BUDGET', input: { amount: 1000 } },
      (errors) => console.error('Failed:', errors)
    );
  };

  return <div>{/* editor UI */}</div>;
}
```

---

## Document by ID

### `useDocumentById`

Returns a document by ID along with a dispatch function.

```typescript
function useDocumentById(
  id: string | null | undefined
): readonly [PHDocument | undefined, (actionOrActions: Action | Action[] | undefined, onErrors?: (errors: Error[]) => void) => void]
```

**Parameters:**
- `id` — The document ID to retrieve, or `null`/`undefined` to skip retrieval

**Returns:** A tuple `[document, dispatch]` where:
- `document` — The document if found, or `undefined`
- `dispatch` — A function to dispatch actions to the document

**Example:**

```tsx
import { useDocumentById } from '@powerhousedao/reactor-browser';

function DocumentCard({ documentId }: { documentId: string }) {
  const [document, dispatch] = useDocumentById(documentId);

  if (!document) {
    return <p>Loading...</p>;
  }

  return <div>{document.name}</div>;
}
```

---

### `useDocumentsByIds`

Returns multiple documents by their IDs.

```typescript
function useDocumentsByIds(ids: string[] | null | undefined): PHDocument[]
```

**Parameters:**
- `ids` — Array of document IDs to retrieve, or `null`/`undefined` to skip

**Returns:** An array of documents. Returns an empty array if `ids` is `null`/`undefined`.

---

### `useDocumentOfType`

Returns a document of a specific type. Throws an error if the document has a different type.

```typescript
function useDocumentOfType<TDocument extends PHDocument, TAction extends Action>(
  documentId: string | null | undefined,
  documentType: string | null | undefined
): [TDocument, DocumentDispatch<TAction>] | never[]
```

**Parameters:**
- `documentId` — The document ID to retrieve
- `documentType` — The expected document type

**Throws:**
- `DocumentNotFoundError` — When the document doesn't exist
- `DocumentModelNotFoundError` — When the document model isn't registered
- `DocumentTypeMismatchError` — When the document type doesn't match

---

## Document Cache

### `useDocumentCache`

Returns the document cache containing all documents in the reactor.

```typescript
function useDocumentCache(): IDocumentCache | undefined
```

---

### `useGetDocument`

Retrieves a document from the reactor and subscribes to changes using React Suspense. This hook will suspend rendering while the document is loading.

```typescript
function useGetDocument(id: string | null | undefined): PHDocument | undefined
```

**Parameters:**
- `id` — The document ID to retrieve, or `null`/`undefined` to skip retrieval

**Returns:** The document if found, or `undefined` if `id` is `null`/`undefined`.

---

### `useGetDocuments`

Retrieves multiple documents from the reactor using React Suspense. This hook will suspend rendering while any of the documents are loading.

```typescript
function useGetDocuments(ids: string[] | null | undefined): PHDocument[]
```

**Parameters:**
- `ids` — Array of document IDs to retrieve, or `null`/`undefined` to skip retrieval

**Returns:** An array of documents. Returns an empty array if `ids` is `null`/`undefined`.

---

### `useGetDocumentAsync`

Retrieves a document from the reactor without suspending rendering. Returns the current state of the document loading operation.

```typescript
function useGetDocumentAsync(id: string | null | undefined): {
  status: "initial" | "pending" | "success" | "error";
  data: PHDocument | undefined;
  isPending: boolean;
  error: Error | undefined;
  reload: (() => Promise<PHDocument>) | undefined;
}
```

**Parameters:**
- `id` — The document ID to retrieve, or `null`/`undefined` to skip retrieval

**Returns:** An object containing:
- `status` — `"initial"` | `"pending"` | `"success"` | `"error"`
- `data` — The document if successfully loaded
- `isPending` — Boolean indicating if the document is currently loading
- `error` — Any error that occurred during loading
- `reload` — Function to force reload the document from cache

**Example:**

```tsx
import { useGetDocumentAsync } from '@powerhousedao/reactor-browser';

function AsyncDocumentLoader({ id }: { id: string }) {
  const { status, data, isPending, error, reload } = useGetDocumentAsync(id);

  if (status === 'initial' || isPending) {
    return <p>Loading...</p>;
  }

  if (status === 'error') {
    return (
      <div>
        <p>Error: {error?.message}</p>
        <button onClick={() => reload?.()}>Retry</button>
      </div>
    );
  }

  return <div>{data?.name}</div>;
}
```

---

## Drives

### `useDrives`

Returns all drives in the reactor.

```typescript
function useDrives(): DocumentDriveDocument[] | undefined
```

**Example:**

```tsx
import { useDrives } from '@powerhousedao/reactor-browser';

function DriveList() {
  const drives = useDrives();

  return (
    <ul>
      {drives?.map((drive) => (
        <li key={drive.header.id}>{drive.header.slug}</li>
      ))}
    </ul>
  );
}
```

---

### `useSelectedDriveId`

Returns the ID of the currently selected drive.

```typescript
function useSelectedDriveId(): string | undefined
```

---

### `useSelectedDrive`

Returns the selected drive along with a dispatch function. **Throws an error if no drive is selected.**

```typescript
function useSelectedDrive(): [DocumentDriveDocument, DocumentDispatch<DocumentDriveAction>]
```

**Returns:** A tuple `[drive, dispatch]`.

**Throws:** `Error` with message `"There is no drive selected. Did you mean to call 'useSelectedDriveSafe'?"`

**See also:** [`useSelectedDriveSafe`](#useselecteddrivesafe)

---

### `useSelectedDriveSafe`

Returns the selected drive, or `undefined` if no drive is selected. Use this when you need to handle the "no drive selected" case gracefully.

```typescript
function useSelectedDriveSafe(): 
  | [DocumentDriveDocument, DocumentDispatch<DocumentDriveAction>]
  | readonly [undefined, undefined]
```

**Returns:** A tuple `[drive, dispatch]` or `[undefined, undefined]` if no drive is selected.

**Example:**

```tsx
import { useSelectedDriveSafe } from '@powerhousedao/reactor-browser';

function DriveHeader() {
  const [drive, dispatch] = useSelectedDriveSafe();

  if (!drive) {
    return <p>Select a drive to get started</p>;
  }

  return <h1>{drive.header.slug}</h1>;
}
```

---

### `setSelectedDrive`

Sets the selected drive and updates the URL.

```typescript
function setSelectedDrive(driveOrDriveSlug: string | DocumentDriveDocument | undefined): void
```

**Parameters:**
- `driveOrDriveSlug` — The drive object, drive slug string, or `undefined` to deselect

---

## Selected Node & Folder

### `useSelectedNode`

Returns the currently selected node (file or folder).

```typescript
function useSelectedNode(): Node | undefined
```

---

### `setSelectedNode`

Sets the selected node and updates the URL.

```typescript
function setSelectedNode(nodeOrNodeSlug: Node | string | undefined): void
```

**Parameters:**
- `nodeOrNodeSlug` — The node object, node slug string, or `undefined` to deselect

---

### `useSelectedFolder`

Returns the selected folder. Returns `undefined` if the selected node is not a folder.

```typescript
function useSelectedFolder(): FolderNode | undefined
```

---

### `useNodeById`

Returns a node in the selected drive by ID.

```typescript
function useNodeById(id: string | null | undefined): Node | undefined
```

**Parameters:**
- `id` — The node ID to find

---

### `useNodePathById`

Returns the path (array of ancestor nodes) to a node in the selected drive.

```typescript
function useNodePathById(id: string | null | undefined): Node[]
```

**Parameters:**
- `id` — The node ID to get the path for

**Returns:** An array of nodes from root to the target node. Returns an empty array if the node is not found.

---

### `useSelectedNodePath`

Returns the path to the currently selected node.

```typescript
function useSelectedNodePath(): Node[]
```

---

## Items in Selected Drive

### `useNodesInSelectedDrive`

Returns all nodes (files and folders) in the selected drive.

```typescript
function useNodesInSelectedDrive(): Node[] | undefined
```

---

### `useFileNodesInSelectedDrive`

Returns only the file nodes in the selected drive.

```typescript
function useFileNodesInSelectedDrive(): FileNode[] | undefined
```

---

### `useFolderNodesInSelectedDrive`

Returns only the folder nodes in the selected drive.

```typescript
function useFolderNodesInSelectedDrive(): FolderNode[] | undefined
```

---

### `useDocumentsInSelectedDrive`

Returns all documents in the selected drive.

```typescript
function useDocumentsInSelectedDrive(): PHDocument[] | undefined
```

---

### `useDocumentTypesInSelectedDrive`

Returns the document types supported by the selected drive, as defined by the document model documents present in the drive.

```typescript
function useDocumentTypesInSelectedDrive(): string[] | undefined
```

---

### `useNodesInSelectedDriveOrFolder`

Returns the child nodes for the selected drive or folder. If a folder is selected, returns its children. Otherwise, returns the root-level nodes of the drive.

```typescript
function useNodesInSelectedDriveOrFolder(): Node[]
```

**Returns:** An array of nodes, sorted by name. Returns an empty array if no drive is selected.

---

## Items in Selected Folder

### `useNodesInSelectedFolder`

Returns all nodes in the selected folder.

```typescript
function useNodesInSelectedFolder(): Node[] | undefined
```

---

### `useFileNodesInSelectedFolder`

Returns only the file nodes in the selected folder.

```typescript
function useFileNodesInSelectedFolder(): FileNode[] | undefined
```

---

### `useFolderNodesInSelectedFolder`

Returns only the folder nodes in the selected folder.

```typescript
function useFolderNodesInSelectedFolder(): FolderNode[] | undefined
```

---

### `useDocumentsInSelectedFolder`

Returns the documents in the selected folder.

```typescript
function useDocumentsInSelectedFolder(): PHDocument[] | undefined
```

---

## Node Actions

### `useNodeActions`

Returns a set of functions for performing file and folder operations in the selected drive.

```typescript
function useNodeActions(): {
  onAddFile: (file: File, parent: Node | undefined) => Promise<Node | undefined>;
  onAddFolder: (name: string, parent: Node | undefined) => Promise<Node | undefined>;
  onRenameNode: (newName: string, node: Node) => Promise<Node | undefined>;
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void>;
  onMoveNode: (src: Node, target: Node | undefined) => Promise<void>;
  onDuplicateNode: (src: Node) => Promise<void>;
  onAddAndSelectNewFolder: (name: string) => Promise<void>;
}
```

**Returned Functions:**

| Function | Description |
|----------|-------------|
| `onAddFile(file, parent)` | Adds a file to the drive under the specified parent folder |
| `onAddFolder(name, parent)` | Creates a new folder under the specified parent |
| `onRenameNode(newName, node)` | Renames a node |
| `onCopyNode(src, target)` | Copies a node to a target folder |
| `onMoveNode(src, target)` | Moves a node to a target folder |
| `onDuplicateNode(src)` | Duplicates a node in the current folder |
| `onAddAndSelectNewFolder(name)` | Creates a new folder and selects it |

**Example:**

```tsx
import { useNodeActions, useSelectedFolder } from '@powerhousedao/reactor-browser';

function FileUploader() {
  const { onAddFile, onAddFolder } = useNodeActions();
  const selectedFolder = useSelectedFolder();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await onAddFile(file, selectedFolder);
    }
  };

  const handleCreateFolder = async () => {
    await onAddFolder('New Folder', selectedFolder);
  };

  return (
    <div>
      <input type="file" onChange={handleFileUpload} />
      <button onClick={handleCreateFolder}>Create Folder</button>
    </div>
  );
}
```

---

## Modals

### `usePHModal`

Returns the currently displayed modal.

```typescript
function usePHModal(): PHModal | undefined
```

**Modal Types:**

```typescript
type PHModal =
  | { type: "createDocument"; documentType: string }
  | { type: "deleteItem"; id: string }
  | { type: "addDrive" }
  | { type: "upgradeDrive"; driveId: string }
  | { type: "deleteDrive"; driveId: string }
  | { type: "driveSettings"; driveId: string }
  | { type: "settings" }
  | { type: "clearStorage" }
  | { type: "debugSettings" }
  | { type: "disclaimer" }
  | { type: "cookiesPolicy" }
  | { type: "exportDocumentWithErrors"; documentId: string }
  | { type: "inspector" };
```

---

### `showPHModal`

Shows a modal.

```typescript
function showPHModal(modal: PHModal): void
```

---

### `closePHModal`

Closes the currently displayed modal.

```typescript
function closePHModal(): void
```

---

### `showCreateDocumentModal`

Shows the create document modal for a specific document type.

```typescript
function showCreateDocumentModal(documentType: string): void
```

**Example:**

```tsx
import { showCreateDocumentModal } from '@powerhousedao/reactor-browser';

function CreateButton() {
  return (
    <button onClick={() => showCreateDocumentModal('powerhouse/budget-statement')}>
      Create Budget Statement
    </button>
  );
}
```

---

### `showDeleteNodeModal`

Shows the delete confirmation modal for a node.

```typescript
function showDeleteNodeModal(nodeOrId: Node | string): void
```

**Parameters:**
- `nodeOrId` — The node object or node ID to delete

---

## Revision History

### `useRevisionHistoryVisible`

Returns whether the revision history panel is visible.

```typescript
function useRevisionHistoryVisible(): boolean | undefined
```

---

### `showRevisionHistory`

Shows the revision history panel.

```typescript
function showRevisionHistory(): void
```

---

### `hideRevisionHistory`

Hides the revision history panel.

```typescript
function hideRevisionHistory(): void
```

---

## Timeline

### `useSelectedTimelineItem`

Returns the selected timeline item.

```typescript
function useSelectedTimelineItem(): TimelineItem | null | undefined
```

**Timeline Item Types:**

```typescript
type TimelineBarItem = {
  id: string;
  type: "bar";
  addSize?: 0 | 1 | 2 | 3 | 4;
  delSize?: 0 | 1 | 2 | 3 | 4;
  timestampUtcMs?: string;
  additions?: number;
  deletions?: number;
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

type TimelineDividerItem = {
  id: string;
  type: "divider";
  timestampUtcMs?: string;
  title?: string;
  subtitle?: string;
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

type TimelineItem = TimelineBarItem | TimelineDividerItem;
```

---

### `setSelectedTimelineItem`

Sets the selected timeline item.

```typescript
function setSelectedTimelineItem(item: TimelineItem | null | undefined): void
```

---

### `useSelectedTimelineRevision`

Returns the selected timeline revision.

```typescript
function useSelectedTimelineRevision(): string | number | null | undefined
```

---

### `setSelectedTimelineRevision`

Sets the selected timeline revision.

```typescript
function setSelectedTimelineRevision(revision: string | number | null | undefined): void
```

---

## Document Types

### `useDocumentTypes`

Returns the document types a drive editor supports. Uses `allowedDocumentTypes` config if set, otherwise falls back to all supported document types from the reactor.

```typescript
function useDocumentTypes(): string[] | undefined
```

---

### `useSupportedDocumentTypesInReactor`

Returns the supported document types for the reactor, derived from the registered document model modules.

```typescript
function useSupportedDocumentTypesInReactor(): string[] | undefined
```

---

## Vetra Packages

### `useVetraPackages`

Returns all Vetra packages loaded by the Connect instance.

```typescript
function useVetraPackages(): VetraPackage[] | undefined
```

**VetraPackage Type:**

```typescript
type VetraPackage = {
  id: string;
  name: string;
  description: string;
  category: string;
  author: Author;
  modules: {
    documentModelModules?: VetraDocumentModelModule[];
    editorModules?: VetraEditorModule[];
    subgraphModules?: SubgraphModule[];
    importScriptModules?: ImportScriptModule[];
    processorModules?: VetraProcessorModule[];
  };
};
```

---

### `setVetraPackages`

Sets the Vetra packages for the Connect instance.

```typescript
function setVetraPackages(vetraPackages: VetraPackage[] | undefined): void
```

---

## Switchboard Link

### `useGetSwitchboardLink`

Hook that returns a function to generate a document's switchboard URL. Only returns a function for documents in remote drives. Returns `null` for local drives or when the document/drive cannot be determined.

The returned function generates a fresh bearer token and builds the switchboard URL with authentication when called.

```typescript
function useGetSwitchboardLink(document: PHDocument | undefined): (() => Promise<string>) | null
```

**Parameters:**
- `document` — The document to create a switchboard URL generator for

**Returns:** An async function that returns the switchboard URL, or `null` if not applicable.

**Example:**

```tsx
import { useGetSwitchboardLink, useSelectedDocument } from '@powerhousedao/reactor-browser';

function SwitchboardButton() {
  const [document] = useSelectedDocument();
  const getSwitchboardLink = useGetSwitchboardLink(document);

  if (!getSwitchboardLink) {
    return null; // Not available for local drives
  }

  const handleClick = async () => {
    const url = await getSwitchboardLink();
    window.open(url, '_blank');
  };

  return <button onClick={handleClick}>Open in Switchboard</button>;
}
```

---

## Editor Configuration

### `useIsExternalControlsEnabled`

Gets whether external controls are enabled for a given editor.

```typescript
function useIsExternalControlsEnabled(): boolean | undefined
```

---

### `setIsExternalControlsEnabled`

Sets whether external controls are enabled for a given editor.

```typescript
function setIsExternalControlsEnabled(enabled: boolean | undefined): void
```

---

### `useIsDragAndDropEnabled`

Gets whether drag and drop is enabled for a given drive editor.

```typescript
function useIsDragAndDropEnabled(): boolean | undefined
```

---

### `setIsDragAndDropEnabled`

Sets whether drag and drop is enabled for a given drive editor.

```typescript
function setIsDragAndDropEnabled(enabled: boolean | undefined): void
```

---

### `useAllowedDocumentTypes`

Defines the document types a drive supports. Defaults to all document types registered in the reactor.

```typescript
function useAllowedDocumentTypes(): string[] | undefined
```

---

### `setAllowedDocumentTypes`

Sets the allowed document types for a given drive editor.

```typescript
function setAllowedDocumentTypes(types: string[] | undefined): void
```

---

## Config: Set by Object

### `setPHDriveEditorConfig`

Sets the global drive editor config. Pass in a partial object of the config to set.

```typescript
function setPHDriveEditorConfig(config: Partial<PHDriveEditorConfig>): void
```

**Config Options:**
- `allowedDocumentTypes` — Array of allowed document type strings
- `isDragAndDropEnabled` — Whether drag and drop is enabled

---

### `setPHDocumentEditorConfig`

Sets the global document editor config. Pass in a partial object of the config to set.

```typescript
function setPHDocumentEditorConfig(config: Partial<PHDocumentEditorConfig>): void
```

**Config Options:**
- `isExternalControlsEnabled` — Whether external controls are enabled

---

### `useSetPHDriveEditorConfig`

Wrapper hook that automatically sets the global drive editor config when the component mounts.

```typescript
function useSetPHDriveEditorConfig(config: Partial<PHDriveEditorConfig>): void
```

**Example:**

```tsx
import { useSetPHDriveEditorConfig } from '@powerhousedao/reactor-browser';

function MyDriveEditor() {
  useSetPHDriveEditorConfig({
    isDragAndDropEnabled: true,
    allowedDocumentTypes: ['powerhouse/budget-statement', 'powerhouse/invoice'],
  });

  return <div>{/* editor content */}</div>;
}
```

---

### `useSetPHDocumentEditorConfig`

Wrapper hook that automatically sets the global document editor config when the component mounts.

```typescript
function useSetPHDocumentEditorConfig(config: Partial<PHDocumentEditorConfig>): void
```

---

## Config: Get by Key

### `usePHDriveEditorConfigByKey`

Gets the value of an item in the global drive config for a given key. Strongly typed, inferred from type definition for the key.

```typescript
function usePHDriveEditorConfigByKey<TKey extends PHDriveEditorConfigKey>(
  key: TKey
): PHDriveEditorConfig[TKey]
```

---

### `usePHDocumentEditorConfigByKey`

Gets the value of an item in the global document config for a given key. Strongly typed, inferred from type definition for the key.

```typescript
function usePHDocumentEditorConfigByKey<TKey extends PHDocumentEditorConfigKey>(
  key: TKey
): PHDocumentEditorConfig[TKey]
```
