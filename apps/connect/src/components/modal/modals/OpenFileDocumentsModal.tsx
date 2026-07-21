import { DriveIcon } from "@powerhousedao/connect/components";
import {
  clearPendingImportFiles,
  getPendingImportFiles,
  pendingFileKey,
  planOpenFileImports,
  runOpenFileImports,
  subscribePendingImportFiles,
  type ParsedFileInfo,
  type PlanEntry,
  type PlannedOpenFileImport,
} from "@powerhousedao/connect/utils";
import { Modal } from "@powerhousedao/design-system";
import {
  Combobox,
  formatFileSize,
  ModalButton,
} from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  DocumentModelNotFoundError,
  loadFile,
  setSelectedDrive,
  showPHModal,
  useDocumentTypes,
  useDrives,
  usePHModal,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

// Drive picker for documents opened through the OS file association (PWA
// File Handling). This is the flow's ONLY dialog state: validity and
// duplicate checks run up-front against the selected drive (inline errors,
// automatic "(copy) N" renames surfaced as "Rename and import"), and on
// confirmation the dialog closes — progress is shown by the floating upload
// panel (OpenFileUploadList) driven from utils/open-file-uploads.ts, the same
// UI drag-and-drop uses.
//
// The component only mounts while the modal is shown (ModalsContainer keys on
// the modal type), so picker state starts fresh on every open.

// Parse results are cached at module level so they survive the create-drive
// detour (which unmounts this component) and are computed once per pending
// file — loadFile replays the file's full operation history. Only header
// fields are retained, never the parsed document. In-flight promises are
// cached too, deduplicating StrictMode double-effects.
const parseCache = new Map<string, ParsedFileInfo | Promise<ParsedFileInfo>>();

async function parsePendingFile(file: File): Promise<ParsedFileInfo> {
  try {
    const document = await loadFile(file);
    return {
      state: "parsed",
      id: document.header.id,
      documentType: document.header.documentType,
      headerName: document.header.name,
    };
  } catch (error) {
    // Missing document model ≠ invalid: the import path's package
    // auto-discovery may still resolve it.
    if (DocumentModelNotFoundError.isError(error)) {
      return { state: "model-missing" };
    }
    return { state: "invalid" };
  }
}

