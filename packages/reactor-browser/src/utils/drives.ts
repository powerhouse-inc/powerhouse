import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  SharingType,
  SyncStatus
} from "document-drive";

/** Returns the sharing type for a drive. */
export function getDriveSharingType(
  drive:
    | {
        state: {
          local: {
            sharingType?: string | null;
          };
        };
        readContext?: {
          sharingType?: string | null;
        };
      }
    | undefined
    | null,
) {
  if (!drive) return "PUBLIC";
  const isReadDrive = "readContext" in drive;
  const { sharingType: _sharingType } = !isReadDrive
    ? drive.state.local
    : { sharingType: "PUBLIC" };
  const __sharingType = _sharingType?.toUpperCase();
  return (__sharingType === "PRIVATE" ? "LOCAL" : __sharingType) as SharingType;
}

/** Returns whether a drive is available offline. */
export function getDriveAvailableOffline(
  drive:
    | {
        state: {
          local: {
            availableOffline?: boolean | null;
          };
        };
        readContext?: {
          availableOffline?: boolean | null;
        };
      }
    | undefined
    | null,
) {
  if (!drive) return false;
  const isReadDrive = "readContext" in drive;
  const { availableOffline: _availableOffline } = !isReadDrive
    ? drive.state.local
    : { availableOffline: false };
  return _availableOffline ?? false;
}

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
