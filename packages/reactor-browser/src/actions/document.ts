import {
  type DocumentDriveDocument,
  type Node,
  addFile as baseAddFile,
  addFolder as baseAddFolder,
  copyNode as baseCopyNode,
  deleteNode as baseDeleteNode,
  moveNode as baseMoveNode,
  updateFile as baseUpdateFile,
  generateNodesCopy,
  isFileNode,
  isFolderNode,
  logger,
  updateNode,
} from "document-drive";
import {
  type PHDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  createPresignedHeader,
  createZip,
  generateId,
} from "document-model";
import {
  queueActions,
  queueOperations,
  uploadOperations,
} from "../actions/queue.js";
import { getUserPermissions } from "../utils/user.js";

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

  const { isAllowedToCreateDocuments } = getUserPermissions();

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

  const { isAllowedToCreateDocuments } = getUserPermissions();

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
  const { isAllowedToCreateDocuments } = getUserPermissions();

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
  const { isAllowedToCreateDocuments } = getUserPermissions();

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
  const { isAllowedToCreateDocuments } = getUserPermissions();

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
  const { isAllowedToCreateDocuments } = getUserPermissions();

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
  const { isAllowedToCreateDocuments } = getUserPermissions();

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
  const { isAllowedToCreateDocuments } = getUserPermissions();

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
