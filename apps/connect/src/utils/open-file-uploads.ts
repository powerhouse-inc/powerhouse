import {
  formatFileSize,
  mapProgressStageToStatus,
  type UploadFileListContainerProps,
} from "@powerhousedao/design-system/connect";
import {
  addFileWithProgress,
  setSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";

// Progress store + import driver for documents opened through the OS file
// association. Imports run OUTSIDE React (the picker modal closes the moment
// the user confirms), reporting into a module store rendered by
// OpenFileUploadList through the same floating panel UI drag-and-drop uses.
// Memory-only on purpose: persisting rows (as DropZone does) leaves stale
// frozen "uploading" entries after a reload, and launched imports are
// one-shot. Rows are cleared only by user action, like drag-and-drop.

/** Row shape the design-system upload panel consumes (UploadTracker). */
export type OpenFileUpload = NonNullable<
  UploadFileListContainerProps["uploadsArray"][number]
>;

let uploads: OpenFileUpload[] = [];
const listeners = new Set<() => void>();

function notifyUploadListeners() {
  for (const listener of listeners) listener();
}

export function getOpenFileUploads(): OpenFileUpload[] {
  return uploads;
}

export function subscribeOpenFileUploads(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function removeOpenFileUpload(id: string) {
  const next = uploads.filter((upload) => upload.id !== id);
  if (next.length === uploads.length) return;
  uploads = next;
  notifyUploadListeners();
}

export function clearOpenFileUploads() {
  if (uploads.length === 0) return;
  uploads = [];
  notifyUploadListeners();
}

function addOpenFileUploads(rows: OpenFileUpload[]) {
  uploads = [...uploads, ...rows];
  notifyUploadListeners();
}

function patchOpenFileUpload(id: string, patch: Partial<OpenFileUpload>) {
  uploads = uploads.map((upload) =>
    upload.id === id ? { ...upload, ...patch } : upload,
  );
  notifyUploadListeners();
}

export type PlannedOpenFileImport = {
  file: File;
  /** Final (possibly renamed) name the document is stored under. */
  name: string;
};

let uploadCounter = 0;
// Batches are serialized: a second OS launch confirmed mid-upload must not
// race addDocument calls against the same drive.
let importChain: Promise<void> = Promise.resolve();

/**
 * Import one file and resolve once the flow truly ends. Completion is
 * tracked through the progress stages, NOT the returned promise — the
 * package-discovery retry path resolves early and keeps reporting through
 * the callback. `resolveConflict: "duplicate"` is always passed: duplicates
 * were resolved in the picker (rename), so the conflict stage must never
 * fire — this also covers a duplicate appearing between pre-check and import.
 */
function importOne(
  row: { id: string; file: File; name: string },
  driveId: string,
  documentTypes: string[] | undefined,
): Promise<FileNode | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (fileNode?: FileNode) => {
      if (settled) return;
      settled = true;
      resolve(fileNode);
    };
    addFileWithProgress(
      row.file,
      driveId,
      row.name,
      undefined, // drive root
      (progress) => {
        patchOpenFileUpload(row.id, {
          status: mapProgressStageToStatus(progress.stage),
          progress: progress.progress,
          ...(progress.error ? { errorDetails: progress.error } : {}),
          ...(progress.documentType
            ? { documentType: progress.documentType }
            : {}),
          ...(progress.fileNode ? { fileNode: progress.fileNode } : {}),
        });
        switch (progress.stage) {
          case "complete":
            settle(progress.fileNode);
            break;
          case "failed":
          case "unsupported-document-type":
            settle(undefined);
            break;
          default:
            break;
        }
      },
      documentTypes,
      "duplicate",
    ).catch(() => {
      // A terminal stage was already reported through the callback (the
      // action always emits one before throwing); keep the batch going.
      settle(undefined);
    });
  });
}

/**
 * Run a confirmed batch of imports into a drive, feeding the floating upload
 * panel. Rows appear immediately (queued), files import sequentially, and a
 * single-file batch that succeeds opens its document in the editor.
 */
export function runOpenFileImports(args: {
  driveId: string;
  imports: PlannedOpenFileImport[];
  documentTypes: string[] | undefined;
}): Promise<void> {
  const { driveId, imports, documentTypes } = args;
  if (imports.length === 0) return importChain;

  const rows = imports.map(({ file, name }) => ({
    id: `open-file-${++uploadCounter}`,
    file,
    name,
  }));
  addOpenFileUploads(
    rows.map((row) => ({
      id: row.id,
      fileName: row.name,
      fileSize: formatFileSize(row.file.size),
      status: "pending",
      progress: 0,
    })),
  );

  const run = async () => {
    const results: (FileNode | undefined)[] = [];
    for (const row of rows) {
      results.push(await importOne(row, driveId, documentTypes));
    }
    // Auto-open only for a single-file batch; several files land on the
    // drive and the panel rows carry their own "Open Document" links.
    if (rows.length === 1 && results[0]) {
      setSelectedNode(results[0]);
    }
  };
  importChain = importChain.then(run, run);
  return importChain;
}
