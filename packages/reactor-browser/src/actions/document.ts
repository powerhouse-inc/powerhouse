import {
  dropDriveNode,
  getDriveNode,
  invalidateDriveNodes,
  markLocalDriveWrite,
} from "../hooks/drive-nodes.js";
import { getPHStore } from "../hooks/ph-store.js";
import type {
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import type {
  ConflictResolution,
  DocumentTypeIcon,
  FileUploadProgressCallback,
  IReactorBrowserReadClient,
  PHGlobal,
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
  PHDocumentHeader,
  Reducer,
  VersionedReplayConfig,
} from "@powerhousedao/shared/document-model";
import {
  assertAuthPreservedOnDuplicate,
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createCopyHeader,
  createPresignedHeader,
  createZip,
  creationState,
  documentModelDocumentType,
  generateId,
  hasDerivedDocumentId,
  replayDocumentVersioned,
  setName,
  setPreferredEditor,
  signaturePolicyOf,
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
import { getFullReactorClient } from "../hooks/reactor.js";
import { isDocumentTypeSupported } from "../utils/documents.js";
import { listAllDriveNodes } from "../utils/nodes.js";
import { getUserPermissions } from "../utils/user.js";
import { queueActions, queueOperations, uploadOperations } from "./queue.js";

const NON_DOMAIN_SCOPES = new Set(["auth", "document"]);

/** Puts a node this tab just wrote into its drive's cache, so hooks show it
 * before the drive change that follows the write is processed. Best effort:
 * a client without a node reader is left to that change. */
async function rememberDriveNode(driveId: string, nodeId: string) {
  try {
    await getDriveNode(driveId, nodeId, { refresh: true });
  } catch (error) {
    logger.verbose(
      "Caching the written node @id failed: @error",
      nodeId,
      error,
    );
  }
}

/** An unreadable drive cannot be shown to hold no duplicate, so reads throw. */
async function isDocumentInLocation(
  reactorClient: IReactorReadClient,
  document: PHDocument,
  driveId: string,
  parentFolder?: string,
): Promise<{
  isDuplicate: boolean;
  duplicateType?: "id" | "name";
  nodeId?: string;
}> {
  const siblings = await listAllDriveNodes(reactorClient.drives, driveId, {
    parentFolder: parentFolder ?? null,
  });

  // Case 1: Check for duplicate by ID
  const nodeById = siblings.find((node) => node.id === document.header.id);

  if (nodeById) {
    return {
      isDuplicate: true,
      duplicateType: "id",
      nodeId: nodeById.id,
    };
  }

  // Case 2: Check for duplicate by name + type in same parent folder
  const nodeByNameAndType = siblings.find(
    (node: Node) =>
      isFileNode(node) &&
      node.name === document.header.name &&
      node.documentType === document.header.documentType,
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

export async function getDocumentExtension(
  document: PHDocument,
): Promise<string> {
  const documentType = document.header.documentType;

  let rawExtension: string | undefined;

  if (documentType === documentModelDocumentType) {
    const globalState = (document.state as { global?: { extension?: string } })
      .global;
    rawExtension = globalState?.extension;
  } else {
    // document model modules are only available on the full reactor client
    const reactorClient = getFullReactorClient();
    if (reactorClient) {
      const { results: documentModelModules } =
        await reactorClient.read.getDocumentModelModules();
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
  reactorClient: IReactorBrowserReadClient,
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
  const initialState = creationState(documentScopeOps);
  if (initialState) {
    return initialState;
  }
  throw new Error(
    documentScopeOps.some((op) => op.action.type === "UPGRADE_DOCUMENT")
      ? "UPGRADE_DOCUMENT operation has no initialState — document is invalid"
      : "No UPGRADE_DOCUMENT operation found — document is invalid",
  );
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
  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Fetch operations page-by-page (document from reactor has operations: {})
  const operations = await fetchDocumentOperations(
    reactorClient.read,
    document,
  );
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
  const reactorClient = getFullReactorClient();
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const documentType = baseDocument.header.documentType;
  const { results: documentModelModules } =
    await reactorClient.read.getDocumentModelModules();
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
    getPHStore()?.reactorClientModule?.reactorModule?.documentModelRegistry;
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
  const reactorClient = getFullReactorClient();
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // create - use passed document's state if available
  const newDocument =
    document ??
    (await reactorClient.read.newDocument(documentType, {
      parentIdentifier: driveId,
      documentModelVersion,
    }));
  newDocument.header.name = name;
  if (preferredEditor) {
    newDocument.header.meta = {
      ...newDocument.header.meta,
      preferredEditor,
    };
  }

  // Create document using ReactorClient. The new node shows at once: the
  // drive change that follows this write re-reads the drive without waiting
  // out the interval, and the node goes into the cache as soon as it exists.
  markLocalDriveWrite(driveId);
  let newDoc: PHDocument;
  try {
    const added = await reactorClient.write.drives.addFile(
      driveId,
      newDocument,
      parentFolder,
    );
    newDoc = await added.document();
  } catch (e) {
    logger.error("Error adding document: @error", e);
    throw new Error("There was an error adding document", { cause: e });
  }
  await rememberDriveNode(driveId, newDoc.header.id);

  // The throttled drive refresh can lag; cache the new node now.
  await getDriveNode(driveId, newDoc.header.id, { refresh: true }).catch(
    () => undefined,
  );

  // Return a file node structure for compatibility
  return {
    id: newDoc.header.id,
    name: newDoc.header.name,
    documentType,
    parentFolder: parentFolder ?? null,
    kind: "file" as const,
  };
}

/** The file node shape {@link addDocument} reports for a created document. */
export type AddedFileNode = {
  id: string;
  name: string;
  documentType: string;
  parentFolder: string | null;
  kind: "file";
};

/**
 * How many ids an import will try before giving up. The check before the create
 * catches an id that is already taken; this bound covers the window between the
 * two, where a create can still lose to a claim made in the meantime.
 */
const IMPORT_ID_ATTEMPTS = 3;

/** True when this error, or anything it wraps, is a taken document id. */
function isDocumentAlreadyExists(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.name === "DocumentAlreadyExistsError") {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/**
 * Creates the imported document under an id that is free, retrying on a
 * collision.
 *
 * The check cannot stand on its own: it answers for the moment it ran, and the
 * create that follows can still land on an id claimed in between. The store
 * rejects that create as DocumentAlreadyExistsError, which is not retryable
 * under the same id and is resolved by minting another one. A create that
 * fails leaves the drive untouched, so a retry has nothing to clean up.
 */
async function createImportedDocument(
  write: IReactorWriteClient,
  document: PHDocument,
  driveId: string,
  name?: string,
  parentFolder?: string,
): Promise<{ documentId: string; fileNode: AddedFileNode }> {
  // A v2-required import keeps the zip's id only while that id still derives
  // from the zip's header, so the signatures bound to it keep verifying.
  const v2Required = signaturePolicyOf(document.header) === "v2-required";
  const keepsId =
    (!v2Required || hasDerivedDocumentId(document.header)) &&
    !(await write.isDocumentIdTaken(document.header.id));
  let documentId = keepsId ? document.header.id : generateId();

  for (let attempt = 1; ; attempt++) {
    let header: PHDocumentHeader;
    if (!v2Required) {
      header = createPresignedHeader(
        documentId,
        document.header.documentType,
        document.header.protocolVersions,
      );
    } else if (keepsId && attempt === 1) {
      header = createPresignedHeader(documentId, document.header.documentType);
      header.createdAtUtcIso = document.header.createdAtUtcIso;
      header.sig = { ...header.sig, nonce: document.header.sig.nonce };
      header.protocolVersions = { ...document.header.protocolVersions };
    } else {
      header = createCopyHeader(document.header);
      documentId = header.id;
    }
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

    try {
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

      return { documentId, fileNode };
    } catch (error) {
      if (!isDocumentAlreadyExists(error) || attempt === IMPORT_ID_ATTEMPTS) {
        throw error;
      }

      logger.warn(
        `Document id ${documentId} was taken between the check and the create; importing under a new id`,
      );
      documentId = generateId();
    }
  }
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
  const reactor = getFullReactorClient();
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
      const discoveryService = getPHStore()?.packageDiscoveryService;
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
      reactor.read,
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
    await reactor.read.getDocumentModelModule(document.header.documentType);

    // Initializing stage (10-20%)
    onProgress?.({ stage: "initializing", progress: 10 });

    markLocalDriveWrite(driveId);
    const created = await createImportedDocument(
      reactor.write,
      document,
      driveId,
      name,
      parentFolder,
    );
    const documentId = created.documentId;
    const fileNode = created.fileNode;
    await rememberDriveNode(driveId, documentId);

    onProgress?.({ stage: "initializing", progress: 20 });

    const _doc = await reactor.read.get(documentId);
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
  discoveryService: PHGlobal["packageDiscoveryService"],
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
  const reactor = getPHStore()?.reactorClient;
  if (!reactor) {
    return;
  }
  const { isAllowedToCreateDocuments } = getUserPermissions();

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to update files");
  }
  const drive = await reactor.read.get<DocumentDriveDocument>(driveId);
  markLocalDriveWrite(driveId);
  await queueActions(
    drive,
    baseUpdateFile({
      id: nodeId,
      name: name ?? undefined,
      parentFolder,
      documentType,
    }),
  );

  const node = await getDriveNode(driveId, nodeId, { refresh: true });
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

  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  // Get the drive document and add folder action
  const _drive = await reactorClient.read.get<DocumentDriveDocument>(driveId);
  const folderId = generateId();
  markLocalDriveWrite(driveId);
  const added = await reactorClient.write.execute(driveId, "main", [
    baseAddFolder({
      id: folderId,
      name,
      parentFolder,
    }),
  ]);
  await added.readable;

  const node = await getDriveNode(driveId, folderId, { refresh: true });
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
  const reactorClient = getFullReactorClient();
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  markLocalDriveWrite(driveId);
  const removed = await reactorClient.write.drives.removeNode(driveId, nodeId);
  await removed.readable;
  dropDriveNode(driveId, nodeId);
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

  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const renamed = await reactorClient.write.execute(nodeId, "main", [
    setName({ name }),
  ]);
  const renameNodeResult = await renamed.document();

  if (renameNodeResult.header.name !== name) {
    throw new Error("There was an error renaming the node");
  }

  // Rename the node in the drive document using updateNode action
  markLocalDriveWrite(driveId);
  const updated = await reactorClient.write.execute(driveId, "main", [
    updateNode({ id: nodeId, name }),
  ]);
  await updated.readable;

  const node = await getDriveNode(driveId, nodeId, { refresh: true });
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

  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const renamed = await reactorClient.write.execute(nodeId, "main", [
    setName({ name }),
  ]);
  const renameNodeResult = await renamed.document();

  if (renameNodeResult.header.name !== name) {
    throw new Error("There was an error renaming the node");
  }

  markLocalDriveWrite(driveId);
  const updated = await reactorClient.write.execute(driveId, "main", [
    updateNode({ id: nodeId, name }),
  ]);
  await updated.readable;
  return getDriveNode(driveId, nodeId, { refresh: true });
}

export async function setPreferredEditorOnNode(
  nodeId: string,
  preferredEditor: string | null,
) {
  const { isAllowedToCreateDocuments } = getUserPermissions();
  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to modify documents");
  }

  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const handle = await reactorClient.write.execute(nodeId, "main", [
    setPreferredEditor(preferredEditor),
  ]);
  return handle.document();
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

  const reactorClient = getPHStore()?.reactorClient;
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

  markLocalDriveWrite(driveId);
  const handle = await reactorClient.write.execute(driveId, "main", [
    baseMoveNode({
      srcFolder: srcId,
      targetParentFolder,
    }),
  ]);
  const moved = await handle.document();
  await rememberDriveNode(driveId, srcId);
  return moved;
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

  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  markLocalDriveWrite(driveId);
  const handle = await reactorClient.write.execute(driveId, "main", [
    baseMoveNode({
      srcFolder: src.id,
      targetParentFolder: target?.id,
    }),
  ]);
  const moved = await handle.document();
  await rememberDriveNode(driveId, src.id);
  return moved;
}

/**
 * Duplicates a document under a new id using version-aware replay.
 * Falls back gracefully when no upgrade manifest is registered for the document type.
 */
async function _duplicateDocument(
  reactor: IReactorReadClient,
  document: PHDocument,
  newId = generateId(),
  driveId?: string,
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
    getPHStore()?.reactorClientModule?.reactorModule?.documentModelRegistry;
  let upgradeManifest: VersionedReplayConfig["upgradeManifest"] | undefined;
  if (registry) {
    try {
      upgradeManifest = registry.getUpgradeManifest(documentType);
    } catch {
      // intentionally empty — missing manifest is normal for single-version documents
    }
  }

  const config: VersionedReplayConfig = { reducers, upgradeManifest };
  // A copy keeps its source's versions; selection fills the keys it lacks.
  const selected = await reactor.getCreateProtocolVersions({
    documentType: document.header.documentType,
    parentIdentifier: driveId,
  });
  const header = createCopyHeader(
    {
      documentType: document.header.documentType,
      protocolVersions: document.header.protocolVersions
        ? { ...selected, ...document.header.protocolVersions }
        : undefined,
    },
    newId,
    await reactor.getCreateSignaturePolicy(),
  );

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
  const reactor = getFullReactorClient();
  if (!reactor) {
    return;
  }
  const { isAllowedToCreateDocuments } = getUserPermissions();

  if (!isAllowedToCreateDocuments) {
    throw new Error("User is not allowed to copy documents");
  }

  const drive = await reactor.read.get<DocumentDriveDocument>(driveId);
  const driveNodes = await listAllDriveNodes(reactor.read.drives, driveId);

  const copyNodesInput = generateNodesCopy(
    {
      srcId: src.id,
      targetParentFolder: target?.id,
      targetName: src.name,
    },
    () => generateId(),
    driveNodes,
  );

  // Pre-calculate collision-resolved names for all nodes to be copied
  const resolvedNamesMap = new Map<string, string>();
  for (const copyNodeInput of copyNodesInput) {
    const node = driveNodes.find((n) => n.id === copyNodeInput.srcId);
    if (node) {
      const resolvedName = handleTargetNameCollisions({
        nodes: driveNodes,
        srcName: copyNodeInput.targetName || node.name,
        srcKind: isFileNode(node) ? "file" : "folder",
        targetParentFolder: copyNodeInput.targetParentFolder || null,
      });
      resolvedNamesMap.set(copyNodeInput.targetId, resolvedName);
    }
  }

  const fileNodesToCopy = copyNodesInput.filter((copyNodeInput) => {
    const node = driveNodes.find((node) => node.id === copyNodeInput.srcId);
    return node !== undefined && isFileNode(node);
  });

  markLocalDriveWrite(driveId);
  for (const fileNodeToCopy of fileNodesToCopy) {
    try {
      const document = await reactor.read.get(fileNodeToCopy.srcId);

      const duplicatedDocument = await _duplicateDocument(
        reactor.read,
        document,
        fileNodeToCopy.targetId,
        driveId,
      );

      // Set the header name to match the collision-resolved node name
      const resolvedName = resolvedNamesMap.get(fileNodeToCopy.targetId);
      if (resolvedName) {
        duplicatedDocument.header.name = resolvedName;
      }
      // A v2-required copy takes a derived id, which the drive's node must name.
      fileNodeToCopy.targetId = duplicatedDocument.header.id;

      const added = await reactor.write.drives.addFile(
        driveId,
        duplicatedDocument,
        target?.id,
      );
      await added.readable;
    } catch (e) {
      logger.error(
        `Error copying document ${fileNodeToCopy.srcId}: ${String(e)}`,
      );
    }
  }

  const copyActions = copyNodesInput.map((copyNodeInput) =>
    baseCopyNode(copyNodeInput),
  );
  // Many nodes land at once: re-list the drive rather than fetch each one.
  markLocalDriveWrite(driveId);
  const copied = await queueActions(drive, copyActions);
  invalidateDriveNodes(driveId);
  return copied;
}

/**
 * Upgrades a document to a newer document model version. Defaults to the
 * latest registered version for the document's type.
 */
export async function upgradeDocument(documentId: string, toVersion?: number) {
  const reactorClient = getFullReactorClient();
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  const handle = await reactorClient.write.upgradeDocument(
    documentId,
    toVersion,
  );
  return handle.document();
}
