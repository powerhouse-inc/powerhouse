import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  ConflictResolution,
  DocumentTypeIcon,
  FileUploadProgressCallback,
  IReactorBrowserClient,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  addFolder as baseAddFolder,
  copyNode as baseCopyNode,
  moveNode as baseMoveNode,
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
  Operation,
  PHBaseState,
  PHDocument,
  Reducer,
  VersionedReplayConfig,
} from "@powerhousedao/shared/document-model";
import {
  assertAuthPreservedOnDuplicate,
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createPresignedHeader,
  createZip,
  documentModelDocumentType,
  generateId,
  replayDocumentVersioned,
  setName,
  setPreferredEditor,
  UnsupportedDocumentModelVersionError,
  type UpgradeDocumentActionInput,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { conditional, constant, isDefined, isNot, isStrictEqual } from "remeda";
import {
  DocumentModelNotFoundError,
  UnsupportedDocumentTypeError,
} from "../errors.js";
import { showPHModal } from "../hooks/modals.js";
import { isDocumentTypeSupported } from "../utils/documents.js";
import { getUserPermissions } from "../utils/user.js";
import { queueActions, queueOperations, uploadOperations } from "./queue.js";

const NON_DOMAIN_SCOPES = new Set(["auth", "document"]);

/** An unreadable drive cannot be shown to hold no duplicate, so reads throw. */
async function isDocumentInLocation(
  reactorClient: IReactorClient,
  document: PHDocument,
  driveId: string,
  parentFolder?: string,
): Promise<{
  isDuplicate: boolean;
  duplicateType?: "id" | "name";
  nodeId?: string;
}> {
  const drive = await reactorClient.get<DocumentDriveDocument>(driveId);

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

export async function downloadFile(document: PHDocument, fileName: string) {
  try {
    const data = await createZip(document);
    const blob = new Blob([new Uint8Array(data)], { type: "application/zip" });
    const link = window.document.createElement("a");
    link.style.display = "none";
    link.href = URL.createObjectURL(blob);
    link.download = fileName;

    window.document.body.appendChild(link);
    link.click();

    window.document.body.removeChild(link);
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
  }
}

async function getDocumentExtension(document: PHDocument): Promise<string> {
  const documentType = document.header.documentType;

  let rawExtension: string | undefined;

  if (documentType === documentModelDocumentType) {
    const globalState = (document.state as { global?: { extension?: string } })
      .global;
    rawExtension = globalState?.extension;
  } else {
    // document model modules are only available on the full reactor client
    const reactorClient = window.ph?.reactorClientModule?.client;
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

/**
 * Fetches all operations for a document using cursor-based pagination.
 * The reactor client handles multi-scope cursors transparently via
 * composite cursors, so all scopes are fetched in a single paginated stream.
 */
export async function fetchDocumentOperations(
  reactorClient: IReactorBrowserClient,
  document: PHDocument,
  pageSize = 100,
): Promise<DocumentOperations> {
  // includes auth: an export must carry the policy history
  const scopes = Object.keys(document.state);
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

export function extractInitialState(
  documentScopeOps: Operation[],
): PHBaseState {
  const upgradeOp = documentScopeOps.find(
    (op) => op.action.type === "UPGRADE_DOCUMENT",
  );
  if (!upgradeOp) {
    throw new Error(
      "No UPGRADE_DOCUMENT operation found — document is invalid",
    );
  }
  const input = upgradeOp.action.input as {
    initialState?: PHBaseState;
    state?: PHBaseState;
  };
  const initialState = input.initialState ?? input.state;
  if (!initialState) {
    throw new Error(
      "UPGRADE_DOCUMENT operation has no initialState — document is invalid",
    );
  }
  return initialState;
}

export function filterDomainOperations(
  operations: DocumentOperations,
): DocumentOperations {
  return Object.fromEntries(
    Object.entries(operations).filter(
      ([scope]) => !NON_DOMAIN_SCOPES.has(scope),
    ),
  );
}

/** Domain operations to replay, and the version to upgrade to afterwards. */
export interface ImportSegment {
  operations: DocumentOperations;
  /** Absent on the final segment. */
  upgradeTo?: number;
}

function countOperations(operations: DocumentOperations): number {
  let total = 0;
  for (const ops of Object.values(operations)) {
    total += ops?.length ?? 0;
  }
  return total;
}

/**
 * Split an imported document's domain operations at its mid-history upgrade
 * boundaries, so the caller can re-dispatch each upgrade between segments.
 *
 * The seed's CREATE_DOCUMENT and 0 -> N upgrade are replayed by the creation
 * path and must not be repeated. A later upgrade must be: it is where the
 * reducer version changes, and dropping it replays everything after it through
 * the module the document was created with.
 */
export function splitAtUpgradeBoundaries(
  operations: DocumentOperations,
): ImportSegment[] {
  const upgrades = (operations.document ?? [])
    .filter((op) => op.action.type === "UPGRADE_DOCUMENT")
    .filter(
      (op) => (op.action.input as UpgradeDocumentActionInput).fromVersion > 0,
    )
    .sort((a, b) => a.index - b.index);

  const domain = filterDomainOperations(operations);
  if (upgrades.length === 0) {
    return [{ operations: domain }];
  }

  const segments: ImportSegment[] = [];
  const consumed = new Map<string, number>();

  const take = (until: (scope: string, ops: Operation[]) => number) => {
    const slice: DocumentOperations = {};
    for (const [scope, ops] of Object.entries(domain)) {
      if (!ops) continue;
      const from = consumed.get(scope) ?? 0;
      const stop = Math.max(from, until(scope, ops));
      const chunk = ops.slice(from, stop);
      if (chunk.length > 0) slice[scope] = chunk;
      consumed.set(scope, stop);
    }
    return slice;
  };

  for (const upgrade of upgrades) {
    const input = upgrade.action.input as UpgradeDocumentActionInput;
    const slice = take((scope, ops) => boundary(upgrade, scope, ops));
    segments.push({ operations: slice, upgradeTo: input.toVersion });
  }

  const tail = take((_scope, ops) => ops.length);
  if (countOperations(tail) > 0) {
    segments.push({ operations: tail });
  }

  return segments;
}

/**
 * How many of a scope's operations precede an upgrade. Must stay identical to
 * the boundary computation in `replayDocumentVersioned` — snapshots compare
 * against operation indices, not array positions, and the timestamp fallback
 * excludes the upgrade's own instant.
 */
function boundary(upgrade: Operation, scope: string, ops: Operation[]): number {
  const snapshot = (upgrade.action.input as UpgradeDocumentActionInput)
    .revision;

  if (snapshot !== undefined) {
    const revision = snapshot[scope] ?? 0;
    let count = 0;
    for (let i = 0; i < ops.length; i++) {
      if (ops[i].index < revision) count = i + 1;
    }
    return count;
  }

  for (let i = 0; i < ops.length; i++) {
    if (ops[i].timestampUtcMs >= upgrade.timestampUtcMs) {
      return i;
    }
  }
  return ops.length;
}

export async function exportFile(document: PHDocument, suggestedName?: string) {
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Fetch operations page-by-page (document from reactor has operations: {})
  const operations = await fetchDocumentOperations(reactorClient, document);
  const initialState = extractInitialState(operations["document"] ?? []);
  const documentWithOps = { ...document, operations, initialState };

  // Get the extension from the document model module
  const extension = await getDocumentExtension(documentWithOps);

  const baseName = suggestedName || documentWithOps.header.name || "Untitled";
  const name = extension ? `${baseName}.${extension}.phd` : `${baseName}.phd`;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!window.showSaveFilePicker) {
    return await downloadFile(documentWithOps, name);
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

/**
 * Loads a document file and replays it with version-aware reducers from the registry.
 * Falls back to single-version legacy replay when no upgrade manifest is registered for
 * the document type.
 */
export async function loadFile(path: string | File) {
  const baseDocument = await baseLoadFromInput(
    path,
    (state: PHDocument) => state,
    { checkHashes: true },
  );

  // document model modules are only available on the full reactor client
  const reactorClient = window.ph?.reactorClientModule?.client;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const documentType = baseDocument.header.documentType;
  const { results: documentModelModules } =
    await reactorClient.getDocumentModelModules();
  const modulesForType = documentModelModules.filter(
    (module) => module.documentModel.global.id === documentType,
  );
  if (modulesForType.length === 0) {
    throw new DocumentModelNotFoundError(documentType);
  }

  const reducers: VersionedReplayConfig["reducers"] = {};
  for (const module of modulesForType) {
    reducers[module.version ?? 1] = module.reducer as Reducer<PHBaseState>;
  }

  const registry =
    window.ph?.reactorClientModule?.reactorModule?.documentModelRegistry;
  let upgradeManifest: VersionedReplayConfig["upgradeManifest"] | undefined;
  if (registry) {
    try {
      upgradeManifest = registry.getUpgradeManifest(documentType);
    } catch {
      // intentionally empty — missing manifest is normal for single-version documents
    }
  }

  const config: VersionedReplayConfig = { reducers, upgradeManifest };
  return baseLoadFromInputVersioned(path, config);
}

export async function addDocument(
  driveId: string,
  name: string,
  documentType: string,
  parentFolder?: string,
  document?: PHDocument,
  id?: string,
  preferredEditor?: string,
  documentModelVersion?: number,
) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to create documents");
  }

  // document model modules and drive operations are only available on the full
  // reactor client
  const reactorClient = window.ph?.reactorClientModule?.client;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // get the module
  let documentModelModule: DocumentModelModule;
  if (documentModelVersion !== undefined) {
    const { results: documentModelModules } =
      await reactorClient.getDocumentModelModules();
    const module = documentModelModules.find(
      (m) =>
        m.documentModel.global.id === documentType &&
        (m.version ?? 1) === documentModelVersion,
    );
    if (!module) {
      throw new Error(
        `Document model not found for type: ${documentType} with version: ${documentModelVersion}`,
      );
    }
    documentModelModule = module;
  } else {
    documentModelModule =
      await reactorClient.getDocumentModelModule(documentType);
  }

  // create - use passed document's state if available
  const newDocument = document ?? documentModelModule.utils.createDocument();
  if (!document) {
    newDocument.state.document.version = documentModelModule.version ?? 1;
  }
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
    newDoc = await reactorClient.drives.addFile(
      driveId,
      newDocument,
      parentFolder,
    );
  } catch (e) {
    logger.error("Error adding document: @error", e);
    throw new Error("There was an error adding document", { cause: e });
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
  // importing a file into a drive is a full reactor client feature
  const reactor = window.ph?.reactorClientModule?.client;
  if (!reactor) {
    // Reported before it is thrown: a caller watching progress settles on a
    // terminal stage, and returning quietly here left it waiting forever.
    onProgress?.({
      stage: "failed",
      progress: 100,
      error: "ReactorClient not initialized",
    });
    throw new Error("ReactorClient not initialized");
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
      if (UnsupportedDocumentModelVersionError.isError(loadError)) {
        showPHModal({
          type: "documentVersionUnsupported",
          documentType: loadError.documentType,
          requiredVersion: loadError.requiredVersion,
          availableVersions: loadError.availableVersions,
        });
        onProgress?.({
          stage: "failed",
          progress: 100,
          error: loadError.message,
        });
        return;
      }

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
        ).catch((retryError: unknown) => {
          // Nothing awaits this call, so an unreported throw here is an
          // unhandled rejection and a caller that never settles.
          logger.error(
            "Import retry after discovery failed: @error",
            retryError,
          );
          onProgress?.({
            stage: "failed",
            progress: 100,
            error:
              retryError instanceof Error
                ? retryError.message
                : String(retryError),
          });
        });
        return;
      }
      throw loadError;
    }

    // Check for duplicate in same location
    const duplicateCheck = await isDocumentInLocation(
      reactor,
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

    const documentId = (await reactor.isDocumentIdTaken(document.header.id))
      ? generateId()
      : document.header.id;
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

    const _doc = await reactor.get(documentId);
    console.log("Document created, starting upload of operations");

    // Uploading stage (20-100%), re-dispatching each mid-history upgrade at
    // its boundary
    const segments = splitAtUpgradeBoundaries(document.operations);
    const totalOperations = segments.reduce(
      (total, segment) => total + countOperations(segment.operations),
      0,
    );
    let uploadedBefore = 0;

    for (const segment of segments) {
      await uploadOperations(documentId, segment.operations, queueOperations, {
        onProgress: (uploadProgress) => {
          if (uploadProgress.uploadedOperations === undefined) {
            return;
          }
          const uploaded = uploadedBefore + uploadProgress.uploadedOperations;
          const uploadPercent =
            totalOperations > 0 ? uploaded / totalOperations : 0;
          onProgress?.({
            stage: "uploading",
            progress: 20 + Math.round(uploadPercent * 80),
            totalOperations,
            uploadedOperations: uploaded,
          });
        },
      });

      uploadedBefore += countOperations(segment.operations);

      if (segment.upgradeTo !== undefined) {
        await reactor.upgradeDocument(documentId, segment.upgradeTo);
      }
    }

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
  const _drive = await reactorClient.get<DocumentDriveDocument>(driveId);
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

  // drive operations are only available on the full reactor client
  const reactorClient = window.ph?.reactorClientModule?.client;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  await reactorClient.drives.removeNode(driveId, nodeId);
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

  const renameNodeResult = await reactorClient.execute(nodeId, "main", [
    setName({ name }),
  ]);

  if (renameNodeResult.header.name !== name) {
    throw new Error("There was an error renaming the node");
  }

  // Rename the node in the drive document using updateNode action
  const drive = await reactorClient.execute<DocumentDriveDocument>(
    driveId,
    "main",
    [updateNode({ id: nodeId, name })],
  );

  const node = drive.state.global.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error("There was an error renaming node in the drive");
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

  const renameNodeResult = await reactorClient.execute(nodeId, "main", [
    setName({ name }),
  ]);

  if (renameNodeResult.header.name !== name) {
    throw new Error("There was an error renaming the node");
  }

  await reactorClient.execute(driveId, "main", [
    updateNode({ id: nodeId, name }),
  ]);

  const drive = await reactorClient.get<DocumentDriveDocument>(driveId);
  return drive.state.global.nodes.find((n: Node) => n.id === nodeId);
}

export async function setPreferredEditorOnNode(
  nodeId: string,
  preferredEditor: string | null,
) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to modify documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  return reactorClient.execute(nodeId, "main", [
    setPreferredEditor(preferredEditor),
  ]);
}

export async function moveNodeById(args: {
  driveId: string | undefined;
  srcId: string | undefined;
  targetId?: string;
}) {
  const { driveId, srcId, targetId } = args;
  if (!driveId || !srcId) return;

  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to move documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  const targetParentFolder = conditional(
    targetId,
    [isNot(isDefined), constant(undefined)],
    [isStrictEqual(driveId), constant(undefined)],
    constant(targetId),
  );

  if (isStrictEqual(targetParentFolder, srcId)) return;

  return await reactorClient.execute(driveId, "main", [
    baseMoveNode({
      srcFolder: srcId,
      targetParentFolder,
    }),
  ]);
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
  return await reactorClient.execute(driveId, "main", [
    baseMoveNode({
      srcFolder: src.id,
      targetParentFolder: target?.id,
    }),
  ]);
}

/**
 * Duplicates a document under a new id using version-aware replay.
 * Falls back gracefully when no upgrade manifest is registered for the document type.
 */
async function _duplicateDocument(
  reactor: IReactorClient,
  document: PHDocument,
  newId = generateId(),
) {
  const documentType = document.header.documentType;
  const { results: allModules } = await reactor.getDocumentModelModules();
  const modulesForType = allModules.filter(
    (m) => m.documentModel.global.id === documentType,
  );

  const reducers: VersionedReplayConfig["reducers"] = {};
  for (const m of modulesForType) {
    reducers[m.version ?? 1] = m.reducer as Reducer<PHBaseState>;
  }

  if (Object.keys(reducers).length === 0) {
    throw new Error(
      `Document model module not found for type: ${documentType}`,
    );
  }

  const registry =
    window.ph?.reactorClientModule?.reactorModule?.documentModelRegistry;
  let upgradeManifest: VersionedReplayConfig["upgradeManifest"] | undefined;
  if (registry) {
    try {
      upgradeManifest = registry.getUpgradeManifest(documentType);
    } catch {
      // intentionally empty — missing manifest is normal for single-version documents
    }
  }

  const config: VersionedReplayConfig = { reducers, upgradeManifest };
  const header = createPresignedHeader(newId, documentType);

  const duplicated = replayDocumentVersioned(
    document.initialState,
    document.operations,
    config,
    header,
  );
  assertAuthPreservedOnDuplicate(
    document.header.id,
    document.state.auth,
    duplicated.state.auth,
  );
  return duplicated;
}

export async function copyNode(
  driveId: string,
  src: Node,
  target: Node | undefined,
) {
  // copying nodes duplicates documents and adds drive files, both of which are
  // only available on the full reactor client
  const reactor = window.ph?.reactorClientModule?.client;
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
        srcKind: isFileNode(node) ? "file" : "folder",
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

      await reactor.drives.addFile(driveId, duplicatedDocument, target?.id);
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

/**
 * Upgrades a document to a newer document model version. Defaults to the
 * latest registered version for the document's type.
 */
export async function upgradeDocument(documentId: string, toVersion?: number) {
  const reactorClient = window.ph?.reactorClientModule?.client;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  return reactorClient.upgradeDocument(documentId, toVersion);
}
