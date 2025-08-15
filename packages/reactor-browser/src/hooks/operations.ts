import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type DriveInput,
  type GetDocumentOptions,
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
  documentDriveReducer,
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
  type DocumentModelModule,
  type Operation,
  type PHDocument,
  type Reducer,
  baseLoadFromInput,
  baseSaveToFileHandle,
  buildSignedAction,
  createPresignedHeader,
  createZip,
  generateId,
} from "document-model";
import { useSign } from "./crypto.js";
import { useDocumentModelModuleById } from "./vetra-packages.js";

export function useDispatchDocumentActionsOrOperations(
  document: PHDocument | undefined,
) {
  const documentId = document?.header.id;
  const documentType = document?.header.documentType;
  const documentModelModule = useDocumentModelModuleById(documentType);
  const sign = useSign();
  async function makeSignedActionWithContext(
    actionOrOperation: Action | Operation,
  ) {
    if (!documentModelModule) {
      logger.error(`Document model '${documentType}' not found`);
      return;
    }
    if (!sign) {
      logger.error("No sign function found");
      return;
    }
    if (!document) {
      logger.error("No document found");
      return;
    }
    const unsafeSignedActionOrOperationCastAsAction =
      (await signOperationOrAction(
        actionOrOperation,
        document,
        documentModelModule.reducer,
      )) as Action;

    const signedActionWithContext = addActionContext(
      unsafeSignedActionOrOperationCastAsAction,
    );

    return signedActionWithContext;
  }

  async function makeSignedActionsWithContext(
    actionsOrOperations: Action[] | Operation[],
  ) {
    const signedActionsWithContext = await Promise.all(
      actionsOrOperations.map(makeSignedActionWithContext),
    );
    return signedActionsWithContext.filter((a) => a !== undefined);
  }

  return async function dispatchDocumentActionsOrOperations(
    actionsOrOperations: Action[] | Operation[],
  ) {
    if (!documentId) return;

    const unsafeSignedActionsOrOperationsWithContextCastAsOperations =
      (await makeSignedActionsWithContext(actionsOrOperations)) as Operation[];
    const result = await addDocumentOperations(
      document.header.id,
      unsafeSignedActionsOrOperationsWithContextCastAsOperations,
    );
    return result;
  };
}

function assertIsDocumentDriveDocument(
  document: PHDocument | undefined,
): asserts document is DocumentDriveDocument {
  if (document?.header.documentType !== "document-drive") {
    throw new Error("Document is not a document-drive document");
  }
}

export function useDispatchDriveActionOrOperation(
  document: PHDocument | undefined,
) {
  const sign = useSign();
  assertIsDocumentDriveDocument(document);
  async function makeSignedActionWithContext(
    actionOrOperation: Action | Operation,
  ) {
    if (!sign) {
      logger.error("No sign function found");
      return;
    }
    if (!document) {
      logger.error("No document found");
      return;
    }
    const unsafeSignedActionOrOperationCastAsAction =
      (await signOperationOrAction(
        actionOrOperation,
        document,
        documentDriveReducer,
      )) as Action;

    const signedActionWithContext = addActionContext(
      unsafeSignedActionOrOperationCastAsAction,
    );

    return signedActionWithContext;
  }

  return async function dispatchDriveActionOrOperation(
    actionOrOperation: Action | Operation,
  ) {
    const unsafeSignedActionOrOperationCastAsDriveAction =
      (await makeSignedActionWithContext(
        actionOrOperation,
      )) as DocumentDriveAction;
    const result = await addDriveAction(
      document.header.id,
      unsafeSignedActionOrOperationCastAsDriveAction,
    );
    return result;
  };
}

