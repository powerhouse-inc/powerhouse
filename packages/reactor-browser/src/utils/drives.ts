import { getPHStore } from "../hooks/ph-store.js";
import type { IReactorReadClient } from "@powerhousedao/reactor";
import { SyncStatus } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  SharingType,
} from "@powerhousedao/shared/document-drive";
import { DRIVE_DOCUMENT_TYPES } from "../constants.js";

export type UISyncStatus =
  | "INITIAL_SYNC"
  | "SUCCESS"
  | "CONFLICT"
  | "MISSING"
  | "ERROR"
  | "SYNCING";

const syncStatusToUI: Record<SyncStatus, UISyncStatus> = {
  [SyncStatus.Synced]: "SUCCESS",
  [SyncStatus.Outgoing]: "SYNCING",
  [SyncStatus.Incoming]: "SYNCING",
  [SyncStatus.OutgoingAndIncoming]: "SYNCING",
  [SyncStatus.Error]: "ERROR",
};

export async function getDrives(
  reactor: IReactorReadClient,
): Promise<DocumentDriveDocument[]> {
  // SearchFilter.type takes one string, so query each drive type and merge.
  const perType = await Promise.all(
    DRIVE_DOCUMENT_TYPES.map((type) => reactor.find({ type })),
  );
  return perType.flatMap((r) => r.results) as DocumentDriveDocument[];
}

/**
 * The id of every drive, from a listing that carries headers only: a drive's
 * node tree can be megabytes (a mail drive with tens of thousands of files),
 * so membership is learned without it and a new drive is then loaded on its
 * own.
 */
export async function listDriveIds(
  reactor: IReactorReadClient,
): Promise<string[]> {
  const perType = await Promise.all(
    DRIVE_DOCUMENT_TYPES.map((type) =>
      reactor.find({ type }, { scopes: ["header"] }),
    ),
  );
  return perType.flatMap((r) => r.results.map((d) => d.header.id));
}

/** One drive in full, or undefined once it is gone. */
export async function getDrive(
  reactor: IReactorReadClient,
  driveId: string,
): Promise<DocumentDriveDocument | undefined> {
  try {
    return await reactor.get<DocumentDriveDocument>(driveId);
  } catch {
    return undefined;
  }
}

export function getSyncStatus(
  documentId: string,
  sharingType: SharingType,
): Promise<UISyncStatus | undefined> {
  return Promise.resolve(getSyncStatusSync(documentId, sharingType));
}

export function getSyncStatusSync(
  documentId: string,
  sharingType: SharingType,
): UISyncStatus | undefined {
  if (sharingType === "LOCAL" || typeof window === "undefined") return;

  const syncManager =
    getPHStore()?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
  if (!syncManager) return;

  const status = syncManager.getSyncStatus(documentId);
  if (status === undefined) return;

  return syncStatusToUI[status];
}

/** A drive's display name: the header's (renames set it), else its creation name. */
export function getDriveName(drive: DocumentDriveDocument): string {
  return drive.header.name || drive.state.global.name;
}
