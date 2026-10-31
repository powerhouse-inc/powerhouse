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
import type {
  SwitchboardDriveDocumentType,
  SwitchboardDriveInput,
} from "./types.js";

const isDriveDocumentType = (documentType: string): boolean =>
  documentType === driveDocumentType ||
  documentType === REACTOR_DRIVE_DOCUMENT_TYPE;

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

type DefaultDriveLogger = { error: (message: string) => void };

/** The document a slug names, unless someone deleted it and kept the slug. */
async function liveHolder(
  client: IReactorClient,
  id: string,
): Promise<PHDocument | "deleted"> {
  let document: PHDocument;
  try {
    document = await client.get(id);
  } catch (error) {
    // A slug resolved to it, so it exists: which error depends on the host.
    const gone =
      error instanceof Error &&
      (error.name === "DocumentDeletedError" ||
        error.name === "DocumentNotFoundError");
    if (gone) return "deleted";
    throw error;
  }
  return document.state.document?.isDeleted ? "deleted" : document;
}

/** The document that already holds `slug`; null when two do (an id and a slug). */
async function slugHolder(
  client: IReactorClient,
  slug: string,
): Promise<PHDocument | "deleted" | null | undefined> {
  let id: string;
  try {
    id = await client.resolveIdOrSlug(slug);
  } catch (error) {
    const notFound =
      error instanceof Error && error.name === "DocumentNotFoundError";
    return notFound ? undefined : null;
  }
  return liveHolder(client, id);
}

async function existingDrive(
  client: IReactorClient,
  id: string,
): Promise<PHDocument | undefined> {
  try {
    return await client.get(id);
  } catch {
    return undefined;
  }
}

const driveState = (
  drive: SwitchboardDriveInput,
  documentType: SwitchboardDriveDocumentType,
): Partial<PHBaseState> => {
  if (documentType === REACTOR_DRIVE_DOCUMENT_TYPE) {
    const { global, local } = reactorDriveCreateState();
    return {
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
    } as Partial<PHBaseState>;
  }
  const { global } = driveCreateState();
  return {
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
  } as Partial<PHBaseState>;
};

/**
 * Makes sure the drive `drive.slug` names exists, and returns the URL it is
 * served at, or undefined when it could not be made (logged, so the server
 * still starts).
 *
 * The slug is the drive's name, and the only thing an existing drive is found
 * by: everything else is what a missing drive is created with, so a drive of
 * another type or id under that slug is left as it is. `drive.id` is found too,
 * for a drive declared by an id it already has. Without one the reactor
 * generates the id, so nothing here may rely on it equalling the slug.
 *
 * A deleted drive frees its slug, so the next call makes a new empty drive and
 * the slug names that one from then on. A delete with `keepSlug` is someone
 * deciding the drive is gone: the slug stays on it and nothing is created.
 */
export async function ensureDrive(
  client: IReactorClient,
  drive: SwitchboardDriveInput,
  serverPort: number,
  logger: DefaultDriveLogger = console,
): Promise<string | undefined> {
  if (!drive.slug && !drive.id) {
    throw new Error("A drive needs a slug");
  }
  const documentType = drive.documentType ?? driveDocumentType;

  if (drive.slug) {
    const holder = await slugHolder(client, drive.slug);
    if (holder === "deleted") {
      logger.error(
        `The default drive "${drive.slug}" was not created: it was deleted, and its slug kept.`,
      );
      return undefined;
    }
    if (holder?.header && isDriveDocumentType(holder.header.documentType)) {
      return `http://localhost:${serverPort}/d/${holder.header.id}`;
    }
    if (holder !== undefined) {
      const owner = holder
        ? `${holder.header.documentType} document ${holder.header.id}`
        : "two documents";
      logger.error(
        `The default drive "${drive.slug}" was not created: the slug belongs to ${owner}.`,
      );
      return undefined;
    }
  }
  if (drive.id && (await existingDrive(client, drive.id))) {
    return `http://localhost:${serverPort}/d/${drive.id}`;
  }

  const document = await newDrive(
    client,
    documentType,
    driveState(drive, documentType),
    drive.id,
  );
  if (drive.slug) {
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

  return `http://localhost:${serverPort}/d/${drive.id || drive.slug}`;
}

/** @deprecated Use {@link ensureDrive}. */
export function addDefaultDrive(
  client: IReactorClient,
  drive: DriveInput,
  serverPort: number,
  logger: DefaultDriveLogger = console,
): Promise<string | undefined> {
  return ensureDrive(
    client,
    { ...drive, documentType: driveDocumentType },
    serverPort,
    logger,
  );
}

/** @deprecated Use {@link ensureDrive} with `documentType`. */
export function addDefaultReactorDrive(
  client: IReactorClient,
  drive: DriveInput,
  serverPort: number,
  logger: DefaultDriveLogger = console,
): Promise<string | undefined> {
  return ensureDrive(
    client,
    { ...drive, documentType: REACTOR_DRIVE_DOCUMENT_TYPE },
    serverPort,
    logger,
  );
}

export { isPostgresUrl } from "./postgres-url.mjs";
