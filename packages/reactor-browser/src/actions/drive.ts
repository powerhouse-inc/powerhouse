import { driveCollectionId } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  DriveInput,
  PullResponderTrigger,
  RemoteDriveOptions,
  ServerListener,
  SharingType,
  Trigger,
} from "document-drive";
import {
  PullResponderTransmitter,
  addTrigger as baseAddTrigger,
  removeTrigger as baseRemoveTrigger,
  setAvailableOffline,
  setDriveName,
  setSharingType,
} from "document-drive";
import type { PHDocument } from "document-model";
import { generateId } from "document-model/core";
import {
  isChannelSyncEnabledSync,
  isLegacyWriteEnabledSync,
} from "../hooks/use-feature-flags.js";
import { getUserPermissions } from "../utils/user.js";
import { queueActions } from "./queue.js";

export async function addDrive(input: DriveInput, preferredEditor?: string) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create drives");
  }

  const useLegacy = isLegacyWriteEnabledSync();

  if (useLegacy) {
    const reactor = window.ph?.legacyReactor;
    if (!reactor) {
      throw new Error("Legacy reactor not initialized");
    }

    const id = input.id || generateId();
    const newDrive = await reactor.addDrive(
      {
        global: input.global,
        local: input.local,
        id,
      },
      preferredEditor,
    );
    return newDrive;
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (!reactorClient) {
      throw new Error("ReactorClient not initialized");
    }

    const id = input.id || generateId();
    const newDrive = await reactorClient.createEmpty<DocumentDriveDocument>(
      "powerhouse/document-drive",
    );
    return newDrive;
  }
}

export async function addRemoteDrive(
  url: string,
  options: RemoteDriveOptions | Record<string, never>,
) {
  const useLegacy = isLegacyWriteEnabledSync();

  if (useLegacy) {
    const reactor = window.ph?.legacyReactor;
    if (!reactor) {
      throw new Error("Legacy reactor not initialized");
    }

    const newDrive = await reactor.addRemoteDrive(
      url,
      options as RemoteDriveOptions,
    );
    return newDrive;
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (!reactorClient) {
      throw new Error("ReactorClient not initialized");
    }

    const sync = window.ph?.sync;
    if (!sync) {
      throw new Error("Sync not initialized");
    }

    const driveId = driveIdFromUrl(url);

    // Construct the reactor subgraph URL from the base URL
    // e.g., "http://localhost:4001/d/abc123" -> "http://localhost:4001/graphql/r"
    const parsedUrl = new URL(url);
    const reactorGraphqlUrl = `${parsedUrl.protocol}//${parsedUrl.host}/graphql/r`;

    await sync.add(driveId, driveCollectionId("main", driveId), {
      type: "gql",
      parameters: {
        url: reactorGraphqlUrl,
      },
    });
  }
}

function driveIdFromUrl(url: string): string {
  return url.split("/").pop() ?? "";
}

export async function deleteDrive(driveId: string) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to delete drives");
  }

  const useLegacy = isLegacyWriteEnabledSync();

  if (useLegacy) {
    const reactor = window.ph?.legacyReactor;
    if (!reactor) {
      throw new Error("Legacy reactor not initialized");
    }
    await reactor.deleteDrive(driveId);
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (!reactorClient) {
      throw new Error("ReactorClient not initialized");
    }
    await reactorClient.deleteDocument(driveId);
  }
}

export async function renameDrive(
  driveId: string,
  name: string,
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename drives");
  }

  const useLegacy = isLegacyWriteEnabledSync();

  if (useLegacy) {
    const reactor = window.ph?.legacyReactor;
    if (!reactor) {
      throw new Error("Legacy reactor not initialized");
    }
    const drive = await reactor.getDrive(driveId);
    const renamedDrive = await queueActions(drive, setDriveName({ name }));
    return renamedDrive;
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (!reactorClient) {
      throw new Error("ReactorClient not initialized");
    }
    return await reactorClient.rename(driveId, name);
  }
}

