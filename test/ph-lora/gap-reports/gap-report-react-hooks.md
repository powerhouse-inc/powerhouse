# Gap Report: API References — React Hooks

**Date:** 2026-05-05
**Reviewed:** `apps/academy/docs/academy/04-APIReferences/01-ReactHooks.md`
**Against:** `packages/reactor-browser`
**Focus:** Hook names, parameter types, return types — compare docs against exported TypeScript signatures

---

## Findings

| #   | Urgency  | Type      | Doc location                                          | Source location                           | Finding                                                                                                                                                                                                                                                                                         |
| --- | -------- | --------- | ----------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `high`   | `wrong`   | `useSelectedDocumentSafe` — Throws section (line 163) | `hooks/selected-document.ts:30-36`        | Doc says throws `NoSelectedDocumentError` when no document is selected. Source does not throw — it returns `[undefined, dispatch]`. The throws section belongs to `useSelectedDocument`, not the "Safe" variant.                                                                                |
| 2   | `high`   | `wrong`   | `useSelectedDocumentSafe` — Example (lines 169-185)   | `hooks/selected-document.ts:17`           | Example imports and calls `useSelectedDocument` (without "Safe"). Should be `useSelectedDocumentSafe`. Clear copy-paste from the hook above.                                                                                                                                                    |
| 3   | `high`   | `stale`   | `setPHDriveEditorConfig` (lines 1197-1207)            | `hooks/config/set-config-by-object.ts:54` | Doc describes `setPHDriveEditorConfig(config: Partial<PHDriveEditorConfig>)`. Source exports `setPHAppConfig(config: Partial<PHAppConfig>)`. Function and type have been renamed. `setPHDriveEditorConfig` does not exist.                                                                      |
| 4   | `high`   | `stale`   | `useSetPHDriveEditorConfig` (lines 1229-1248)         | `hooks/config/set-config-by-object.ts:78` | Same rename: source exports `useSetPHAppConfig`, not `useSetPHDriveEditorConfig`.                                                                                                                                                                                                               |
| 5   | `high`   | `stale`   | `setVetraPackages` (lines 1074-1081)                  | `hooks/vetra-packages.ts:31`              | Doc describes `setVetraPackages(vetraPackages: VetraPackage[] \| undefined): void`. Source exports `setVetraPackageManager(packageManager: IPackageManager)` — different name and a completely different parameter type. `setVetraPackages` does not exist.                                     |
| 6   | `medium` | `stale`   | `useVetraPackages` return type (line 1048)            | `hooks/vetra-packages.ts:17-24`           | Doc says returns `VetraPackage[] \| undefined`. Source returns `packageManager?.packages ?? []` — always an array, never `undefined`. Return type should be `VetraPackage[]`.                                                                                                                   |
| 7   | `low`    | `missing` | Not in the return type table (line 777)               | `hooks/node-actions.ts:149-158`           | `useNodeActions` returns `onRenameDriveNodes(newName: string, nodeId: string): Promise<void>` but it is absent from the documented return type table.                                                                                                                                           |
| 8   | `high`   | `missing` | Not documented anywhere                               | `hooks/document-operations.ts:23`         | `useDocumentOperations(documentId: string \| null \| undefined)` is exported. Returns `{ globalOperations, localOperations, isLoading, error, refetch }`. Source jsdoc notes operations are no longer auto-populated on documents — a breaking workflow change that is completely undocumented. |
| 9   | `low`    | `missing` | Not documented anywhere                               | `hooks/user-permissions.ts:3`             | `useUserPermissions()` is exported, returns `{ isAllowedToCreateDocuments: boolean, isAllowedToEditDocuments: boolean }`. Not in Quick Reference or body.                                                                                                                                       |
| 10  | `low`    | `missing` | Not documented anywhere                               | `hooks/use-drive-system-info.ts:29`       | `useDriveSystemInfo(drive: DocumentDriveDocument \| undefined): DriveSystemInfoState` is exported. Not documented.                                                                                                                                                                              |
| 11  | `low`    | `missing` | Not documented anywhere                               | `hooks/features.ts:10-13`                 | `useFeatures` and `setFeatures` (typed as `Map<string, boolean>`) are exported. Not documented.                                                                                                                                                                                                 |
| 12  | `low`    | `missing` | Not documented anywhere                               | `hooks/toast.ts:6-9`                      | `usePHToast` and `setPHToast` are exported. Not documented.                                                                                                                                                                                                                                     |

---

## Verified clean

- `useSelectedDocumentId` — name and return type (`string | undefined`) match source (`hooks/selected-document.ts:11`)
- `useSelectedDocument` — signature, return type, and throws behaviour match source (`hooks/selected-document.ts:17-27`)
- `useSelectedDocumentOfType` — overload signatures match source (`hooks/selected-document.ts:39-61`)
- `useDocumentById` — signature and return type match
- `useDrives` — return type and description match source (`hooks/drives.ts:8`)
- `useSelectedDriveId` — matches source (`hooks/selected-drive.ts:18`)
- `useSelectedDrive` — signature and exact throw message match (`hooks/selected-drive.ts:28-37`)
- `useSelectedDriveSafe` — return union type matches (`hooks/selected-drive.ts:40-55`)
- `setSelectedDrive` — parameter type and description match (`hooks/selected-drive.ts:57`)
- `usePHModal`, `showPHModal`, `closePHModal`, `showCreateDocumentModal`, `showDeleteNodeModal` — all match source (`hooks/modals.ts`)
- `useRevisionHistoryVisible`, `showRevisionHistory`, `hideRevisionHistory` — match source (`hooks/revision-history.ts`)
- `useSelectedTimelineItem`, `setSelectedTimelineItem` — match source (`hooks/selected-timeline-item.ts`)
- `useSelectedTimelineRevision`, `setSelectedTimelineRevision` — match source (`hooks/timeline-revision.ts`)
- `useIsExternalControlsEnabled`, `setIsExternalControlsEnabled` — match source (`hooks/config/editor.ts:18,14`)
- `useIsDragAndDropEnabled`, `setIsDragAndDropEnabled` — match source (`hooks/config/editor.ts:34,30`)
- `useAllowedDocumentTypes`, `setAllowedDocumentTypes` — match source (`hooks/config/editor.ts:53,44`)
- `setPHDocumentEditorConfig` — name and type match source (`hooks/config/set-config-by-object.ts:64`)
- `useSetPHDocumentEditorConfig` — name and type match source (`hooks/config/set-config-by-object.ts:94`)
- `useGetSwitchboardLink` — signature and null-return behaviour match source (`hooks/use-get-switchboard-link.ts:22-24`)
- `useDocumentTypes`, `useSupportedDocumentTypesInReactor` — documented and exported correctly

---

## Could not verify

- `PHDocument.header.documentType` field used in examples — `PHDocument` is defined in `@powerhousedao/shared/document-model`, not read during this review
- `VetraPackage` type shape in the Vetra section — the actual type may differ from what's documented; the type definition was not traced to its source

---

## Summary

**12 findings (4 stale, 6 missing, 2 wrong).** The two `wrong` findings are the most urgent — a developer following the `useSelectedDocumentSafe` example will call the wrong hook entirely. The `stale` findings on `setPHDriveEditorConfig` → `setPHAppConfig` and `setVetraPackages` → `setVetraPackageManager` are renames that shipped without a doc update. Among the `missing` findings, `useDocumentOperations` stands out — its own jsdoc says operations are no longer auto-populated on documents, making it a breaking workflow change with zero documentation.
