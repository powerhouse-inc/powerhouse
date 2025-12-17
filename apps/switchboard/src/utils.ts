import type { IReactorClient } from "@powerhousedao/reactor";
import type { ISigner } from "document-model";
import type {
  DocumentDriveDocument,
  DriveInput,
  IDocumentDriveServer,
} from "document-drive";
import { driveCreateDocument, driveCreateState } from "document-drive";
import { createSignedHeader, generateId } from "document-model/core";

export async function addDefaultDrive(
  client: IReactorClient,
  signer: ISigner,
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

  // check if the drive already exists
  let existingDrive;
  try {
    existingDrive = await client.get(driveId);
  } catch {
    //
  }

  // already exists, return the existing drive url
  if (existingDrive) {
    return `http://localhost:${serverPort}/d/${driveId}`;
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

  // sign the header
  document.header = await createSignedHeader(
    document.header,
    document.header.documentType,
    signer,
  );

  console.log(`Creating default drive`, document);

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
