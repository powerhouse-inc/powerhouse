import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  SharingType,
  SyncStatus,
} from "document-drive";

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
): Promise<SyncStatus | undefined> {
  if (sharingType === "LOCAL") return Promise.resolve(undefined);

  // TODO: Implement sync status via ReactorClient/SyncManager
  // For now, return undefined as sync status is managed differently
  return Promise.resolve(undefined);
}

export function getSyncStatusSync(
  documentId: string,
  sharingType: SharingType,
): SyncStatus | undefined {
  if (sharingType === "LOCAL") return;

  // TODO: Implement sync status via ReactorClient/SyncManager
  // For now, return undefined as sync status is managed differently
  return undefined;
}
