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
  addTrigger as baseAddTrigger,
  removeTrigger as baseRemoveTrigger,
  driveCreateDocument,
  setAvailableOffline,
  setSharingType,
} from "document-drive";
import type { PHDocument } from "document-model";
import { isChannelSyncEnabledSync } from "../hooks/use-feature-flags.js";
import { getUserPermissions } from "../utils/user.js";
import { queueActions } from "./queue.js";

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
) {
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const sync = window.ph?.sync;
  if (!sync) {
    throw new Error("Sync not initialized");
  }

  const { driveId, graphqlEndpoint: reactorGraphqlUrl } = parseDriveUrl(url);

  // Use a unique name for the remote to allow multiple subscribers to the same drive
  const remoteName = crypto.randomUUID();

  await sync.add(remoteName, driveCollectionId("main", driveId), {
    type: "gql",
    parameters: {
      url: reactorGraphqlUrl,
    },
  });

  return driveId;
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

export async function removeTrigger(driveId: string, triggerId: string) {
  const useChannelSync = isChannelSyncEnabledSync();
  if (useChannelSync) {
    // Channel sync replaces triggers - no-op
    return;
  }

  const reactor = window.ph?.reactorClient;
  if (!reactor) {
    throw new Error("ReactorClient not initialized");
  }

  const drive = await reactor.get<DocumentDriveDocument>(driveId);
  const unsafeCastAsDrive = (await queueActions(
    drive,
    baseRemoveTrigger({ triggerId }),
  )) as DocumentDriveDocument;

  const trigger = unsafeCastAsDrive.state.local.triggers.find(
    (trigger) => trigger.id === triggerId,
  );

  if (trigger) {
    throw new Error(`There was an error removing trigger ${triggerId}`);
  }
}

export async function registerNewPullResponderTrigger(
  driveId: string,
  url: string,
  options: Pick<RemoteDriveOptions, "pullFilter" | "pullInterval">,
): Promise<PullResponderTrigger | undefined> {
  // Legacy -- to be removed.
  return undefined;
}

export async function addTrigger(driveId: string, trigger: Trigger) {
  const useChannelSync = isChannelSyncEnabledSync();
  if (useChannelSync) {
    // Channel sync replaces triggers - no-op
    return;
  }

  const reactor = window.ph?.reactorClient;
  if (!reactor) {
    throw new Error("ReactorClient not initialized");
  }
  const drive = await reactor.get<DocumentDriveDocument>(driveId);
  const unsafeCastAsDrive = (await queueActions(
    drive,
    baseAddTrigger({ trigger }),
  )) as DocumentDriveDocument;

  const newTrigger = unsafeCastAsDrive.state.local.triggers.find(
    (t) => t.id === trigger.id,
  );

  if (!newTrigger) {
    throw new Error(`There was an error adding the trigger ${trigger.id}`);
  }
}
