import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  SharingType,
  SyncStatus,
  Trigger
} from "document-drive";

function handleSettledResults<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.reduce((acc, result) => {
    if (result.status === "fulfilled") {
      acc.push(result.value);
    } else {
      console.warn(result.reason);
    }
    return acc;
  }, [] as T[]);
}

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

export function getDrivePullResponderTrigger(
  drive: DocumentDriveDocument | undefined,
): Trigger | undefined {
  return drive?.state.local.triggers.find(
    (trigger) => trigger.type === "PullResponder",
  );
}

export function getDrivePullResponderUrl(
  drive: DocumentDriveDocument | undefined,
): string | undefined {
  const pullResponder = getDrivePullResponderTrigger(drive);
  return pullResponder?.data?.url;
}

export function getDriveRemoteUrl(
  drive: DocumentDriveDocument | undefined,
): string | undefined {
  if (!drive) return undefined;
  const pullResponderUrl = getDrivePullResponderUrl(drive);

  if ("remoteUrl" in drive.state.global) {
    const remoteUrl = drive.state.global.remoteUrl;
    if (typeof remoteUrl === "string") {
      return remoteUrl;
    }
  }

  return pullResponderUrl;
}

export function getDriveIsRemote(
  drive: DocumentDriveDocument | undefined,
): boolean {
  const remoteUrl = getDriveRemoteUrl(drive);
  const pullResponderUrl = getDrivePullResponderUrl(drive);
  return remoteUrl !== undefined || pullResponderUrl !== undefined;
}
