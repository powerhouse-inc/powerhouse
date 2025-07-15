# State Management

This package provides state management utilities for Powerhouse applications using Jotai atoms. It manages the state of reactors, drives, nodes, documents, and related entities.

## Overview

The state management system is built around several key concepts:

- **Reactor**: The reactor instance that manages drives and documents
- **Drives**: Document drive instances that contain nodes
- **Nodes**: Items within a drive (documents, files, meta entities such as folder, etc.)
- **Documents**: Documents within a drive, which correspond to nodes
- **Loadable States**: Async state management with loading, error, and success states

## Core Hooks

### Reactor Management

#### `useReactor()`
Returns a loadable of the reactor instance.

#### `useUnwrappedReactor()`
Returns the resolved reactor instance, will be undefined while pending

#### `useInitializeReactor(createReactor, shouldNavigate?)`
Initializes the reactor by:
- Creating the reactor instance
- Setting the selected drive and node from the URL if `shouldNavigate` is true
- Subscribing to reactor events and refreshing drives/documents when they change
- Does nothing if the reactor is already initialized

### Drive Management

#### `useDrives()`
Returns a loadable of the drives for a reactor.

#### `useUnwrappedDrives()`
Returns a resolved promise of the drives for a reactor.

#### `useRefreshDrives()`
Refreshes the drives for a reactor.

#### `useDriveById(id)`
Returns a loadable of a drive for a reactor by ID.

#### `useUnwrappedDriveById(id)`
Returns a resolved promise of a drive for a reactor by ID.

#### `useSelectedDrive()`
Returns a loadable of the selected drive.

#### `useUnwrappedSelectedDrive()`
Returns a resolved promise of the selected drive.

#### `useSetSelectedDrive(driveId, shouldNavigate?)`
Returns a function that sets the selected drive with a drive ID. If `shouldNavigate` is true, the URL will be updated to the new drive.

#### `useDriveRemoteUrl(driveId)`
Returns a loadable of the remote URL for a drive.

#### `useDrivePullResponderTrigger(driveId)`
Returns a loadable of the pull responder trigger for a drive.

#### `useDrivePullResponderUrl(driveId)`
Returns a loadable of the pull responder URL for a drive.

#### `useDriveIsRemote(driveId)`
Returns a loadable of whether a drive is remote.

#### `useDriveSharingType(driveId)`
Returns a loadable of the sharing type for a drive.

#### `useIsDriveAvailableOffline(driveId)`
Returns a loadable of whether a drive is available offline.

### Node Management

#### `useNodes()`
Returns a loadable of the nodes for a reactor.

#### `useUnwrappedNodes()`
Returns a resolved promise of the nodes for a reactor.

#### `useNodeById(id)`
Returns a resolved promise of a node for a reactor by ID.

#### `useParentFolder(id)`
Returns a resolved promise of the parent folder for a node.

#### `useNodePath(id)`
Returns a loadable of the path to a node.

#### `useChildNodes()`
Returns a loadable of the child nodes for the selected drive or folder.

#### `useNodeKind(id)`
Returns the kind of a node.

#### `useSetSelectedNode(nodeId, shouldNavigate?)`
Returns a function that sets the selected node with a node ID. If `shouldNavigate` is true, the URL will be updated to the new node.

### Folder Management

#### `useSelectedFolder()`
Returns a loadable of the selected folder.

#### `useUnwrappedSelectedFolder()`
Returns a resolved promise of the selected folder.

### Document Management

#### `useDocuments()`
Returns a loadable of the documents for a reactor.

#### `useUnwrappedDocuments()`
Returns a resolved promise of the documents for a reactor.

#### `useRefreshDocuments()`
Refreshes the documents for a reactor.

#### `useSelectedDocument()`
Returns a loadable of the selected document.

#### `useUnwrappedSelectedDocument()`
Returns a resolved promise of the selected document.

#### `useDocumentById(id)`
Returns a loadable of a document for a reactor by ID.

#### `useUnwrappedDocumentById(id)`
Returns a resolved promise of a document for a reactor by ID.

## Utility Functions

### Node Utilities

#### `sortNodesByName(nodes)`
Sorts nodes by name in alphabetical order.

#### `isFileNodeKind(node)`
Returns whether a node is a file.

#### `isFolderNodeKind(node)`
Returns whether a node is a folder.

### Drive Utilities

#### `getDriveSharingType(drive)`
Returns the sharing type for a drive (LOCAL, CLOUD, or PUBLIC).

#### `getDriveAvailableOffline(drive)`
Returns whether a drive is available offline.

## Types

### Core Types

- `Reactor`: The reactor instance type (alias for IDocumentDriveServer)
- `Loadable<T>`: Async state wrapper with loading, error, and success states
- `NodeKind`: Union type of "FOLDER" | "FILE"

## Important Notes

**The contents of `atoms.ts` are not exported from the library.** This file contains the internal Jotai atom definitions that power the state management system. The atoms are implementation details and should not be accessed directly by consumers of this package.

## Usage Example

```tsx
import { useInitializeReactor, useSelectedDrive, useChildNodes } from '@powerhouse/common/state';

function MyComponent() {
  const selectedDrive = useSelectedDrive();
  // Use the state...

  if (selectedDrive.state === 'loading') {
    return <div>Loading drive...</div>
  }

  if (selectedDrive.state === 'hasError') {
    // now the `error` field of `selectedDrive` has a value
    return <MyErrorComponent error={selectedDrive.error} />
  }

  // since we are only left with the `hasData` possibility for `selectedDrive.state`, 
  // we know that the `data` field of `selectedDrive` has a value we can render
  return <MyDriveEditorComponent drive={selectedDrive.data} />
}
```

If you know the type of your document, you can get inference of the fields

```ts
type MyState = {
  stuff: String[];
}

type MyDocument = PHDocument<MyState>
```

```tsx
function MyDocumentEditor(documentId: string) {
  const document = useDocumentById<MyDocument>(documentId);

  if (document.state === 'loading') return "...loading";
  if (document.state === 'hasError') return "Error getting document";

  const stuff = document.data.state.global.stuff;

  return <MyStuff stuff={stuff} />
}
```