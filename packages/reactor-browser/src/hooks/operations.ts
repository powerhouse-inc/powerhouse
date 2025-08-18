import {
  type DocumentDriveDocument,
  type DriveInput,
  type Listener,
  type Node,
  PullResponderTransmitter,
  type PullResponderTrigger,
  type RemoteDriveOptions,
  type SharingType,
  type SyncStatus,
  SynchronizationUnitNotFoundError,
  type Trigger,
  addFile as baseAddFile,
  addFolder as baseAddFolder,
  addTrigger as baseAddTrigger,
  copyNode as baseCopyNode,
  deleteNode as baseDeleteNode,
  moveNode as baseMoveNode,
  removeTrigger as baseRemoveTrigger,
  updateFile as baseUpdateFile,
  createDriveState,
  generateNodesCopy,
  isFileNode,
  isFolderNode,
  logger,
  setAvailableOffline,
  setDriveName,
  setSharingType,
  updateNode,
} from "document-drive";
import {
  type Action,
  type ActionSigner,
  type Operation,
  type PHDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  buildSignedAction,
  createPresignedHeader,
  createZip,
  generateId,
} from "document-model";
import { useState } from "react";

export async function signAction(action: Action, document: PHDocument) {
  const reactor = window.reactor;
  if (!reactor) return action;

  const documentModelModules = reactor.getDocumentModelModules();
  const documentModelModule = documentModelModules.find(
    (module) => module.documentModel.id === document.header.documentType,
  );
  if (!documentModelModule) {
    logger.error(`Document model '${document.header.documentType}' not found`);
    return action;
  }
  const reducer = documentModelModule.reducer;
  const user = window.user;
  const connectCrypto = window.connectCrypto;
  if (!user || !connectCrypto) return action;
  if (!action.context?.signer) return action;

  const actionSigner = action.context.signer;
  const unsafeSignedAction = await buildSignedAction(
    action,
    reducer,
    document,
    actionSigner,
    connectCrypto.sign,
  );

  return unsafeSignedAction as Action;
}

export function addActionContext(action: Action) {
  const user = window.user;
  const connectDid = window.did;
  if (!user) return action;

  const signer: ActionSigner = {
    app: {
      name: "Connect",
      key: connectDid || "",
    },
    user: {
      address: user.address,
      networkId: user.networkId,
      chainId: user.chainId,
    },
    signatures: [],
  };

  return {
    context: { signer },
    ...action,
  };
}

async function makeSignedActionWithContext(
  action: Action | undefined,
  document: PHDocument | undefined,
) {
  if (!action) {
    logger.error("No action found");
    return;
  }
  if (!document) {
    logger.error("No document found");
    return;
  }
  const signedAction = await signAction(action, document);
  const signedActionWithContext = addActionContext(signedAction);
  return signedActionWithContext;
}

async function makeSignedActionsWithContext(
  actionOrActions: Action[] | Action | undefined,
  document: PHDocument | undefined,
) {
  if (!actionOrActions) {
    logger.error("No actions found");
    return;
  }
  const actions = Array.isArray(actionOrActions)
    ? actionOrActions
    : [actionOrActions];

  const signedActionsWithContext = await Promise.all(
    actions.map((action) => makeSignedActionWithContext(action, document)),
  );
  return signedActionsWithContext.filter((a) => a !== undefined);
}

export async function queueActions(
  document: PHDocument | undefined,
  actionOrActions: Action[] | Action | undefined,
) {
  if (!actionOrActions) {
    logger.error("No actions found");
    return;
  }
  const actions = Array.isArray(actionOrActions)
    ? actionOrActions
    : [actionOrActions];

  if (actions.length === 0) {
    logger.error("No actions found");
    return;
  }
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  if (!document) {
    logger.error("No document found");
    return;
  }

  const result = await reactor.queueActions(document.header.id, actions);
  if (result.status !== "SUCCESS") {
    logger.error(result.error);
  }
  return result.document;
}

async function dispatchActions(
  actionOrActions: Action[] | Action | undefined,
  document: PHDocument | undefined,
) {
  const signedActionsWithContext = await makeSignedActionsWithContext(
    actionOrActions,
    document,
  );
  if (!signedActionsWithContext) {
    logger.error("No signed actions with context found");
    return;
  }
  const result = await queueActions(document, signedActionsWithContext);
  return result;
}

export function useDispatch(initialDocument: PHDocument | undefined) {
  const [document, setDocument] = useState(initialDocument);

  function dispatch(actionOrActions: Action[] | Action | undefined) {
    dispatchActions(actionOrActions, document)
      .then((result) => {
        setDocument(result);
      })
      .catch(logger.error);
  }
  return [document, dispatch] as const;
}

