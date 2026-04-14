import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  ConflictResolution,
  DocumentTypeIcon,
  FileUploadProgressCallback,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  addFolder as baseAddFolder,
  copyNode as baseCopyNode,
  deleteNode as baseDeleteNode,
  updateFile as baseUpdateFile,
  generateNodesCopy,
  handleTargetNameCollisions,
  isFileNode,
  isFolderNode,
  updateNode,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  DocumentOperations,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  baseLoadFromInput,
  baseSaveToFileHandle,
  createPresignedHeader,
  createZip,
  documentModelDocumentType,
  generateId,
  replayDocument,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import {
  DocumentModelNotFoundError,
  UnsupportedDocumentTypeError,
} from "../errors.js";
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
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    return { isDuplicate: false };
  }

  // Get the drive and check its nodes
  let drive;
  try {
    drive = await reactorClient.get<DocumentDriveDocument>(driveId);
  } catch {
    return { isDuplicate: false };
  }

  // Case 1: Check for duplicate by ID
  const nodeById = drive.state.global.nodes.find(
    (node: { id: string }) => node.id === document.header.id,
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
    (node: Node) =>
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

async function getDocumentExtension(document: PHDocument): Promise<string> {
  const documentType = document.header.documentType;

  let rawExtension: string | undefined;

  if (documentType === documentModelDocumentType) {
    const globalState = (document.state as { global?: { extension?: string } })
      .global;
    rawExtension = globalState?.extension;
  } else {
    const reactorClient = window.ph?.reactorClient;
    if (reactorClient) {
      const { results: documentModelModules } =
        await reactorClient.getDocumentModelModules();
      const module = documentModelModules.find(
        (m: DocumentModelModule) => m.documentModel.global.id === documentType,
      );
      rawExtension = module?.utils.fileExtension;
    }
  }

  return (rawExtension ?? "").replace(/^\.+|\.+$/g, "");
}

const BASE_STATE_KEYS = new Set(["auth", "document"]);

/**
 * Fetches all operations for a document using cursor-based pagination.
 * The reactor client handles multi-scope cursors transparently via
 * composite cursors, so all scopes are fetched in a single paginated stream.
 */
export async function fetchDocumentOperations(
  reactorClient: IReactorClient,
  document: PHDocument,
  pageSize = 100,
): Promise<DocumentOperations> {
  const scopes = Object.keys(document.state).filter(
    (k) => !BASE_STATE_KEYS.has(k),
  );
  const operations: DocumentOperations = {};
  for (const scope of scopes) {
    operations[scope] = [];
  }

  let cursor = "";

  do {
    const page = await reactorClient.getOperations(
      document.header.id,
      { scopes },
      undefined,
      { cursor, limit: pageSize },
    );

    for (const op of page.results) {
      const scope = op.action.scope ?? "global";
      if (operations[scope]) {
        operations[scope].push(op);
      }
    }

    cursor = page.nextCursor ?? "";
  } while (cursor);

  return operations;
}

export async function exportFile(document: PHDocument, suggestedName?: string) {
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Fetch operations page-by-page (document from reactor has operations: {})
  const operations = await fetchDocumentOperations(reactorClient, document);
  const documentWithOps = { ...document, operations };

  // Get the extension from the document model module
  const extension = await getDocumentExtension(documentWithOps);

  const baseName = suggestedName || documentWithOps.header.name || "Untitled";
  const name = extension ? `${baseName}.${extension}.phd` : `${baseName}.phd`;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!window.showSaveFilePicker) {
    return downloadFile(documentWithOps, name);
  }
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: name,
    });

    await baseSaveToFileHandle(documentWithOps, fileHandle);
    return fileHandle;
  } catch (e) {
    // ignores error if user cancelled the file picker
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      throw e;
    }
  }
}

