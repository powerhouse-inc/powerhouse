import type {
  ConflictResolution,
  DocumentTypeIcon,
  FileUploadProgressCallback,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
  Node,
} from "document-drive";
import {
  addFile as baseAddFile,
  addFolder as baseAddFolder,
  copyNode as baseCopyNode,
  deleteNode as baseDeleteNode,
  moveNode as baseMoveNode,
  updateFile as baseUpdateFile,
  generateNodesCopy,
  handleTargetNameCollisions,
  isFileNode,
  isFolderNode,
  logger,
  updateNode,
} from "document-drive";
import type {
  DocumentModelDocument,
  DocumentOperations,
  PHDocument,
} from "document-model";
import { documentModelDocumentType } from "document-model";
import {
  baseLoadFromInput,
  baseSaveToFileHandle,
  createPresignedHeader,
  createZip,
  generateId,
  replayDocument,
} from "document-model/core";
import { UnsupportedDocumentTypeError } from "../errors.js";
import { isDocumentTypeSupported } from "../utils/documents.js";
import { getUserPermissions } from "../utils/user.js";
import { queueActions, queueOperations, uploadOperations } from "./queue.js";

async function isDocumentInLocation(
  document: PHDocument,
  driveId: string,
  parentFolder?: string,
): Promise<{
  isDuplicate: boolean;
  duplicateType?: "id" | "name";
  nodeId?: string;
}> {
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return { isDuplicate: false };
  }

  try {
    // Get the drive and check its nodes
    const drive = await reactor.getDrive(driveId);

    // Case 1: Check for duplicate by ID
    const nodeById = drive.state.global.nodes.find(
      (node) => node.id === document.header.id,
    );

    if (nodeById && nodeById.parentFolder === (parentFolder ?? null)) {
      return {
        isDuplicate: true,
        duplicateType: "id",
        nodeId: nodeById.id,
      };
    }

    // Case 2: Check for duplicate by name + type in same parent folder
    const nodeByNameAndType = drive.state.global.nodes.find(
      (node) =>
        isFileNode(node) &&
        node.name === document.header.name &&
        node.documentType === document.header.documentType &&
        node.parentFolder === (parentFolder ?? null),
    );

    if (nodeByNameAndType) {
      return {
        isDuplicate: true,
        duplicateType: "name",
        nodeId: nodeByNameAndType.id,
      };
    }

    return { isDuplicate: false };
  } catch {
    // Drive doesn't exist or other error
    return { isDuplicate: false };
  }
}

function getDocumentTypeIcon(
  document: PHDocument,
): DocumentTypeIcon | undefined {
  const documentType = document.header.documentType;

  switch (documentType) {
    case "powerhouse/document-model":
      return "document-model";
    case "powerhouse/app":
      return "app";
    case "powerhouse/document-editor":
      return "editor";
    case "powerhouse/subgraph":
      return "subgraph";
    case "powerhouse/package":
      return "package";
    case "powerhouse/processor": {
      // Check the processor type from global state (safely)
      const globalState = (document.state as { global?: { type?: string } })
        .global;
      const processorType = globalState?.type;

      if (processorType === "analytics") return "analytics-processor";
      if (processorType === "relational") return "relational-processor";
      if (processorType === "codegen") return "codegen-processor";
      return undefined;
    }
    default:
      return undefined;
  }
}

export function downloadFile(document: PHDocument, fileName: string) {
  const zip = createZip(document);
  zip
    .generateAsync({ type: "blob" })
    .then((blob) => {
      const link = window.document.createElement("a");
      link.style.display = "none";
      link.href = URL.createObjectURL(blob);
      link.download = fileName;

      window.document.body.appendChild(link);
      link.click();

      window.document.body.removeChild(link);
    })
    .catch(logger.error);
}

export async function exportFile(document: PHDocument, suggestedName?: string) {
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return;
  }

  let extension = "";

  if (document.header.documentType === documentModelDocumentType) {
    const documentExtension = (document as DocumentModelDocument).state.global
      .extension;
    const cleanExtension = documentExtension.replace(/^\.+|\.+$/g, "");
    extension = cleanExtension !== "" ? `.${cleanExtension}` : "";
  }

  const name = `${suggestedName || document.header.name || "Untitled"}${extension}.phd`;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!window.showSaveFilePicker) {
    return downloadFile(document, name);
  }
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: name,
    });

    await baseSaveToFileHandle(document, fileHandle);
    return fileHandle;
  } catch (e) {
    // ignores error if user cancelled the file picker
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      throw e;
    }
  }
}