export async function uploadOperations(
  document: PHDocument | undefined,
  pushOperations: (
    document: PHDocument,
    operations: Operation[],
  ) => Promise<PHDocument | undefined>,
  options?: { waitForSync?: boolean; operationsLimit?: number },
) {
  if (!document) {
    logger.error("No document found");
    return;
  }
  const operationsLimit = options?.operationsLimit || 50;

  logger.verbose(
    `uploadDocumentOperations(documentId:${document.header.id}, ops: ${Object.keys(document.operations).join(",")}, limit:${operationsLimit})`,
  );

  for (const operations of Object.values(document.operations)) {
    for (let i = 0; i < operations.length; i += operationsLimit) {
      logger.verbose(
        `uploadDocumentOperations:for(i:${i}, ops:${operations.length}, limit:${operationsLimit}): START`,
      );
      const chunk = operations.slice(i, i + operationsLimit);
      const operation = chunk.at(-1);
      if (!operation) {
        break;
      }
      const { scope } = operation;

      /*
          TODO: check why the waitForUpdate promise does not resolve after the first iteration
          if (options?.waitForSync) {
              void pushOperations(drive, documentId, chunk);
              await waitForUpdate(
                  10000,
                  documentId,
                  scope,
                  operation.index,
                  reactor,
              );
          } else {
              await pushOperations(drive, documentId, chunk);
          }
          */

      await pushOperations(document, chunk);

      logger.verbose(
        `uploadDocumentOperations:for:waitForUpdate(${document.header.id}:${scope} rev ${operation.index}): NEXT`,
      );
    }
  }

  logger.verbose(
    `uploadDocumentOperations:for:waitForUpdate(${document.header.id}): END`,
  );
}

export function downloadFile(document: PHDocument) {
  const zip = createZip(document);
  zip
    .generateAsync({ type: "blob" })
    .then((blob) => {
      const link = window.document.createElement("a");
      link.style.display = "none";
      link.href = URL.createObjectURL(blob);
      link.download = `${document.header.name || "Untitled"}.zip`;

      window.document.body.appendChild(link);
      link.click();

      window.document.body.removeChild(link);
    })
    .catch(logger.error);
}

export async function exportFile(document: PHDocument) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const documentModelModules = reactor.getDocumentModelModules();
  const documentModelModule = documentModelModules.find(
    (module) => module.documentModel.id === document.header.documentType,
  );
  const extension = documentModelModule?.documentModel.extension;

  // Fallback for browsers that don't support showSaveFilePicker
  // @ts-expect-error - showSaveFilePicker is not defined in the type
  if (!window.showSaveFilePicker) {
    downloadFile(document);
    return;
  }
  try {
    // @ts-expect-error - showSaveFilePicker is not defined in the type
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const fileHandle = await window.showSaveFilePicker({
      // @ts-expect-error - Document model should know that name can be defined in global state
      suggestedName: `${document.name || document.state.global?.name || "Untitled"}.${
        extension ? `${extension}.` : ""
      }zip`,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await baseSaveToFileHandle(document, fileHandle);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const path = (await fileHandle.getFile()).path;
    if (typeof window !== "undefined") {
      /* eslint-disable */
      // @ts-expect-error - electronAPI is not defined in the type
      window.electronAPI?.fileSaved(document, path);
      /* eslint-enable */
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return path;
  } catch (e) {
    // ignores error if user cancelled the file picker
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      throw e;
    }
  }
}

export async function loadFile(path: string | File) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const documentModelModules = reactor.getDocumentModelModules();
  const baseDocument = await baseLoadFromInput(
    path,
    (state: PHDocument) => state,
    { checkHashes: true },
  );
  const documentModelModule = documentModelModules.find(
    (module) => module.documentModel.id === baseDocument.header.documentType,
  );
  if (!documentModelModule) {
    throw new Error(
      `Document "${baseDocument.header.documentType}" is not supported`,
    );
  }
  return documentModelModule.utils.loadFromInput(path);
}

