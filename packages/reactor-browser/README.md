# Reactor Browser Hooks API Documentation

This document contains all documentation comments for the hooks exported from `packages/reactor-browser/src/hooks/index.ts`.

## Table of Contents

- [Allowed Document Model Modules](#allowed-document-model-modules)
- [Child Nodes](#child-nodes)
- [Config: Editor](#config-editor)
- [Config: Set Config by Object](#config-set-config-by-object)
- [Config: Use Value by Key](#config-use-value-by-key)
- [Document by ID](#document-by-id)
- [Document Cache](#document-cache)
- [Document of Type](#document-of-type)
- [Document Types](#document-types)
- [Drives](#drives)
- [Items in Selected Drive](#items-in-selected-drive)
- [Items in Selected Folder](#items-in-selected-folder)
- [Modals](#modals)
- [Node by ID](#node-by-id)
- [Node Path](#node-path)
- [Revision History](#revision-history)
- [Selected Document](#selected-document)
- [Selected Drive](#selected-drive)
- [Selected Folder](#selected-folder)
- [Selected Node](#selected-node)
- [Selected Timeline Item](#selected-timeline-item)
- [Supported Document Types](#supported-document-types)
- [Timeline Revision](#timeline-revision)
- [Use Get Switchboard Link](#use-get-switchboard-link)
- [Vetra Packages](#vetra-packages)

---

## Allowed Document Model Modules

### `useAllowedDocumentModelModules`

No documentation available.

---

## Child Nodes

### `useNodesInSelectedDriveOrFolder`

Returns the child nodes for the selected drive or folder.

---

## Document by ID

### `useDocumentById`

Returns a document by id.

### `useDocumentsByIds`

Returns documents by ids.

---

## Document Cache

### `useDocumentCache`

Returns all documents in the reactor.

### `setDocumentCache`

Sets all of the documents in the reactor.

### `addDocumentCacheEventHandler`

Adds an event handler for all of the documents in the reactor.

### `useGetDocument`

Retrieves a document from the reactor and subscribes to changes using React Suspense.
This hook will suspend rendering while the document is loading.

**Parameters:**
- `id` - The document ID to retrieve, or null/undefined to skip retrieval

**Returns:** The document if found, or undefined if id is null/undefined

### `useGetDocuments`

Retrieves multiple documents from the reactor using React Suspense.
This hook will suspend rendering while any of the documents are loading.

**Parameters:**
- `ids` - Array of document IDs to retrieve, or null/undefined to skip retrieval

**Returns:** An array of documents if found, or undefined if ids is null/undefined

### `useGetDocumentAsync`

Retrieves a document from the reactor without suspending rendering.
Returns the current state of the document loading operation.

**Parameters:**
- `id` - The document ID to retrieve, or null/undefined to skip retrieval

**Returns:** An object containing:
- `status`: "initial" | "pending" | "success" | "error"
- `data`: The document if successfully loaded
- `isPending`: Boolean indicating if the document is currently loading
- `error`: Any error that occurred during loading
- `reload`: Function to force reload the document from cache

---

## Document of Type

### `useDocumentOfType`

Returns a document of a specific type, throws an error if the found document has a different type.

---

## Document Types

### `useDocumentTypes`

Returns the document types a drive editor supports.

If present, uses the `allowedDocumentTypes` config value.
Otherwise, uses the supported document types from the reactor.

---

## Drives

### `useDrives`

Returns all of the drives in the reactor.

### `setDrives`

Sets the drives in the reactor.

### `addDrivesEventHandler`

Adds an event handler for the drives.

---

## Items in Selected Drive

### `useNodesInSelectedDrive`

Returns the nodes in the selected drive.

### `useFileNodesInSelectedDrive`

Returns the file nodes in the selected drive.

### `useFolderNodesInSelectedDrive`

Returns the folder nodes in the selected drive.

### `useDocumentsInSelectedDrive`

Returns the documents in the selected drive.

### `useDocumentTypesInSelectedDrive`

Returns the document types supported by the selected drive, as defined by the document model documents present in the drive.

---

## Items in Selected Folder

### `useNodesInSelectedFolder`

Returns the nodes in the selected folder.

### `useFileNodesInSelectedFolder`

Returns the file nodes in the selected folder.

### `useFolderNodesInSelectedFolder`

Returns the folder nodes in the selected folder.

### `useDocumentsInSelectedFolder`

Returns the documents in the selected folder.

---

## Modals

### `usePHModal`

Returns the current modal.

### `setPHModal`

Sets the current modal.

### `addModalEventHandler`

Adds an event handler for the modal.

### `showPHModal`

Shows a modal.

### `closePHModal`

Closes the current modal.

### `showCreateDocumentModal`

Shows the create document modal.

### `showDeleteNodeModal`

Shows the delete node modal.

---

## Node by ID

### `useNodeById`

Returns a node in the selected drive by id.

---

## Node Path

### `useNodePathById`

Returns the path to a node in the selected drive.

### `useSelectedNodePath`

Returns the path to the currently selected node in the selected drive.

---

## Revision History

### `useRevisionHistoryVisible`

Returns whether revision history is visible.

### `setRevisionHistoryVisible`

Sets revision history visibility.

### `addRevisionHistoryVisibleEventHandler`

Adds event handler for revision history visibility.

### `showRevisionHistory`

Shows the revision history.

### `hideRevisionHistory`

Hides the revision history.

---

## Selected Document

### `useSelectedDocumentId`

Returns the selected document id.

### `useSelectedDocument`

Returns the selected document.

### `useSelectedDocumentOfType`

Returns the selected document of a specific type, throws an error if the found document has a different type.

---

## Selected Drive

### `useSelectedDriveId`

Returns the selected drive id.

### `setSelectedDriveId`

Sets the selected drive id.

### `addSelectedDriveIdEventHandler`

Adds an event handler for the selected drive id.

### `useSelectedDrive`

Returns the selected drive.

### `useSelectedDriveSafe`

Returns the selected drive, or undefined if no drive is selected.

---

## Selected Folder

### `useSelectedFolder`

Returns the selected folder.

---

## Selected Node

### `useSelectedNode`

Returns the selected node.

### `setSelectedNode`

Sets the selected node (file or folder).

---

## Selected Timeline Item

### `useSelectedTimelineItem`

Returns the selected timeline item.

### `setSelectedTimelineItem`

Sets the selected timeline item.

### `addSelectedTimelineItemEventHandler`

Adds event handler for selected timeline item.

---

## Supported Document Types

### `useSupportedDocumentTypesInReactor`

Returns the supported document types for the reactor (derived from the document model modules).

---

## Timeline Revision

### `useSelectedTimelineRevision`

Returns the selected timeline revision.

### `setSelectedTimelineRevision`

Sets the selected timeline revision.

### `addSelectedTimelineRevisionEventHandler`

Adds an event handler for the selected timeline revision.

---

## Use Get Switchboard Link

### `useGetSwitchboardLink`

Hook that returns a function to generate a document's switchboard URL.
Only returns a function for documents in remote drives.
Returns null for local drives or when the document/drive cannot be determined.

The returned function generates a fresh bearer token and builds the switchboard URL
with authentication when called.

**Parameters:**
- `document` - The document to create a switchboard URL generator for

**Returns:** An async function that returns the switchboard URL, or null if not applicable

---

## Vetra Packages

### `useVetraPackages`

Returns all of the Vetra packages loaded by the Connect instance.

### `addVetraPackagesEventHandler`

Adds the Vetra packages event handler.

### `setVetraPackages`

Sets the Vetra packages for the Connect instance.

---


## Config: Editor

### `setIsExternalControlsEnabled`

Sets whether external controls are enabled for a given editor.

### `useIsExternalControlsEnabled`

Gets whether external controls are enabled for a given editor.

### `addIsExternalControlsEnabledEventHandler`

Adds an event handler for when the external controls enabled state changes.

### `setIsDragAndDropEnabled`

Sets whether drag and drop is enabled for a given drive editor.

### `useIsDragAndDropEnabled`

Gets whether drag and drop is enabled for a given drive editor.

### `addIsDragAndDropEnabledEventHandler`

Adds an event handler for when the drag and drop enabled state changes.

### `setAllowedDocumentTypes`

Sets the allowed document types for a given drive editor.

### `useAllowedDocumentTypes`

Defines the document types a drive supports.

Defaults to all of the document types registered in the reactor.

### `addAllowedDocumentTypesEventHandler`

Adds an event handler for when the allowed document types for a given drive editor changes.

---

## Config: Set Config by Object

### `setPHDriveEditorConfig`

Sets the global drive config.

Pass in a partial object of the global drive config to set.

### `setPHDocumentEditorConfig`

Sets the global document config.

Pass in a partial object of the global document config to set.

### `useSetPHDriveEditorConfig`

Wrapper hook for setting the global drive editor config.

Automatically sets the global drive editor config when the component mounts.

Pass in a partial object of the global drive editor config to set.

### `useSetPHDocumentEditorConfig`

Wrapper hook for setting the global document editor config.

Automatically sets the global document editor config when the component mounts.

Pass in a partial object of the global document editor config to set.

---

## Config: Use Value by Key

### `usePHDriveEditorConfigByKey`

Gets the value of an item in the global drive config for a given key.

Strongly typed, inferred from type definition for the key.

### `usePHDocumentEditorConfigByKey`

Gets the value of an item in the global document config for a given key.

Strongly typed, inferred from type definition for the key.

---
