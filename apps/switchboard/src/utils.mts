import type { IReactorClient } from "@powerhousedao/reactor";
import {
  REACTOR_DRIVE_DOCUMENT_TYPE,
  reactorDriveCreateState,
} from "@powerhousedao/reactor-drive";
import {
  driveCreateState,
  driveDocumentType,
} from "@powerhousedao/shared/document-drive";
import type { DriveInput } from "@powerhousedao/shared/document-drive";
import type {
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";

/**
 * A configured id pins the drive, and only a legacy drive can take a chosen
 * id; otherwise the client's creation default applies.
 */
function newDrive<TDocument extends PHDocument>(
  client: IReactorClient,
  documentType: string,
  initialState: Partial<PHBaseState>,
  id: string | undefined,
): Promise<TDocument> {
  return client.newDocument<TDocument>(documentType, {
    initialState,
    ...(id ? { signaturePolicy: "legacy" as const, id } : {}),
  });
}

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
  const document = await newDrive(
    client,
    driveDocumentType,
    {
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
    } as Partial<PHBaseState>,
    drive.id,
  );
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

export async function addDefaultReactorDrive(
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

  let existingDrive;
  try {
    existingDrive = await client.get(driveId);
  } catch {
    //
  }

  if (existingDrive) {
    return `http://localhost:${serverPort}/d/${driveId}`;
  }

  const { global, local } = reactorDriveCreateState();
  const document = await newDrive(
    client,
    REACTOR_DRIVE_DOCUMENT_TYPE,
    {
      global: {
        ...global,
        name: drive.global.name,
        icon: drive.global.icon ?? global.icon,
      },
      local: {
        ...local,
        availableOffline:
          drive.local?.availableOffline ?? local.availableOffline,
        sharingType: drive.local?.sharingType ?? local.sharingType,
      },
    } as Partial<PHBaseState>,
    drive.id,
  );
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
