import type { IReactorClient } from "@powerhousedao/reactor";
import type { DocumentDriveDocument, DriveInput } from "document-drive";
import { driveCreateDocument, driveCreateState } from "document-drive";
import type { IDocumentDriveServer } from "document-drive";
import { generateId } from "document-model/core";

export async function addDefaultDrive(
  client: IReactorClient,
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

  const { global } = driveCreateState();
  const document = driveCreateDocument({
    global: {
      ...global,
      name: drive.global.name,
      icon: drive.global.icon ?? global.icon,
    },
    local: {
      availableOffline: drive.local?.availableOffline ?? false,
      sharingType: drive.local?.sharingType ?? "public",
      listeners: drive.local?.listeners ?? [],
      triggers: drive.local?.triggers ?? [],
    },
  });

  if (drive.id && drive.id.length > 0) {
    document.header.id = drive.id;
  }
  if (drive.slug && drive.slug.length > 0) {
    document.header.slug = drive.slug;
  }
  if (drive.global.name) {
    document.header.name = drive.global.name;
  }
  if (drive.preferredEditor) {
    document.header.meta = { preferredEditor: drive.preferredEditor };
  }

  try {
    await client.create(document);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (!errorMessage.includes("already exists")) {
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
