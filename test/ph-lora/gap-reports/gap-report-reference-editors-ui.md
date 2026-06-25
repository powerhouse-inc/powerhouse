## Gap Report: Reference — Editors & UI

Reviewed: docs/academy/04-Reference/05-EditorsUI
Against: packages/design-system, packages/reactor-browser, packages/codegen
Focus: React hook names/parameter/return types, document-engineering component names and prop interfaces, custom scalar types

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | high | stale | `setVetraPackages` (01-ReactHooks.md:1074-1080) | `hooks/vetra-packages.ts:31` | Documented as `setVetraPackages(vetraPackages: VetraPackage[] \| undefined): void` but source exports `setVetraPackageManager(packageManager: IPackageManager)` — renamed and signature changed. No `setVetraPackages` export exists in the package. Copy-pasting would fail to import. |
| 2 | medium | stale | `useVetraPackages` `VetraPackage` type block (01-ReactHooks.md:1050-1070) | `hooks/vetra-packages.ts:14-24`, `types/vetra.ts:18` | `useVetraPackages()` is documented to return `VetraPackage[] \| undefined`, but source returns the package-manager value defaulting to `[]` (never `undefined`), and packages are typed as `DocumentModelLib[]`, not a `VetraPackage` object with `{ id, name, description, category, author, modules }`. No `VetraPackage` type is defined or exported from `@powerhousedao/reactor-browser`; the documented shape does not exist in source. |
| 3 | high | stale | `setPHDriveEditorConfig` (01-ReactHooks.md:1195-1201) | `hooks/config/use-value-by-key.ts:54`, `hooks/config/utils`? | No `setPHDriveEditorConfig` export exists. The drive-level setter is `setPHAppConfig(config: Partial<PHAppConfig>)` (`hooks/config/use-value-by-key.ts:54`). `grep` for `setPHDriveEditorConfig` across `src/` returns zero hits. |
| 4 | high | stale | `useSetPHDriveEditorConfig` (01-ReactHooks.md:1226-1232 + example 1236-1247) | `hooks/config/use-value-by-key.ts:78` | No `useSetPHDriveEditorConfig` export exists; the hook is `useSetPHAppConfig(config: Partial<PHAppConfig>)`. The example imports `useSetPHDriveEditorConfig` from `@powerhousedao/reactor-browser`, which would fail to resolve. |
| 5 | high | stale | `usePHDriveEditorConfigByKey<TKey extends PHDriveEditorConfigKey>` (01-ReactHooks.md:1265-1273) | `hooks/config/use-value-by-key.ts:20` | No `usePHDriveEditorConfigByKey` / `PHDriveEditorConfigKey` exist. Source exposes `usePHAppConfigByKey<TKey extends PHAppConfigKey>(key)` and the type is `PHAppConfigKey` (`types/config.ts:29`). `grep` for `PHDriveEditorConfig`/`PHDriveEditorConfigKey` returns zero hits. |
| 6 | medium | stale | `PHDriveEditorConfig` type usages — `setPHDriveEditorConfig(config: Partial<PHDriveEditorConfig>)` and `usePHDriveEditorConfigByKey` return `PHDriveEditorConfig[TKey]` (01-ReactHooks.md:1200, 1272) | `types/config.ts:21` | The type is named `PHAppConfig` (`{ allowedDocumentTypes?: string[]; isDragAndDropEnabled?: boolean }`), not `PHDriveEditorConfig`. The documented type name does not exist in source. |
| 7 | medium | stale | `usePHModal` `PHModal` type block — `{ type: "exportDocumentWithErrors"; documentId: string }` (01-ReactHooks.md:849) | `types/modals.ts:30` | Source variant is `{ type: "downloadDocumentWithErrors"; documentId: string }`, not `exportDocumentWithErrors`. The documented union member name is wrong. |
| 8 | medium | stale | `usePHModal` `PHModal` type block (01-ReactHooks.md:837-851) | `types/modals.ts:32-33` | Documented union is missing two source members: `{ type: "missingPackage"; documentType: string }` and `{ type: "driveAuthRequired" }`. |
| 9 | medium | stale | `useSelectedDocumentSafe` "Throws: NoSelectedDocumentError" (01-ReactHooks.md:162-164) | `hooks/selected-document.ts:30-36` | The "Safe" variant does NOT throw — it returns `useDocumentById(selectedDocumentId)` directly. `NoSelectedDocumentError` is thrown by the non-safe `useSelectedDocument` (`selected-document.ts:23-25`). The documented Throws section is incorrect for this hook. |
| 10 | medium | wrong | `useSelectedDocumentSafe` example (01-ReactHooks.md:168-185) | `hooks/selected-document.ts:30` | The example under the `useSelectedDocumentSafe` heading imports and calls `useSelectedDocument` (the throwing variant), not `useSelectedDocumentSafe` — a copy-paste of the previous section's example into the wrong heading. |

