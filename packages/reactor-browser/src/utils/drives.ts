import type { Reactor } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FolderNode,
  SharingType,
} from "document-drive";
import type { PHDocument } from "document-model";

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

/** Makes a folder node from a drive, used for making breadcrumbs. */
export function makeFolderNodeFromDrive(
  drive: DocumentDriveDocument | null | undefined,
): FolderNode | undefined {
  if (!drive) return undefined;
  return {
    id: drive.header.id,
    name: drive.state.global.name,
    kind: "FOLDER",
    parentFolder: null,
  };
}

export async function getDocumentsForDriveId(
  reactor: Reactor | undefined,
  driveId: string | undefined,
): Promise<PHDocument[]> {
  if (!reactor || !driveId) return [];
  const documentIds = await reactor.getDocuments(driveId);
  const documents = await Promise.all(
    documentIds.map((id) => reactor.getDocument(id)),
  );
  return documents;
}

export async function getDrives(
  reactor: Reactor | undefined,
): Promise<DocumentDriveDocument[]> {
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(driveIds.map((id) => reactor.getDrive(id)));
  return drives;
}

export async function getDocuments(
  reactor: Reactor | undefined,
): Promise<PHDocument[]> {
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const documentIds = await Promise.all(
    driveIds.map((id) => reactor.getDocuments(id)),
  );
  const documents = await Promise.all(
    documentIds.flat().map((id) => reactor.getDocument(id)),
  );
  return documents;
}

export async function getDriveById(
  reactor: Reactor | undefined,
  driveId: string | undefined,
): Promise<DocumentDriveDocument | undefined> {
  if (!reactor || !driveId) return undefined;
  return await reactor.getDrive(driveId);
}