export async function loadFile(path: string | File) {
  const reactor = window.ph?.reactor;
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
    (module) =>
      module.documentModel.global.id === baseDocument.header.documentType,
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
  const reactor = window.ph?.reactor;
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
    (module) => module.documentModel.global.id === documentType,
  );
  if (!documentModelModuleFromReactor) {
    throw new Error(`Document model module for type ${documentType} not found`);
  }

  const newDocument = documentModelModuleFromReactor.utils.createDocument({
    ...document?.state,
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
  const reactor = window.ph?.reactor;
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

  const documentModule = reactor
    .getDocumentModelModules()
    .find(
      (module) =>
        module.documentModel.global.id === document.header.documentType,
    );
  if (!documentModule) {
    throw new Error(
      `Document model module for type ${document.header.documentType} not found`,
    );
  }

  let duplicateId = false;
  try {
    await reactor.getDocument(document.header.id);
    duplicateId = true;
  } catch {
    // document id not found
  }

  const documentId = duplicateId ? generateId() : document.header.id;
  const header = createPresignedHeader(
    documentId,
    document.header.documentType,
  );
  header.lastModifiedAtUtcIso = document.header.createdAtUtcIso;
  header.meta = document.header.meta;
  header.name = name || document.header.name;

  // copy the document at it's initial state
  const initialDocument = {
    ...document,
    header,
    state: document.initialState,
    operations: Object.keys(document.operations).reduce((acc, key) => {
      acc[key] = [];
      return acc;
    }, {} as DocumentOperations),
  };

  const fileNode = await addDocument(
    driveId,
    name || document.header.name,
    document.header.documentType,
    parentFolder,
    initialDocument,
    documentId,
    document.header.meta?.preferredEditor,
  );

  if (!fileNode) {
    throw new Error("There was an error adding file");
  }

  // then add all the operations in chunks
  uploadOperations(documentId, document.operations, queueOperations).catch(
    (error) => {
      throw error;
    },
  );
}

export async function addFileWithProgress(
  file: string | File,
  driveId: string,
  name?: string,
  parentFolder?: string,
  onProgress?: FileUploadProgressCallback,
  documentTypes?: string[],
  resolveConflict?: ConflictResolution,
) {
  logger.verbose(
    `addFileWithProgress(drive: ${driveId}, name: ${name}, folder: ${parentFolder})`,
  );
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return;
  }

  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create files");
  }

  // Loading stage (0-10%)
  try {
    onProgress?.({ stage: "loading", progress: 0 });

    const document = await loadFile(file);
    if (!document) {
      throw new Error("No document loaded");
    }

    // Check for duplicate in same location
    const duplicateCheck = await isDocumentInLocation(
      document,
      driveId,
      parentFolder,
    );

    if (duplicateCheck.isDuplicate && !resolveConflict) {
      // Report conflict and return early
      onProgress?.({
        stage: "conflict",
        progress: 0,
        duplicateType: duplicateCheck.duplicateType,
      });
      return undefined;
    }

    // Handle replace resolution by deleting the existing document
    if (
      duplicateCheck.isDuplicate &&
      resolveConflict === "replace" &&
      duplicateCheck.nodeId
    ) {
      await deleteNode(driveId, duplicateCheck.nodeId);
    }
    // For "duplicate" resolution, we continue normally which creates a new document
    // with a different ID (the default behavior)

    // Send documentType info immediately after loading
    const documentType = getDocumentTypeIcon(document);
    if (documentType) {
      onProgress?.({ stage: "loading", progress: 10, documentType });
    } else {
      onProgress?.({ stage: "loading", progress: 10 });
    }

    if (!isDocumentTypeSupported(document.header.documentType, documentTypes)) {
      onProgress?.({
        stage: "unsupported-document-type",
        progress: 100,
        error: `Document type ${document.header.documentType} is not supported`,
      });
      throw new UnsupportedDocumentTypeError(document.header.documentType);
    }

    const documentModule = reactor
      .getDocumentModelModules()
      .find(
        (module) =>
          module.documentModel.global.id === document.header.documentType,
      );
    if (!documentModule) {
      throw new Error(
        `Document model module for type ${document.header.documentType} not found`,
      );
    }

    // Initializing stage (10-20%)
    onProgress?.({ stage: "initializing", progress: 10 });

    let duplicateId = false;
    try {
      await reactor.getDocument(document.header.id);
      duplicateId = true;
    } catch {
      // document id not found
    }

    const documentId = duplicateId ? generateId() : document.header.id;
    const header = createPresignedHeader(
      documentId,
      document.header.documentType,
    );
    header.lastModifiedAtUtcIso = document.header.createdAtUtcIso;
    header.meta = document.header.meta;
    header.name = name || document.header.name;

    // copy the document at it's initial state
    const initialDocument = {
      ...document,
      header,
      state: document.initialState,
      operations: Object.keys(document.operations).reduce((acc, key) => {
        acc[key] = [];
        return acc;
      }, {} as DocumentOperations),
    };

    const fileNode = await addDocument(
      driveId,
      name || document.header.name,
      document.header.documentType,
      parentFolder,
      initialDocument,
      documentId,
      document.header.meta?.preferredEditor,
    );

    if (!fileNode) {
      throw new Error("There was an error adding file");
    }

    onProgress?.({ stage: "initializing", progress: 20 });

    // Uploading stage (20-100%)
    await uploadOperations(documentId, document.operations, queueOperations, {
      onProgress: (uploadProgress) => {
        if (
          uploadProgress.totalOperations &&
          uploadProgress.uploadedOperations !== undefined
        ) {
          const uploadPercent =
            uploadProgress.totalOperations > 0
              ? uploadProgress.uploadedOperations /
                uploadProgress.totalOperations
              : 0;
          const overallProgress = 20 + Math.round(uploadPercent * 80);
          onProgress?.({
            stage: "uploading",
            progress: overallProgress,
            totalOperations: uploadProgress.totalOperations,
            uploadedOperations: uploadProgress.uploadedOperations,
          });
        }
      },
    });

    onProgress?.({ stage: "complete", progress: 100 });

    return fileNode;
  } catch (error) {
    // Don't override unsupported-document-type status
    if (!(error instanceof UnsupportedDocumentTypeError)) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      onProgress?.({
        stage: "failed",
        progress: 100,
        error: errorMessage,
      });
    }
    throw error;
  }
}