### Verified clean

- `useSelectedDocumentId` — name + return `string | undefined` match (`selected-document.ts:11`).
- `useSelectedDocument` — name + tuple `[PHDocument, dispatch]`, throws `NoSelectedDocumentError` (`selected-document.ts:17-27`).
- `useSelectedDocumentOfType` — overloads (`documentType: null|undefined => never[]`; `<TDocument, TAction>(documentType: string) => [TDocument, DocumentDispatch<TAction>]`) match (`selected-document.ts:39-61`).
- `useDocumentById` — `(id: string|null|undefined) => [PHDocument|undefined, dispatch]` matches (`document-by-id.ts:6`).
- `useDocumentsByIds` — `(ids: string[]|null|undefined) => PHDocument[]` matches (`document-by-id.ts:15`).
- `useDocumentOfType` — generic signature and throws (DocumentTypeMismatchError, ModuleNotFoundError) match (`document-of-type.ts:9`). Note: doc lists `DocumentNotFoundError`/`DocumentModelNotFoundError`; source throws a plain `Error("Document not found")` and `ModuleNotFoundError` — see Could not verify.
- `useDocumentCache` — returns `IDocumentCache | undefined` (`document-cache.ts:11`).
- `useDocument` — `(id) => PHDocument | undefined` matches (`document-cache.ts:60`).
- `useDocuments` — `(ids) => PHDocument[]` matches (`document-cache.ts:117`).
- `useGetDocument` — returns `(id: string) => Promise<PHDocument>` matches (`document-cache.ts:137`).
- `useGetDocuments` — returns `(ids: string[]) => Promise<PHDocument[]>` matches (`document-cache.ts:156`).
- `useGetDocumentAsync` — `(id)` returning `{ status, data, isPending, error, reload }` object matches (`document-cache.ts:181`).
- `useDrives` — returns `DocumentDriveDocument[] | undefined` matches (`drives.ts:8`).
- `useSelectedDriveId` — `string | undefined` matches (`selected-drive.ts:21`).
- `useSelectedDrive` — tuple `[DocumentDriveDocument, DocumentDispatch<DocumentDriveAction>]`, throws with the documented message (`selected-drive.ts:31-40`).
- `useSelectedDriveSafe` — `[drive, dispatch] | readonly [undefined, undefined]` matches (`selected-drive.ts:43`).
- `setSelectedDrive` — `(driveOrDriveSlug: string | DocumentDriveDocument | undefined)` matches (`selected-drive.ts:60`).
- `useSelectedNode` — `() => Node | undefined` matches (`selected-node.ts:13`).
- `setSelectedNode` — `(nodeOrNodeSlug: Node | string | undefined)` matches (`set-selected-node.ts:19`).
- `useSelectedFolder` — `() => FolderNode | undefined` matches (`selected-folder.ts:6`).
- `useNodeById` — `(id: string|null|undefined) => Node | undefined` matches (`node-by-id.ts:5`).
- `useNodePathById` — `(id) => Node[]` matches (`node-path.ts:6`).
- `useSelectedNodePath` — `() => Node[]` matches (`node-path.ts:23`).
- `useNodesInSelectedDrive`, `useFileNodesInSelectedDrive`, `useFolderNodesInSelectedDrive`, `useDocumentsInSelectedDrive`, `useDocumentTypesInSelectedDrive`, `useNodesInSelectedDriveOrFolder` — names + return shapes match (`items-in-selected-drive.ts`). (`useNodesInSelectedDriveOrFolder` documented at 01-ReactHooks.md:698 — verified present in source via the items file family.)
- `useNodesInSelectedFolder`, `useFileNodesInSelectedFolder`, `useFolderNodesInSelectedFolder`, `useDocumentsInSelectedFolder` — names + `… | undefined` returns match (`items-in-selected-folder.ts`).
- `useNodeActions` — returns object with `onAddFile, onAddFolder, onRenameNode, onCopyNode, onMoveNode, onDuplicateNode, onAddAndSelectNewFolder` matching documented signatures (`node-actions.ts:149-158`). Source additionally returns `onRenameDriveNodes` (see Could not verify / missing note below).
- `usePHModal`, `showPHModal`, `closePHModal`, `showCreateDocumentModal`, `showDeleteNodeModal` — names + signatures match (`modals.ts`).
- `useRevisionHistoryVisible`, `showRevisionHistory`, `hideRevisionHistory` — names + behaviour match (`revision-history.ts`).
- `useSelectedTimelineItem`, `setSelectedTimelineItem`, `useSelectedTimelineRevision`, `setSelectedTimelineRevision` — names match (`selected-timeline-item.ts`, `timeline-revision.ts`).
- `useDocumentTypes` — `() => string[] | undefined` matches (`document-types.ts:9`).
- `useSupportedDocumentTypesInReactor` — `() => string[] | undefined` matches (`supported-document-types.ts:4`).
- `useGetSwitchboardLink` — `(document: PHDocument | undefined) => (() => Promise<string>) | null` matches exactly (`use-get-switchboard-link.ts:23`).
- `useIsExternalControlsEnabled` / `setIsExternalControlsEnabled` — match (`config/editor.ts:14-19`).
- `useIsDragAndDropEnabled` / `setIsDragAndDropEnabled` — match (`config/editor.ts:30-35`).
- `useAllowedDocumentTypes` / `setAllowedDocumentTypes` — match (`config/editor.ts:46-57`).
- `setPHDocumentEditorConfig(config: Partial<PHDocumentEditorConfig>)` — matches (`config/use-value-by-key.ts:64`).
- `useSetPHDocumentEditorConfig(config: Partial<PHDocumentEditorConfig>)` — matches (`config/use-value-by-key.ts:94`).
- `usePHDocumentEditorConfigByKey<TKey extends PHDocumentEditorConfigKey>` — matches (`config/use-value-by-key.ts:29`).
- `PHDocumentEditorConfig` type (`isExternalControlsEnabled`) — matches (`types/config.ts:33-36`).
- `Form` and `Sidebar` component names referenced in 00-DocumentEngineering.md exist in the design-system mirror (`design-system/src/ui/components/form/form.tsx`, `.../sidebar/sidebar.tsx`).
- Import path `@powerhousedao/reactor-browser` — package name confirmed (the documented hooks all live in this package).

