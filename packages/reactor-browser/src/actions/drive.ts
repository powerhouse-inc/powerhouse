import {
  DocumentChangeType,
  DriveCollectionId,
  isDriveAuthError,
  PropagationMode,
  type IReactorClient,
  type PollBehavior,
} from "@powerhousedao/reactor";
import {
  driveCreateDocument,
  setAvailableOffline,
  setDriveIcon as createSetDriveIconAction,
  setDriveName as createSetDriveNameAction,
  setSharingType,
  type DocumentDriveDocument,
  type DriveInput,
  type SharingType,
} from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { getUserPermissions } from "../utils/user.js";
import { showPHModal } from "../hooks/modals.js";

const DEFAULT_INITIAL_SYNC_TIMEOUT_MS = 30_000;

// In-flight remote registrations keyed by collectionId. sync.list()/sync.add()
// is not atomic, so concurrent addRemoteDrive calls for the same drive would
// both miss the existing remote and register duplicates. Concurrent callers
// share the first registration instead.
const inFlightRemoteRegistrations = new Map<string, Promise<unknown>>();

export type AddRemoteDriveOptions = {
  pollBehavior?: PollBehavior;
  /**
   * When true, wait for the drive document to be materialized locally
   * (i.e. queryable via the reactor) before resolving. Without this,
   * `addRemoteDrive` returns as soon as the remote is registered with
   * the sync manager, before initial backfill delivers the drive.
   */
  awaitInitialSync?: boolean;
  /** Timeout for the initial-sync wait. Defaults to 30s. */
  initialSyncTimeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Resolves once a document with the given id is queryable through the
 * reactor client. Subscribes to Created events filtered by id and
 * short-circuits if the document already exists.
 */
export async function waitForDocumentReady(
  reactorClient: IReactorClient,
  documentId: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_INITIAL_SYNC_TIMEOUT_MS;
  const signal = options?.signal;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    // eslint-disable-next-line prefer-const
    let unsubscribe: (() => void) | undefined;
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
      if (abortHandler && signal) {
        signal.removeEventListener("abort", abortHandler);
      }
      action();
    };

    unsubscribe = reactorClient.subscribe({ ids: [documentId] }, (event) => {
      if (event.type === DocumentChangeType.Created) {
        settle(() => resolve());
      }
    });

    reactorClient
      .find({ ids: [documentId] })
      .then((existing) => {
        if (existing.results.length > 0) {
          settle(() => resolve());
        }
      })
      .catch(() => {
        // Ignore: the subscription will still resolve if the document arrives.
      });

    if (signal) {
      if (signal.aborted) {
        settle(() => reject(new DOMException("Aborted", "AbortError")));
        return;
      }
      abortHandler = () => {
        settle(() => reject(new DOMException("Aborted", "AbortError")));
      };
      signal.addEventListener("abort", abortHandler);
    }

    timer = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for document ${documentId}`,
          ),
        ),
      );
    }, timeoutMs);
  });
}

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
  const collectionId = DriveCollectionId.forDrive(resolvedDriveId);

  const inFlight = inFlightRemoteRegistrations.get(collectionId.key);
  try {
    if (inFlight) {
      await inFlight;
    } else {
      const existingRemote = sync
        .list()
        .find((remote) => remote.collectionId.equals(collectionId));

      if (!existingRemote) {
        const remoteName = crypto.randomUUID();
        const registration = sync
          .add(
            remoteName,
            collectionId,
            {
              type: "gql",
              parameters: {
                url: driveInfo.graphqlEndpoint,
              },
            },
            undefined,
            options?.pollBehavior
              ? { pollBehavior: options.pollBehavior }
              : undefined,
          )
          .finally(() => inFlightRemoteRegistrations.delete(collectionId.key));
        inFlightRemoteRegistrations.set(collectionId.key, registration);
        await registration;
      }
    }
  } catch (error) {
    // Any drive add that fails because the caller isn't authorized (the
    // switchboard rejected it — Forbidden/Unauthorized) prompts a login,
    // regardless of which flow triggered the add. Re-throw so callers still
    // see the failure.
    if (isDriveAuthError(error)) {
      showPHModal({ type: "driveAuthRequired" });
    }
    throw error;
  }

  if (options?.awaitInitialSync) {
    await waitForDocumentReady(reactorClient, resolvedDriveId, {
      timeoutMs: options.initialSyncTimeoutMs,
      signal: options.signal,
    });
  }

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
    const collectionId = DriveCollectionId.forDrive(driveId);
    const remotes = sync
      .list()
      .filter((remote) => remote.collectionId.equals(collectionId));
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

export async function setDriveMetadata(
  driveId: string,
  metadata: { name?: string | null; icon?: string | null },
): Promise<PHDocument | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to update drive metadata");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const actions: Array<
    | ReturnType<typeof createSetDriveNameAction>
    | ReturnType<typeof createSetDriveIconAction>
  > = [];
  if (metadata.name) {
    actions.push(createSetDriveNameAction({ name: metadata.name }));
  }
  if (metadata.icon !== undefined && metadata.icon !== null) {
    actions.push(createSetDriveIconAction({ icon: metadata.icon }));
  }
  if (actions.length === 0) {
    return undefined;
  }

  return await reactorClient.execute(driveId, "main", actions);
}