function deduplicateOperations(
  existingOperations: Record<string, Operation[]>,
  operationsToDeduplicate: Operation[],
) {
  // make a set of all the operation indices for each scope to avoid duplicates
  const operationIndicesByScope = {} as Record<string, Set<number>>;
  for (const scope of Object.keys(existingOperations)) {
    operationIndicesByScope[scope] = new Set(
      existingOperations[scope].map((op) => op.index),
    );
  }

  const newOperations: Operation[] = [];

  for (const operation of operationsToDeduplicate) {
    const scope = operation.scope;
    const index = operation.index;
    if (operationIndicesByScope[scope].has(index)) {
      const duplicatedExistingOperation = existingOperations[scope].find(
        (op) => op.index === index,
      );
      const duplicatedNewOperation = newOperations.find(
        (op) => op.index === index,
      );
      console.warn("skipping duplicate operation");
      if (duplicatedExistingOperation) {
        console.warn(
          "duplicate existing operation",
          duplicatedExistingOperation,
        );
      }
      if (duplicatedNewOperation) {
        console.warn("duplicate new operation", duplicatedNewOperation);
      }
      continue;
    }
    newOperations.push(operation);
    operationIndicesByScope[scope].add(index);
  }

  const uniqueOperationIds = new Set<string>();
  const operationsDedupedById: Operation[] = [];

  for (const [scope, operations] of Object.entries(existingOperations)) {
    for (const operation of operations) {
      const id = operation.id;
      if (!id) {
        console.warn("skipping operation with no id", operation);
        continue;
      }
      if (uniqueOperationIds.has(id)) {
        console.warn(
          "skipping existing operation with duplicate id in scope",
          scope,
          operation,
        );
        continue;
      }
      uniqueOperationIds.add(id);
    }
  }

  for (const operation of newOperations) {
    const id = operation.id;
    if (!id) {
      console.warn("skipping operation with no id", operation);
      continue;
    }
    if (uniqueOperationIds.has(id)) {
      console.warn(
        "skipping new operation with duplicate id in scope",
        operation.scope,
        operation,
      );
      continue;
    }
    uniqueOperationIds.add(id);
    operationsDedupedById.push(operation);
  }
  return operationsDedupedById;
}

export async function queueOperations(
  document: PHDocument | undefined,
  operationOrOperations: Operation[] | Operation | undefined,
) {
  if (!operationOrOperations) {
    logger.error("No operations found");
    return;
  }
  const operations = Array.isArray(operationOrOperations)
    ? operationOrOperations
    : [operationOrOperations];

  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  if (!document) {
    logger.error("No document found");
    return;
  }
  const deduplicatedOperations = deduplicateOperations(
    document.operations,
    operations,
  );
  const result = await reactor.queueOperations(
    document.header.id,
    deduplicatedOperations,
  );
  if (result.status !== "SUCCESS") {
    logger.error(result.error);
  }
  return result.document;
}

export async function addDocument(
  driveId: string,
  name: string,
  documentType: string,
  parentFolder?: string,
  document?: PHDocument,
  id?: string,
  preferredEditor?: string,
) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }

  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create documents");
  }

  const drive = await reactor.getDrive(driveId);
  const documentId = id ?? generateId();
  const reactorDocumentModelModules = reactor.getDocumentModelModules();
  const documentModelModuleFromReactor = reactorDocumentModelModules.find(
    (module) => module.documentModel.id === documentType,
  );
  if (!documentModelModuleFromReactor) {
    throw new Error(`Document model module for type ${documentType} not found`);
  }

  const newDocument = documentModelModuleFromReactor.utils.createDocument({
    ...document,
  });
  newDocument.header = createPresignedHeader(documentId, documentType);
  newDocument.header.name = name;
  const documentMeta = preferredEditor ? { preferredEditor } : undefined;
  await reactor.addDocument(newDocument, documentMeta);

  const action = baseAddFile({
    id: documentId,
    name,
    documentType,
    parentFolder: parentFolder ?? null,
  });

  const unsafeCastAsDrive = (await queueActions(
    drive,
    action,
  )) as DocumentDriveDocument;

  const node = unsafeCastAsDrive.state.global.nodes.find(
    (node) => node.id === documentId,
  );
  if (!node || !isFileNode(node)) {
    throw new Error("There was an error adding document");
  }

  return node;
}