export function OpenFileDocumentsModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "openFileDocuments";
  const { t } = useTranslation();
  const drives = useDrives();
  const documentTypes = useDocumentTypes();
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const pendingFiles = useSyncExternalStore(
    subscribePendingImportFiles,
    getPendingImportFiles,
  );

  const [pickedDriveId, setPickedDriveId] = useState<string>();
  const [, setParseVersion] = useState(0);

  // Kick off (and cache) the one-time parse of each pending file. Gated on
  // the reactor being ready — never cache "reactor not initialized" as a
  // parse result; the effect re-runs when files change and drives arriving
  // re-render the modal anyway.
  useEffect(() => {
    if (!window.ph?.reactorClient) return;
    let cancelled = false;
    const pendingKeys = new Set(pendingFiles.map(pendingFileKey));
    for (const key of parseCache.keys()) {
      if (!pendingKeys.has(key)) parseCache.delete(key);
    }
    for (const file of pendingFiles) {
      const key = pendingFileKey(file);
      if (parseCache.has(key)) continue;
      const promise = parsePendingFile(file).then((info) => {
        parseCache.set(key, info);
        return info;
      });
      parseCache.set(key, promise);
      void promise.then(() => {
        if (!cancelled) setParseVersion((version) => version + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [pendingFiles]);

  // The first drive is preselected so opening a file is a single
  // confirmation; the select lets the user switch destination.
  const selectedDriveId = pickedDriveId ?? drives?.[0]?.header.id;
  const selectedDrive = drives?.find(
    (drive) => drive.header.id === selectedDriveId,
  );

  const driveOptions = (drives ?? []).map((drive) => ({
    // New local drives carry their name only in the global state until the
    // header syncs.
    label: drive.header.name || drive.state.global.name,
    value: drive.header.id,
    drive,
  }));
  type DriveOption = (typeof driveOptions)[number];

  // Pure derivations — recomputed on drive switch, on files arriving, and on
  // parses settling.
  const entries: PlanEntry[] = pendingFiles.map((file) => {
    const cached = parseCache.get(pendingFileKey(file));
    return {
      key: pendingFileKey(file),
      file,
      parsed: cached instanceof Promise ? undefined : cached,
    };
  });
  const plan = selectedDrive
    ? planOpenFileImports({
        entries,
        nodes: selectedDrive.state.global.nodes,
        documentTypes,
      })
    : new Map<string, never>();

  const planRows = [...plan.values()];
  const readyCount = planRows.filter((row) => row.kind === "ready").length;
  const anyChecking = planRows.some((row) => row.kind === "checking");
  const anyRenamed = planRows.some(
    (row) => row.kind === "ready" && row.renamed,
  );

  function onImport() {
    const drive = selectedDrive;
    if (!drive) return;
    const imports: PlannedOpenFileImport[] = [];
    for (const { key, file } of entries) {
      const row = plan.get(key);
      if (row?.kind === "ready") imports.push({ file, name: row.finalName });
    }
    if (imports.length === 0) return;
    // Ordering matters: the pending store must be cleared BEFORE the modal
    // closes — the launch-queue listener reopens this picker whenever the
    // modal clears while files are still pending.
    clearPendingImportFiles();
    closePHModal();
    setSelectedDrive(drive);
    void runOpenFileImports({
      driveId: drive.header.id,
      imports,
      documentTypes,
    });
  }

  function onCancel() {
    clearPendingImportFiles();
    closePHModal();
  }

  if (!open) return null;

  const hasDrives = (drives?.length ?? 0) > 0;

  function rowAnnotation(key: string) {
    const row = plan.get(key);
    if (!row) return null;
    switch (row.kind) {
      case "checking":
        return (
          <span className="text-xs text-muted-foreground">
            {t("modals.openFileDocuments.checking")}
          </span>
        );
      case "invalid":
        return (
          <span className="text-xs text-destructive">
            {t("modals.openFileDocuments.invalidFile")}
          </span>
        );
      case "unsupported":
        return (
          <span className="text-xs text-destructive">
            {t("modals.openFileDocuments.unsupportedType")}
          </span>
        );
      case "ready":
        // "name": same name + type already in the drive, so the file is
        // renamed to a copy. "id": same document id, imported as a fresh copy
        // under its original name. A row that only got renamed to avoid
        // clashing with another file in THIS batch is NOT in the drive, so it
        // must not claim to be — it gets the neutral rename hint instead.
        if (row.duplicate === "name") {
          return (
            <span className="text-xs text-muted-foreground">
              {t("modals.openFileDocuments.duplicateHint", {
                name: row.finalName,
              })}
            </span>
          );
        }
        if (row.duplicate === "id") {
          return (
            <span className="text-xs text-muted-foreground">
              {t("modals.openFileDocuments.duplicateCopyHint")}
            </span>
          );
        }
        if (row.renamed) {
          return (
            <span className="text-xs text-muted-foreground">
              {t("modals.openFileDocuments.renamedHint", {
                name: row.finalName,
              })}
            </span>
          );
        }
        return null;
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(status) => {
        if (!status) onCancel();
      }}
      // The drive select's dropdown must be able to spill past the dialog
      // bounds instead of being clipped (the menu cannot portal to <body>:
      // Radix's modal pointer-events lock would make it unclickable there).
      contentProps={{ className: "overflow-visible" }}
    >
      <div className="w-[520px] p-6">
        <div className="pb-2 text-2xl font-bold text-foreground">
          {t("modals.openFileDocuments.title", {
            count: pendingFiles.length,
          })}
        </div>

        {!isAllowedToCreateDocuments ? (
          <>
            <div className="my-6 rounded-md bg-background p-4 text-center text-foreground">
              {t("modals.openFileDocuments.notAllowed")}
            </div>
            <div className="mt-8 flex">
              <ModalButton variant="cancel" onClick={onCancel}>
                {t("common.cancel")}
              </ModalButton>
            </div>
          </>
        ) : (
          <>
            <div className="my-4 flex flex-col gap-1 text-sm text-foreground">
              {pendingFiles.map((file, index) => {
                const key = pendingFileKey(file);
                const annotation = rowAnnotation(key);
                return (
                  <div
                    key={`${index}-${key}`}
                    className="flex flex-col gap-0.5 rounded-md bg-background px-3 py-2"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    {annotation}
                  </div>
                );
              })}
            </div>

            {hasDrives ? (
              <>
                <div className="mb-2 text-sm text-muted-foreground">
                  {t("modals.openFileDocuments.body")}
                </div>
                <Combobox
                  id="open-file-documents-drive"
                  isSearchable={false}
                  options={driveOptions}
                  value={
                    driveOptions.find(
                      (option) => option.value === selectedDriveId,
                    ) ?? null
                  }
                  onChange={(option) =>
                    setPickedDriveId((option as DriveOption).value)
                  }
                  formatOptionLabel={(option) => {
                    const { label, drive } = option as DriveOption;
                    return (
                      <span className="flex items-center gap-2">
                        <DriveIcon drive={drive} />
                        <span className="truncate">{label}</span>
                      </span>
                    );
                  }}
                  maxMenuHeight={200}
                />
              </>
            ) : (
              <div className="my-6 rounded-md bg-background p-4 text-center text-foreground">
                {t("modals.openFileDocuments.noDrives")}
              </div>
            )}

            <div className="mt-8 flex justify-between gap-3">
              <ModalButton variant="cancel" onClick={onCancel}>
                {t("common.cancel")}
              </ModalButton>
              {hasDrives ? (
                <ModalButton
                  variant="confirm"
                  disabled={!selectedDriveId || readyCount === 0 || anyChecking}
                  onClick={onImport}
                >
                  {anyRenamed
                    ? t("modals.openFileDocuments.renameAndImport")
                    : t("modals.openFileDocuments.import")}
                </ModalButton>
              ) : (
                <ModalButton
                  variant="confirm"
                  onClick={() => showPHModal({ type: "addDrive" })}
                >
                  {t("modals.openFileDocuments.createDrive")}
                </ModalButton>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