export async function signOperationOrAction(
  operationOrAction: Operation | Action,
  document: PHDocument,
  reducer?: Reducer<any>,
) {
  const user = window.user;
  const connectCrypto = window.connectCrypto;
  const action =
    "action" in operationOrAction
      ? operationOrAction.action
      : operationOrAction;
  if (!user || !connectCrypto) return operationOrAction;
  if (!action.context?.signer) return operationOrAction;
  if (!reducer) {
    logger.error(
      `Document model '${document.header.documentType}' does not have a reducer`,
    );
    return operationOrAction;
  }

  const context: ActionSigner = action.context.signer;

  const signedOperation = await buildSignedAction(
    action,
    reducer,
    document,
    context,
    connectCrypto.sign,
  );

  return signedOperation;
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

export async function uploadDocumentOperations(
  documentId: string,
  document: PHDocument,
  pushOperations: (
    id: string,
    operations: Operation[],
  ) => Promise<PHDocument | undefined>,
  options?: { waitForSync?: boolean; operationsLimit?: number },
) {
  const operationsLimit = options?.operationsLimit || 50;

  logger.verbose(
    `uploadDocumentOperations(documentId:${documentId}, ops: ${Object.keys(document.operations).join(",")}, limit:${operationsLimit})`,
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

      await pushOperations(documentId, chunk);

      logger.verbose(
        `uploadDocumentOperations:for:waitForUpdate(${documentId}:${scope} rev ${operation.index}): NEXT`,
      );
    }
  }

  logger.verbose(
    `uploadDocumentOperations:for:waitForUpdate(${documentId}): END`,
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

export async function exportFile(
  document: PHDocument,
  documentModelModule: DocumentModelModule | undefined,
) {
  if (!documentModelModule) {
    throw new Error(
      `Document model not specified: ${document.header.documentType}`,
    );
  }

  const extension = documentModelModule.documentModel.extension;

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

export async function loadFile(
  path: string | File,
  documentModelModules: DocumentModelModule[],
) {
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

export async function addDriveAction(
  driveId: string,
  action: DocumentDriveAction,
) {
  const reactor = window.reactor;
  const did = window.did;
  const user = window.user;
  const connectCrypto = window.connectCrypto;
  if (!reactor) {
    return;
  }

  const oldDrive = await reactor.getDrive(driveId);
  // TODO: the type for reactor.getDrive says it cannot fail, so why do we need this?
  if (!oldDrive) {
    return;
  }

  const driveCopy = { ...oldDrive };

  const newDrive = documentDriveReducer(oldDrive, addActionContext(action));
  const scope = action.scope;
  const operations = newDrive.operations[scope];
  const operation = operations.findLast((op) => op.type === action.type);
  if (!operation) {
    throw new Error("There was an error applying the operation");
  }

  if (!connectCrypto) {
    throw new Error("Connect crypto is not loaded");
  }

  // sign operation
  const unsafeCastOfOperationOrActionToOperation = (await signOperationOrAction(
    operation,
    driveCopy,
    documentDriveReducer,
  )) as Operation;

  try {
    const result = await reactor.queueOperation(
      driveId,
      unsafeCastOfOperationOrActionToOperation,
    );

    if (result.status !== "SUCCESS") {
      logger.error(result.error);
    }

    // TODO: add validation
    // this type is a lie
    return result.document as DocumentDriveDocument;
  } catch (error) {
    logger.error(error);
    return oldDrive;
  }
}

export async function addDocumentOperations(
  documentId: string,
  operationsToAdd: Operation[],
) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const document = await reactor.getDocument(documentId);
  const newOperations = deduplicateOperations(
    document.operations,
    operationsToAdd,
  );
  const result = await reactor.queueOperations(documentId, newOperations);
  if (result.status !== "SUCCESS") {
    logger.error(result.error);
  }
  return result.document;
}

export async function openFile(id: string, options?: GetDocumentOptions) {
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  const document = await reactor.getDocument(id, options);
  return document;
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

  const newDrive = await addDriveAction(driveId, action);

  const node = newDrive?.state.global.nodes.find(
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
  const reactorDocumentModelModules = reactor.getDocumentModelModules();
  const document = await loadFile(file, reactorDocumentModelModules);

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

  uploadDocumentOperations(fileNode.id, document, addDocumentOperations, {
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
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to update files");
  }
  const drive = await addDriveAction(
    driveId,
    baseUpdateFile({
      id: nodeId,
      name: name || undefined,
      parentFolder,
      documentType,
    }),
  );

  const node = drive?.state.global.nodes.find((node) => node.id === nodeId);
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
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create folders");
  }
  const folderId = generateId();
  const drive = await addDriveAction(
    driveId,
    baseAddFolder({
      id: folderId,
      name,
      parentFolder,
    }),
  );

  const node = drive?.state.global.nodes.find((node) => node.id === folderId);
  if (!node || !isFolderNode(node)) {
    throw new Error("There was an error adding folder");
  }
  return node;
}

export async function deleteNode(driveId: string, nodeId: string) {
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to delete documents");
  }
  await addDriveAction(
    driveId,
    baseDeleteNode({
      id: nodeId,
    }),
  );
}

export async function renameNode(
  driveId: string,
  nodeId: string,
  name: string,
): Promise<Node | undefined> {
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename documents");
  }
  const drive = await addDriveAction(
    driveId,
    updateNode({
      id: nodeId,
      name,
    }),
  );

  const node = drive?.state.global.nodes.find((node) => node.id === nodeId);
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

  await addDriveAction(
    driveForNode.header.id,
    baseMoveNode({
      srcFolder: src.id,
      targetParentFolder: target?.id,
    }),
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
  const isAllowedToCreateDocuments =
    window.userPermissions?.isAllowedToCreateDocuments;

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename drives");
  }
  const renamedDrive = await addDriveAction(driveId, setDriveName({ name }));
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
  const updatedDrive = await addDriveAction(
    driveId,
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
  const updatedDrive = await addDriveAction(
    driveId,
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
  const drive = await addDriveAction(driveId, baseRemoveTrigger({ triggerId }));

  const trigger = drive?.state.local.triggers.find(
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
  const drive = await addDriveAction(driveId, baseAddTrigger({ trigger }));

  const newTrigger = drive?.state.local.triggers.find(
    (trigger) => trigger.id === trigger.id,
  );

  if (!newTrigger) {
    throw new Error(`There was an error adding the trigger ${trigger.id}`);
  }
}
