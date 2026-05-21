import {
  driveCollectionId,
  PropagationMode,
  type PollBehavior,
} from "@powerhousedao/reactor";
import {
  driveCreateDocument,
  setAvailableOffline,
  setSharingType,
  type DocumentDriveDocument,
  type DriveInput,
  type SharingType,
} from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { getUserPermissions } from "../utils/user.js";

export type AddRemoteDriveOptions = {
  pollBehavior?: PollBehavior;
};

export async function addDrive(input: DriveInput, preferredEditor?: string) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create drives");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const driveDoc = driveCreateDocument({
    global: {
      name: input.global.name || "",
      icon: input.global.icon ?? null,
      nodes: [],
    },
  });

  if (preferredEditor) {
    driveDoc.header.meta = { preferredEditor };
  }

  return await reactorClient.create<DocumentDriveDocument>(driveDoc);
}

export async function addRemoteDrive(
  url: string,
  driveId?: string,
  options?: AddRemoteDriveOptions,
) {
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const sync =
    window.ph?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
  if (!sync) {
    throw new Error("Sync not initialized");
  }

  // Fetch drive info from the REST endpoint to get both id and graphqlEndpoint
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to resolve drive info from ${url}`);
  }
  const driveInfo = (await response.json()) as {
    id: string;
    graphqlEndpoint: string;
  };

  const resolvedDriveId = driveId ?? driveInfo.id;
  const collectionId = driveCollectionId("main", resolvedDriveId);

  const existingRemote = sync
    .list()
    .find((remote) => remote.collectionId === collectionId);
  if (existingRemote) {
    return resolvedDriveId;
  }

  const remoteName = crypto.randomUUID();

  await sync.add(
    remoteName,
    collectionId,
    {
      type: "gql",
      parameters: {
        url: driveInfo.graphqlEndpoint,
      },
    },
    undefined,
    options?.pollBehavior ? { pollBehavior: options.pollBehavior } : undefined,
  );

  return resolvedDriveId;
}

export async function deleteDrive(driveId: string) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to delete drives");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const sync =
    window.ph?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
  if (sync) {
    const collectionId = driveCollectionId("main", driveId);
    const remotes = sync
      .list()
      .filter((remote) => remote.collectionId === collectionId);
    for (const remote of remotes) {
      await sync.remove(remote.name);
    }
  }

  await reactorClient.deleteDocument(driveId, PropagationMode.Cascade);
}

export async function renameDrive(
  driveId: string,
  name: string,
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename drives");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  return await reactorClient.rename(driveId, name);
}

export async function setDriveAvailableOffline(
  driveId: string,
  availableOffline: boolean,
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to change drive availability");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  return await reactorClient.execute(driveId, "main", [
    setAvailableOffline({ availableOffline }),
  ]);
}

export async function setDriveSharingType(
  driveId: string,
  sharingType: SharingType,
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to change drive sharing type");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  return await reactorClient.execute(driveId, "main", [
    setSharingType({ type: sharingType }),
  ]);
}
