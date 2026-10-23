# Drive apps

A drive app is the view Connect shows for a drive: its own listing, forms and tools around the open document. It is an editor module for `powerhouse/document-drive`, shipped by a package like any editor. Routes change Connect around it ([overrides.md](./overrides.md)); this guide is the app itself.

## Make one

Create a `powerhouse/app` document in the Vetra drive, the way `AGENTS.md` makes an editor: give it a name and the document types it holds, then set it to CONFIRMED. Codegen writes `editors/<app-id>/`:

- `editor.tsx`, the app's root. Codegen writes it once and never again, so edit it.
- `components/`, a folder tree, folder contents and a create button to start from; it too stays yours.
- `config.ts`, the app's `allowedDocumentTypes` and drag and drop.

## What it gets

Connect renders the app in the drive route with these props:

- `document`: the drive.
- `dispatch`: bound to the drive, for drive actions such as `addFolder` and `moveNode` from `@powerhousedao/shared/document-drive`. `moveNode({ srcFolder, targetParentFolder })` moves any node: `srcFolder` is the id of the file or folder being moved.
- `children`: the open document's editor, or `null` on a folder or the drive's root. Render it where the document goes, and the app's own view when it is `null`.

Inside it, the `@powerhousedao/reactor-browser` hooks read the route it is shown in:

- `useSelectedDrive()` (a `[drive, dispatch]` pair), `useSelectedFolder()`, `useSelectedNode()` and `useNodesInSelectedDrive()`.
- `useNodesInSelectedDriveOrFolder()` lists the open folder, or the drive's root when no folder is open. `useNodesInSelectedFolder()` and the generated `use<Model>DocumentsInSelectedFolder()` give `undefined` at the root.
- `setSelectedNode(id)` opens a folder or document; `setSelectedNode(undefined)` goes back to the drive's root. Both are router navigations, so Back, Forward and reloads land on the same node.
- `useLinkProps(useNodeTarget(node))` makes a row a real link.
- `getDriveName(drive)` is the drive's display name; drives made in the UI leave `header.name` empty.
- `showCreateDocumentModal(type)` opens Connect's create modal, which adds the document to the open folder and opens it.
- Documents in Connect don't carry their operations: `document.operations.global` is an empty array, however long the history. Read history with `useDocumentOperations(id, "global")`, and the operation count with `document.header.revision.global`.

The `reactor-browser` actions do the same work from outside the app: `addFolder(driveId, name, parentId?)`, `renameDriveNode(driveId, nodeId, name)` and `deleteNode(driveId, nodeId)`.

## Which app a drive shows

A drive shows the app its `header.meta.preferredEditor` names. With none, or an app no loaded package has, Connect shows its Drive Explorer (`powerhouse/generic-drive-explorer`); a host without the generic plugin shows core's directory listing.

- **A new drive in the UI:** Create Drive's "Drive App" picker. Package apps are listed first, so a project's app is preselected.
- **A new drive in code:** `addDrive(input, appId)` from `@powerhousedao/reactor-browser`, or `driveInput.preferredEditor` in the MCP `addDrive` tool.
- **A drive every user gets:** a local entry in `connect.drives.defaultDrives` with `"app": "<app-id>"` ([RUNTIME-CONFIG.md](../../RUNTIME-CONFIG.md)). Connect creates it on first boot and opens it in that app.
- **An existing drive:** `setPreferredEditorOnNode(driveId, appId)` from `@powerhousedao/reactor-browser`, which dispatches `setPreferredEditor`. Connect has no UI for this yet, so a project that needs it adds a button, e.g. on a page that lists the drives. The change syncs like any other drive operation.

The home cards and `useAppModuleById(drive.header.meta?.preferredEditor)` show which app a drive uses.