export async function addFile(
  file: string | File,
  driveId: string,
  name?: string,
  parentFolder?: string,
) {
  logger.verbose(
    `addFile(drive: ${driveId}, name: ${name}, folder: ${parentFolder})`,
  );
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }

  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create files");
  }
  const document = await loadFile(file);

  if (!document) {
    throw new Error("No document loaded");
  }

  // first create the file with the initial state of document
  const initialDocument: PHDocument = {
    header: document.header,
    history: document.history,
    initialState: document.initialState,
    state: document.initialState.state,
    operations: {
      global: [],
      local: [],
    },
    clipboard: [],
  };
  const fileNode = await addDocument(
    driveId,
    name || (typeof file === "string" ? document.header.name : file.name),
    document.header.documentType,
    parentFolder,
    initialDocument,
  );

  // TODO: the return type of addDocument says it cannot fail, so why do we need this?
  if (!fileNode) {
    throw new Error("There was an error adding file");
  }

  // then add all the operations
  const driveDocument = await reactor.getDrive(driveId);
  // TODO: the type for reactor.getDrive says it cannot fail, so why do we need this?
  const waitForSync =
    driveDocument && driveDocument.state.local.listeners.length > 0;

  uploadOperations(document, queueOperations, {
    waitForSync,
  }).catch((error) => {
    throw error;
  });
}

export async function updateFile(
  driveId: string,
  nodeId: string,
  documentType?: string,
  name?: string,
  parentFolder?: string,
) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to update files");
  }
  const drive = await reactor.getDrive(driveId);
  const unsafeCastAsDrive = (await queueActions(
    drive,
    baseUpdateFile({
      id: nodeId,
      name: name ?? undefined,
      parentFolder,
      documentType,
    }),
  )) as DocumentDriveDocument;

  const node = unsafeCastAsDrive.state.global.nodes.find(
    (node) => node.id === nodeId,
  );
  if (!node || !isFileNode(node)) {
    throw new Error("There was an error updating document");
  }
  return node;
}

export async function addFolder(
  driveId: string,
  name: string,
  parentFolder?: string,
) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create folders");
  }
  const folderId = generateId();
  const drive = await reactor.getDrive(driveId);
  const unsafeCastAsDrive = (await queueActions(
    drive,
    baseAddFolder({
      id: folderId,
      name,
      parentFolder,
    }),
  )) as DocumentDriveDocument;

  const node = unsafeCastAsDrive.state.global.nodes.find(
    (node) => node.id === folderId,
  );
  if (!node || !isFolderNode(node)) {
    throw new Error("There was an error adding folder");
  }
  return node;
}

export async function deleteNode(driveId: string, nodeId: string) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to delete documents");
  }
  const drive = await reactor.getDrive(driveId);
  await queueActions(drive, baseDeleteNode({ id: nodeId }));
}

export async function renameNode(
  driveId: string,
  nodeId: string,
  name: string,
): Promise<Node | undefined> {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename documents");
  }
  const drive = await reactor.getDrive(driveId);
  const unsafeCastAsDrive = (await queueActions(
    drive,
    updateNode({ id: nodeId, name }),
  )) as DocumentDriveDocument;

  const node = unsafeCastAsDrive.state.global.nodes.find(
    (node) => node.id === nodeId,
  );
  if (!node) {
    throw new Error("There was an error renaming node");
  }
  return node;
}

export async function moveNode(src: Node, target: Node | undefined) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to move documents");
  }
  // TODO: it should not be this much work just to get the drive for a given node
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(driveIds.map((id) => reactor.getDrive(id)));
  const driveForNode = drives.find((drive) =>
    drive.state.global.nodes.some((node) => node.id === src.id),
  );
  // TODO: the type for reactor.getDrive says it cannot fail, so why do we need this?
  if (!driveForNode) {
    throw new Error("Node is not in any drive");
  }

  const drive = await reactor.getDrive(driveForNode.header.id);

  await queueActions(
    drive,
    baseMoveNode({ srcFolder: src.id, targetParentFolder: target?.id }),
  );
}

export async function copyNode(src: Node, target: Node | undefined) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to copy documents");
  }
  // TODO: it should not be this much work just to get the drive for a given node
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(driveIds.map((id) => reactor.getDrive(id)));
  const driveForNode = drives.find((drive) =>
    drive.state.global.nodes.some((node) => node.id === src.id),
  );
  // TODO: the type for reactor.getDrive says it cannot fail, so why do we need this?
  if (!driveForNode) {
    throw new Error("Node is not in any drive");
  }

  const copyNodesInput = generateNodesCopy(
    {
      srcId: src.id,
      targetParentFolder: target?.id,
      targetName: src.name,
    },
    () => generateId(),
    driveForNode.state.global.nodes,
  );

  const copyActions = copyNodesInput.map((copyNodeInput) =>
    baseCopyNode(copyNodeInput),
  );
  // TODO: why does this use addActions instead of queueActions?
  const result = await reactor.addActions(driveForNode.header.id, copyActions);

  if (result.status !== "SUCCESS") {
    logger.error(`Error copying files: ${result.status}`, result.error);
  }

  // TODO: this is a lie
  return result.document as DocumentDriveDocument;
}

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
