import type { IReactorClient } from "@powerhousedao/reactor";
import { SyncStatus } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  SharingType,
  SyncStatus as UISyncStatus,
} from "document-drive";

const syncStatusToUI: Record<SyncStatus, UISyncStatus> = {
  [SyncStatus.Synced]: "SUCCESS",
  [SyncStatus.Outgoing]: "SYNCING",
  [SyncStatus.Incoming]: "SYNCING",
  [SyncStatus.OutgoingAndIncoming]: "SYNCING",
  [SyncStatus.Error]: "ERROR",
};

export async function getDrives(
  reactor: IReactorClient,
): Promise<DocumentDriveDocument[]> {
  const results = await reactor.find({
    type: "powerhouse/document-drive",
  });
  return results.results as DocumentDriveDocument[];
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
  if (sharingType === "LOCAL") return;

  const syncManager =
    window.ph?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
  if (!syncManager) return;

  const status = syncManager.getSyncStatus(documentId);
  if (status === undefined) return;

  return syncStatusToUI[status];
}