export async function loadFile(path: string | File) {
  const baseDocument = await baseLoadFromInput(
    path,
    (state: PHDocument) => state,
    { checkHashes: true },
  );

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  const { results: documentModelModules } =
    await reactorClient.getDocumentModelModules();
  const documentModelModule = documentModelModules.find(
    (module) =>
      module.documentModel.global.id === baseDocument.header.documentType,
  );
  if (!documentModelModule) {
    throw new DocumentModelNotFoundError(baseDocument.header.documentType);
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
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // get the module
  const documentModelModule =
    await reactorClient.getDocumentModelModule(documentType);

  // create - use passed document's state if available
  const newDocument = document ?? documentModelModule.utils.createDocument();
  newDocument.header.name = name;
  if (preferredEditor) {
    newDocument.header.meta = {
      ...newDocument.header.meta,
      preferredEditor,
    };
  }

  // Create document using ReactorClient
  let newDoc: PHDocument;
  try {
    newDoc = await reactorClient.createDocumentInDrive(
      driveId,
      newDocument,
      parentFolder,
    );
  } catch (e) {
    logger.error("Error adding document", e);
    throw new Error("There was an error adding document");
  }

  // Return a file node structure for compatibility
  return {
    id: newDoc.header.id,
    name: newDoc.header.name,
    documentType,
    parentFolder: parentFolder ?? null,
    kind: "file" as const,
  };
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

  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create files");
  }

  const document = await loadFile(file);

  let duplicateId = false;

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  try {
    await reactorClient.get(document.header.id);
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

  await addDocument(
    driveId,
    name || document.header.name,
    document.header.documentType,
    parentFolder,
    initialDocument,
    documentId,
    document.header.meta?.preferredEditor,
  );

  // then add all the operations in chunks
  await uploadOperations(documentId, document.operations, queueOperations);
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
  const reactor = window.ph?.reactorClient;
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
    let document: PHDocument;
    try {
      document = await loadFile(file);
    } catch (loadError) {
      // Only attempt discovery if the failure is specifically a missing
      // document model module, not for other errors like corrupt files.
      const discoveryService = window.ph?.packageDiscoveryService;
      if (discoveryService && DocumentModelNotFoundError.isError(loadError)) {
        // Trigger discovery and retry without blocking the drop handler
        void retryAfterDiscovery(
          discoveryService,
          loadError.documentType,
          file,
          driveId,
          name,
          parentFolder,
          onProgress,
          documentTypes,
          resolveConflict,
        );
        return;
      }
      throw loadError;
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

    // ensure we have the module + can load it (throws if not found)
    await reactor.getDocumentModelModule(document.header.documentType);

    // Initializing stage (10-20%)
    onProgress?.({ stage: "initializing", progress: 10 });

    let duplicateId = false;
    try {
      await reactor.get(document.header.id);
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

    const doc = await reactor.get(documentId);
    console.log("Document created, starting upload of operations");
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

    onProgress?.({ stage: "complete", progress: 100, fileNode });

    return fileNode;
  } catch (error) {
    // Don't override unsupported-document-type status
    if (!UnsupportedDocumentTypeError.isError(error)) {
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

async function retryAfterDiscovery(
  discoveryService: NonNullable<typeof window.ph>["packageDiscoveryService"],
  documentType: string,
  file: string | File,
  driveId: string,
  name?: string,
  parentFolder?: string,
  onProgress?: FileUploadProgressCallback,
  documentTypes?: string[],
  resolveConflict?: ConflictResolution,
): Promise<void> {
  if (!discoveryService) return;
  try {
    await discoveryService.load(documentType);
  } catch {
    onProgress?.({
      stage: "unsupported-document-type",
      progress: 100,
      error: `Document type ${documentType} is not supported`,
    });
    return;
  }
  await addFileWithProgress(
    file,
    driveId,
    name,
    parentFolder,
    onProgress,
    documentTypes,
    resolveConflict,
  );
}

export async function updateFile(
  driveId: string,
  nodeId: string,
  documentType?: string,
  name?: string,
  parentFolder?: string,
) {
  const reactor = window.ph?.reactorClient;
  if (!reactor) {
    return;
  }
  const { isAllowedToCreateDocuments } = getUserPermissions();

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to update files");
  }
  const drive = await reactor.get<DocumentDriveDocument>(driveId);
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
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create folders");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Get the drive document and add folder action
  const drive = await reactorClient.get<DocumentDriveDocument>(driveId);
  const folderId = generateId();
  const updatedDrive = await reactorClient.execute<DocumentDriveDocument>(
    driveId,
    "main",
    [
      baseAddFolder({
        id: folderId,
        name,
        parentFolder,
      }),
    ],
  );

  const node = updatedDrive.state.global.nodes.find(
    (node) => node.id === folderId,
  );
  if (!node || !isFolderNode(node)) {
    throw new Error("There was an error adding folder");
  }
  return node;
}

export async function deleteNode(driveId: string, nodeId: string) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to delete documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // delete the node in the drive document
  await reactorClient.execute(driveId, "main", [
    baseDeleteNode({ id: nodeId }),
  ]);

  // now delete the document
  await reactorClient.deleteDocument(nodeId);
}

export async function renameNode(
  driveId: string,
  nodeId: string,
  name: string,
): Promise<Node | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Rename the node in the drive document using updateNode action
  const drive = await reactorClient.execute<DocumentDriveDocument>(
    driveId,
    "main",
    [updateNode({ id: nodeId, name })],
  );

  const node = drive.state.global.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error("There was an error renaming node");
  }
  return node;
}

export async function renameDriveNode(
  driveId: string,
  nodeId: string,
  name: string,
): Promise<Node | undefined> {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to rename documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  await reactorClient.execute(driveId, "main", [
    updateNode({ id: nodeId, name }),
  ]);

  const drive = await reactorClient.get<DocumentDriveDocument>(driveId);
  return drive.state.global.nodes.find((n: Node) => n.id === nodeId);
}

export async function moveNode(
  driveId: string,
  src: Node,
  target: Node | undefined,
) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to move documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Get current parent folder from source node
  const sourceParent = src.parentFolder ?? driveId;
  const targetParent = target?.id ?? driveId;

  return await reactorClient.moveChildren(sourceParent, targetParent, [src.id]);
}

async function _duplicateDocument(
  reactor: IReactorClient,
  document: PHDocument,
  newId = generateId(),
) {
  const documentModule = await reactor.getDocumentModelModule(
    document.header.documentType,
  );

  return replayDocument(
    document.initialState,
    document.operations,
    documentModule.reducer,
    createPresignedHeader(newId, document.header.documentType),
  );
}

export async function copyNode(
  driveId: string,
  src: Node,
  target: Node | undefined,
) {
  const reactor = window.ph?.reactorClient;
  if (!reactor) {
    return;
  }
  const { isAllowedToCreateDocuments } = getUserPermissions();

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to copy documents");
  }

  const drive = await reactor.get<DocumentDriveDocument>(driveId);

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
      const document = await reactor.get(fileNodeToCopy.srcId);

      const duplicatedDocument = await _duplicateDocument(
        reactor,
        document,
        fileNodeToCopy.targetId,
      );

      // Set the header name to match the collision-resolved node name
      const resolvedName = resolvedNamesMap.get(fileNodeToCopy.targetId);
      if (resolvedName) {
        duplicatedDocument.header.name = resolvedName;
      }

      await reactor.createDocumentInDrive(
        driveId,
        duplicatedDocument,
        target?.id,
      );
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
