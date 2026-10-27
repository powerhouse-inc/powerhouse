import type { IReactorClient } from "@powerhousedao/reactor";
import {
  reactorDriveCreateDocument,
  reactorDriveCreateState,
} from "@powerhousedao/reactor-drive";
import {
  driveCreateDocument,
  driveCreateState,
} from "@powerhousedao/shared/document-drive";
import type { DriveInput } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type PHDocument,
} from "@powerhousedao/shared/document-model";

/**
 * A configured id pins the drive, and only a legacy drive can take a chosen
 * id; otherwise the client's creation default applies.
 */
async function underCreatePolicy<TDocument extends PHDocument>(
  client: IReactorClient,
  document: TDocument,
  id: string | undefined,
): Promise<TDocument> {
  return id
    ? withSignaturePolicy(document, "legacy", { id })
    : withSignaturePolicy(document, await client.getCreateSignaturePolicy());
}

type DefaultDriveLogger = { error: (message: string) => void };

/** The document that already holds `slug`; null when two do (an id and a slug). */
async function slugHolder(
  client: IReactorClient,
  slug: string,
): Promise<PHDocument | null | undefined> {
  let id: string;
  try {
    id = await client.resolveIdOrSlug(slug);
  } catch (error) {
    const notFound =
      error instanceof Error && error.name === "DocumentNotFoundError";
    return notFound ? undefined : null;
  }
  return client.get(id);
}

/**
 * A default drive whose slug another document holds: a drive of the same type
 * stands in for it (its URL); anything else keeps it uncreated (null), with an
 * error logged so the server still starts. Undefined when the slug is free.
 */
async function slugTakenBy(
  client: IReactorClient,
  drive: DriveInput,
  documentType: string,
  serverPort: number,
  logger: DefaultDriveLogger,
): Promise<string | null | undefined> {
  if (!drive.slug) return undefined;
  const holder = await slugHolder(client, drive.slug);
  if (holder === undefined) return undefined;
  if (holder?.header.documentType === documentType) {
    return `http://localhost:${serverPort}/d/${holder.header.id}`;
  }
  const owner = holder
    ? `${holder.header.documentType} document ${holder.header.id}`
    : "two documents";
  logger.error(
    `The default drive "${drive.slug}" was not created: the slug belongs to ${owner}.`,
  );
  return null;
}

/** Creates a configured drive unless one with its id or slug exists; the
 * URL it is served at, or undefined when another document holds the slug. */
export async function addDefaultDrive(
  client: IReactorClient,
  drive: DriveInput,
  serverPort: number,
  logger: DefaultDriveLogger = console,
): Promise<string | undefined> {
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
  const created = driveCreateDocument({
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

  const taken = await slugTakenBy(
    client,
    drive,
    created.header.documentType,
    serverPort,
    logger,
  );
  if (taken !== undefined) return taken ?? undefined;

  const document = await underCreatePolicy(client, created, drive.id);
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
    await (
      await client.write.create(document)
    ).readable;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (!errorMessage.includes("already exists")) {
      throw e;
    }
  }

  return `http://localhost:${serverPort}/d/${driveId}`;
}

/** addDefaultDrive for a reactor drive. */
export async function addDefaultReactorDrive(
  client: IReactorClient,
  drive: DriveInput,
  serverPort: number,
  logger: DefaultDriveLogger = console,
): Promise<string | undefined> {
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
  const created = reactorDriveCreateDocument({
    global: {
      ...global,
      name: drive.global.name,
      icon: drive.global.icon ?? global.icon,
    },
    local: {
      ...local,
      availableOffline: drive.local?.availableOffline ?? local.availableOffline,
      sharingType: drive.local?.sharingType ?? local.sharingType,
    },
  });

  const taken = await slugTakenBy(
    client,
    drive,
    created.header.documentType,
    serverPort,
    logger,
  );
  if (taken !== undefined) return taken ?? undefined;

  const document = await underCreatePolicy(client, created, drive.id);
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
    await (
      await client.write.create(document)
    ).readable;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (!errorMessage.includes("already exists")) {
      throw e;
    }
  }

  return `http://localhost:${serverPort}/d/${driveId}`;
}

export { isPostgresUrl } from "./postgres-url.mjs";
