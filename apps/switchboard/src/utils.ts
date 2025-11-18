import type {
  DocumentDriveDocument,
  DriveInput,
  IDocumentDriveServer,
} from "document-drive";
import { DocumentAlreadyExistsError } from "document-drive";
import { generateId } from "document-model/core";

export async function addDefaultDrive(
  driveServer: IDocumentDriveServer,
  drive: DriveInput,
  serverPort: number,
) {
  let driveId = drive.id;
  if (!driveId || driveId.length === 0) {
    driveId = drive.slug;
  }

  if (!driveId || driveId.length === 0) {
    throw new Error("Invalid Drive Id");
  }

  try {
    // add default drive
    await driveServer.addDrive(drive);
  } catch (e) {
    if (!(e instanceof DocumentAlreadyExistsError)) {
      throw e;
    }
  }

  return `http://localhost:${serverPort}/d/${driveId}`;
}

export function isPostgresUrl(url: string) {
  return url.startsWith("postgresql") || url.startsWith("postgres");
}

export async function addRemoteDrive(
  driveServer: IDocumentDriveServer,
  remoteDriveUrl: string,
): Promise<DocumentDriveDocument> {
  return await driveServer.addRemoteDrive(remoteDriveUrl, {
    availableOffline: true,
    sharingType: "public",
    listeners: [
      {
        block: true,
        callInfo: {
          data: remoteDriveUrl,
          name: "switchboard-push",
          transmitterType: "SwitchboardPush",
        },
        filter: {
          branch: ["main"],
          documentId: ["*"],
          documentType: ["*"],
          scope: ["global"],
        },
        label: "Switchboard Sync",
        listenerId: generateId(),
        system: true,
      },
    ],
    triggers: [],
  });
}