export async function setDriveAvailableOffline(
  driveId: string,
  availableOffline: boolean,
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to change drive availability");
  }

  const useLegacy = isLegacyWriteEnabledSync();

  if (useLegacy) {
    const reactor = window.ph?.legacyReactor;
    if (!reactor) {
      throw new Error("Legacy reactor not initialized");
    }
    const drive = await reactor.getDrive(driveId);
    const updatedDrive = await queueActions(
      drive,
      setAvailableOffline({ availableOffline }),
    );
    return updatedDrive;
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (!reactorClient) {
      throw new Error("ReactorClient not initialized");
    }
    const { document: drive } =
      await reactorClient.get<DocumentDriveDocument>(driveId);
    return await reactorClient.execute(driveId, "main", [
      setAvailableOffline({ availableOffline }),
    ]);
  }
}

export async function setDriveSharingType(
  driveId: string,
  sharingType: SharingType,
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to change drive sharing type");
  }

  const useLegacy = isLegacyWriteEnabledSync();

  if (useLegacy) {
    const reactor = window.ph?.legacyReactor;
    if (!reactor) {
      throw new Error("Legacy reactor not initialized");
    }
    const drive = await reactor.getDrive(driveId);
    const updatedDrive = await queueActions(
      drive,
      setSharingType({ type: sharingType }),
    );
    return updatedDrive;
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (!reactorClient) {
      throw new Error("ReactorClient not initialized");
    }
    return await reactorClient.execute(driveId, "main", [
      setSharingType({ type: sharingType }),
    ]);
  }
}

export async function removeTrigger(driveId: string, triggerId: string) {
  const useChannelSync = isChannelSyncEnabledSync();
  if (useChannelSync) {
    // Channel sync replaces triggers - no-op
    return;
  }

  const reactor = window.ph?.legacyReactor;
  if (!reactor) {
    throw new Error("Legacy reactor not initialized");
  }
  const drive = await reactor.getDrive(driveId);
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
  const useChannelSync = isChannelSyncEnabledSync();
  if (useChannelSync) {
    // Channel sync replaces triggers - no-op
    return;
  }

  const reactor = window.ph?.legacyReactor;
  if (!reactor) {
    throw new Error("Legacy reactor not initialized");
  }

  const uuid = generateId();
  const listener: ServerListener = {
    driveId,
    listenerId: uuid,
    block: false,
    filter: {
      branch: options.pullFilter?.branch ?? [],
      documentId: options.pullFilter?.documentId ?? [],
      documentType: options.pullFilter?.documentType ?? [],
      scope: options.pullFilter?.scope ?? [],
    },
    system: false,
    label: `Pullresponder #${uuid}`,
    callInfo: {
      data: "",
      name: "PullResponder",
      transmitterType: "PullResponder",
    },
  };

  // TODO: circular reference
  // TODO: once we have DI, remove this and pass around
  const listenerManager = reactor.listeners;
  listener.transmitter = new PullResponderTransmitter(
    listener,
    listenerManager,
  );

  // set the listener on the manager directly (bypassing operations)
  try {
    await listenerManager.setListener(driveId, listener);
  } catch (error) {
    throw new Error(`Listener couldn't be registered: ${error}`);
  }

  // for backwards compatibility: return everything but the transmitter
  return {
    driveId,
    filter: listener.filter,
    data: {
      interval: `${options.pullInterval}` || "1000",
      listenerId: uuid,
      url,
    },
    id: uuid,
    type: "PullResponder",
  };
}

export async function addTrigger(driveId: string, trigger: Trigger) {
  const useChannelSync = isChannelSyncEnabledSync();
  if (useChannelSync) {
    // Channel sync replaces triggers - no-op
    return;
  }

  const reactor = window.ph?.legacyReactor;
  if (!reactor) {
    throw new Error("Legacy reactor not initialized");
  }
  const drive = await reactor.getDrive(driveId);
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
