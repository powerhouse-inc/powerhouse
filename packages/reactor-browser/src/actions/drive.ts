import {
  addTrigger as baseAddTrigger,
  removeTrigger as baseRemoveTrigger,
  createDriveState,
  type DocumentDriveDocument,
  type DriveInput,
  type Listener,
  PullResponderTransmitter,
  type PullResponderTrigger,
  type RemoteDriveOptions,
  setAvailableOffline,
  setDriveName,
  setSharingType,
  type SharingType,
  SynchronizationUnitNotFoundError,
  type SyncStatus,
  type Trigger,
} from "document-drive";
import { generateId } from "document-model";
import { queueActions } from "./queue.js";

export async function addDrive(drive: DriveInput, preferredEditor?: string) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create drives");
  }
  const id = drive.id || generateId();
  const driveInput = createDriveState(drive);
  const newDrive = await reactor.addDrive(
    {
      global: driveInput.global,
      local: driveInput.local,
      id,
    },
    preferredEditor,
  );
  return newDrive;
}

export async function addRemoteDrive(url: string, options: RemoteDriveOptions) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }

  const newDrive = await reactor.addRemoteDrive(url, options);
  return newDrive;
}

export async function deleteDrive(driveId: string) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to delete drives");
  }
  await reactor.deleteDrive(driveId);
}

export async function renameDrive(driveId: string, name: string) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename drives");
  }
  const drive = await reactor.getDrive(driveId);
  const renamedDrive = await queueActions(drive, setDriveName({ name }));
  return renamedDrive;
}

export async function setDriveAvailableOffline(
  driveId: string,
  availableOffline: boolean,
) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to change drive availability");
  }
  const drive = await reactor.getDrive(driveId);
  const updatedDrive = await queueActions(
    drive,
    setAvailableOffline({ availableOffline }),
  );
  return updatedDrive;
}

export async function setDriveSharingType(
  driveId: string,
  sharingType: SharingType,
) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to change drive availability");
  }
  const drive = await reactor.getDrive(driveId);
  const updatedDrive = await queueActions(
    drive,
    setSharingType({ type: sharingType }),
  );
  return updatedDrive;
}

export function getSyncStatus(
  documentId: string,
  sharingType: SharingType,
): Promise<SyncStatus | undefined> {
  if (sharingType === "LOCAL") return Promise.resolve(undefined);
  const reactor = window.reactor;
  if (!reactor) {
    return Promise.resolve(undefined);
  }
  try {
    const syncStatus = reactor.getSyncStatus(documentId);
    if (syncStatus instanceof SynchronizationUnitNotFoundError)
      return Promise.resolve("INITIAL_SYNC");
    return Promise.resolve(syncStatus);
  } catch (error) {
    console.error(error);
    return Promise.resolve("ERROR");
  }
}

export function getSyncStatusSync(
  documentId: string,
  sharingType: SharingType,
): SyncStatus | undefined {
  if (sharingType === "LOCAL") return;
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  try {
    const syncStatus = reactor.getSyncStatus(documentId);
    if (syncStatus instanceof SynchronizationUnitNotFoundError)
      return "INITIAL_SYNC";
    return syncStatus;
  } catch (error) {
    console.error(error);
    return "ERROR";
  }
}

export async function clearStorage() {
  await window.phStorage?.clear();
}

export async function removeTrigger(driveId: string, triggerId: string) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
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
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }

  const uuid = generateId();
  const listener: Listener = {
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
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const drive = await reactor.getDrive(driveId);
  const unsafeCastAsDrive = (await queueActions(
    drive,
    baseAddTrigger({ trigger }),
  )) as DocumentDriveDocument;

  const newTrigger = unsafeCastAsDrive.state.local.triggers.find(
    (trigger) => trigger.id === trigger.id,
  );

  if (!newTrigger) {
    throw new Error(`There was an error adding the trigger ${trigger.id}`);
  }
}
