import { driveCollectionId, parseDriveUrl } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  DriveInput,
  PullResponderTrigger,
  RemoteDriveOptions,
  SharingType,
  Trigger,
} from "document-drive";
import {
  driveCreateDocument,
  setAvailableOffline,
  setSharingType,
} from "document-drive";
import type { PHDocument } from "document-model";
import { getUserPermissions } from "../utils/user.js";

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
  options: RemoteDriveOptions | Record<string, never>,
  driveId?: string,
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

  const { graphqlEndpoint: reactorGraphqlUrl } = parseDriveUrl(url);

  // Resolve real drive UUID if not provided
  let resolvedDriveId = driveId;
  if (!resolvedDriveId) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to resolve drive info from ${url}`);
    }
    const driveInfo = (await response.json()) as { id: string };
    resolvedDriveId = driveInfo.id;
  }

  // Use a unique name for the remote to allow multiple subscribers to the same drive
  const remoteName = crypto.randomUUID();

  await sync.add(remoteName, driveCollectionId("main", resolvedDriveId), {
    type: "gql",
    parameters: {
      url: reactorGraphqlUrl,
    },
  });

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
  await reactorClient.deleteDocument(driveId);
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

// @deprecated
export async function removeTrigger(driveId: string, triggerId: string) {
  // Legacy -- to be removed.
  return;
}

// @deprecated
export async function registerNewPullResponderTrigger(
  driveId: string,
  url: string,
  options: Pick<RemoteDriveOptions, "pullFilter" | "pullInterval">,
): Promise<PullResponderTrigger | undefined> {
  // Legacy -- to be removed.
  return undefined;
}

// @deprecated
export async function addTrigger(driveId: string, trigger: Trigger) {
  // Legacy -- to be removed.
  return;
}