### Could not verify

Within checkFocus but not statically resolvable in this monorepo checkout:

- `BooleanField` component name and prop interface (`name`, `value`, `onChange`, `description`) used in 00-DocumentEngineering.md examples — these components ship from the external `@powerhousedao/document-engineering` package (separate `powerhouse-inc/document-engineering` repo, not present in this monorepo). `BooleanField` appears in design-system only inside a `.stories.tsx` reference, not as a verifiable export here, so its props cannot be confirmed against source.
- Custom scalar file structure in 02-CreateCustomScalars.md (`src/scalars/graphql/`, `scalars.ts` sections `customScalars`/`resolvers`/`typeDefs`/`generatorTypeDefs`/`validationSchema`, and the `EmailAddress.ts` reference) — these live in the external document-engineering repo, not in `packages/codegen` or `packages/design-system`, so line-level accuracy could not be checked.
- `useDocumentOfType` documented throws `DocumentNotFoundError` and `DocumentModelNotFoundError` (01-ReactHooks.md:321-322): source throws a plain `Error("Document not found: …")` and `ModuleNotFoundError` (`document-of-type.ts:23-25`). The documented error class names could not be confirmed as exported error types — likely stale, but only one side (doc) names them, so flagged here rather than as a finding.
- `useNodeActions` source also returns `onRenameDriveNodes` (`node-actions.ts:130-147,157`), which is not documented. This is an undocumented returned function within the documented object; noted here as a possible `missing` item but it is an internal helper not surfaced in the documented table.

### Summary

10 findings (7 stale, 0 missing, 3 wrong — note #10 is a wrong-example finding and #1/#3/#4/#5 are stale renames that would also break copy-pasted imports). The hook reference for `@powerhousedao/reactor-browser` is largely accurate for selected-document/drive/node/cache/timeline/modal hooks, but the editor-config family was renamed from `PHDriveEditorConfig*` to `PHAppConfig*` and the Vetra packages API was renamed from `setVetraPackages`/`VetraPackage` to `setVetraPackageManager`/`DocumentModelLib`, leaving four high-urgency stale exports plus a misplaced `useSelectedDocumentSafe` example and `PHModal` type drift. The document-engineering component and custom-scalar pages reference an external repo and could not be mechanically verified here.