export async function updateFile(
  driveId: string,
  nodeId: string,
  documentType?: string,
  name?: string,
  parentFolder?: string,
) {
  const reactor = window.ph?.reactor;
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
  const reactor = window.ph?.reactor;
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
  const reactor = window.ph?.reactor;
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
  const reactor = window.ph?.reactor;
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

export async function moveNode(
  driveId: string,
  src: Node,
  target: Node | undefined,
) {
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return;
  }
  const { isAllowedToCreateDocuments } = getUserPermissions();

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to move documents");
  }

  const drive = await reactor.getDrive(driveId);

  return await queueActions(
    drive,
    baseMoveNode({ srcFolder: src.id, targetParentFolder: target?.id }),
  );
}

function _duplicateDocument(
  reactor: IDocumentDriveServer,
  document: PHDocument,
  newId = generateId(),
) {
  const documentModule = reactor
    .getDocumentModelModules()
    .find(
      (module) =>
        module.documentModel.global.id === document.header.documentType,
    );
  if (!documentModule) {
    throw new Error(
      `Document model module for type ${document.header.documentType} not found`,
    );
  }

  return replayDocument(
    document.initialState,
    document.operations,
    documentModule.reducer,
    undefined,
    createPresignedHeader(newId, document.header.documentType),
  );
}

export async function copyNode(
  driveId: string,
  src: Node,
  target: Node | undefined,
) {
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return;
  }
  const { isAllowedToCreateDocuments } = getUserPermissions();

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to copy documents");
  }

  const drive = await reactor.getDrive(driveId);

  const copyNodesInput = generateNodesCopy(
    {
      srcId: src.id,
      targetParentFolder: target?.id,
      targetName: src.name,
    },
    () => generateId(),
    drive.state.global.nodes,
  );

  // Pre-calculate collision-resolved names for all nodes to be copied
  const resolvedNamesMap = new Map<string, string>();
  for (const copyNodeInput of copyNodesInput) {
    const node = drive.state.global.nodes.find(
      (n) => n.id === copyNodeInput.srcId,
    );
    if (node) {
      const resolvedName = handleTargetNameCollisions({
        nodes: drive.state.global.nodes,
        srcName: copyNodeInput.targetName || node.name,
        targetParentFolder: copyNodeInput.targetParentFolder || null,
      });
      resolvedNamesMap.set(copyNodeInput.targetId, resolvedName);
    }
  }

  const fileNodesToCopy = copyNodesInput.filter((copyNodeInput) => {
    const node = drive.state.global.nodes.find(
      (node) => node.id === copyNodeInput.srcId,
    );
    return node !== undefined && isFileNode(node);
  });

  for (const fileNodeToCopy of fileNodesToCopy) {
    try {
      const document = await reactor.getDocument(fileNodeToCopy.srcId);

      const duplicatedDocument = _duplicateDocument(
        reactor,
        document,
        fileNodeToCopy.targetId,
      );

      // Set the header name to match the collision-resolved node name
      const resolvedName = resolvedNamesMap.get(fileNodeToCopy.targetId);
      if (resolvedName) {
        duplicatedDocument.header.name = resolvedName;
      }

      await reactor.addDocument(duplicatedDocument);
    } catch (e) {
      logger.error(
        `Error copying document ${fileNodeToCopy.srcId}: ${String(e)}`,
      );
    }
  }

  const copyActions = copyNodesInput.map((copyNodeInput) =>
    baseCopyNode(copyNodeInput),
  );
  return await queueActions(drive, copyActions);
}
