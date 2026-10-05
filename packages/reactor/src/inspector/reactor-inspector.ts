import type { IProcessorManager } from "@powerhousedao/shared/processors";
import type {
  IDocumentIntegrityService,
  RebuildResult,
  ValidationResult,
} from "../admin/types.js";
import type {
  CatchUpStatus,
  ICatchUp,
  SweepResult,
} from "../catch-up/types.js";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { DriveCollectionId } from "../cache/operation-index-types.js";
import type { IReactor } from "../core/types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type {
  IInspectableAttachmentStore,
  IInspectableQueue,
  IInspector,
  InspectorAttachmentInfo,
  InspectorDocumentModelInfo,
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  InspectorDriveIntegrityRef,
  InspectorDrivePage,
  InspectorProcessorInfo,
  IStorageHealthProvider,
  QueueStateSnapshot,
  StorageHealth,
} from "./types.js";

/**
 * The document type every drive collection carries. Drives are enumerated by
 * this type rather than by a dedicated "list drives" API, which the reactor
 * has none of.
 */
const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

/** Default file-node page size for the drive-integrity walk. */
const DEFAULT_INTEGRITY_PAGE_SIZE = 500;

/** Default drive page size when the caller names no limit. */
const DEFAULT_DRIVE_PAGE_SIZE = 100;

/** One drive-tree node, read defensively from an untrusted drive state. */
type DriveNode = {
  id: string;
  kind: string;
  documentType: string | undefined;
};

/**
 * Reads a drive document's node tree without trusting its runtime shape: the
 * inspector may be pointed at a drive whose state is older, partial, or
 * malformed, and a drive observability view must not throw on one bad node.
 */
function readDriveState(doc: PHDocument): {
  name: string;
  icon: string | undefined;
  nodes: DriveNode[];
} {
  const global = (doc.state as { global?: unknown }).global as
    | {
        name?: unknown;
        icon?: unknown;
        nodes?: unknown;
      }
    | undefined;
  const rawNodes = Array.isArray(global?.nodes) ? global.nodes : [];
  const nodes: DriveNode[] = [];
  for (const raw of rawNodes) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const node = raw as {
      id?: unknown;
      kind?: unknown;
      documentType?: unknown;
    };
    if (typeof node.id !== "string" || typeof node.kind !== "string") {
      continue;
    }
    nodes.push({
      id: node.id,
      kind: node.kind,
      documentType:
        typeof node.documentType === "string" ? node.documentType : undefined,
    });
  }
  return {
    name: typeof global?.name === "string" ? global.name : doc.header.name,
    icon: typeof global?.icon === "string" ? global.icon : undefined,
    nodes,
  };
}

/** The drive's file nodes (documents), in tree order. */
function fileNodesOf(nodes: DriveNode[]): DriveNode[] {
  return nodes.filter((node) => node.kind === "file");
}

function toDriveInfo(doc: PHDocument): InspectorDriveInfo {
  const driveId = doc.header.id;
  const branch = doc.header.branch;
  const state = readDriveState(doc);
  const fileCount = fileNodesOf(state.nodes).length;
  return {
    driveId,
    name: state.name,
    branch,
    collectionId: DriveCollectionId.forDrive(driveId, branch).key,
    documentType: doc.header.documentType,
    nodeCount: state.nodes.length,
    fileCount,
    folderCount: state.nodes.length - fileCount,
    icon: state.icon,
  };
}

/** Parses a non-negative integer walk offset from a cursor, defaulting to 0. */
function parseOffset(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * The components a `ReactorInspector` observes. Every one is optional: a
 * reactor module that lacks a piece (a queue that is not the in-memory one, no
 * catch-up scheduler) still gets an inspector, and the methods needing the
 * missing piece degrade along one rule -- a READ of a component that is not
 * there comes back empty (there is no queue state, so there are no jobs), and
 * an ACTION on one REFUSES by name.
 *
 * The asymmetry is the point. An action that silently returns success is the
 * failure mode this whole surface exists to stamp out: `pauseQueue()`
 * resolving on a reactor whose queue it cannot pause leaves an operator
 * looking at a "Pause" button that reports done and changes nothing, and a
 * remote caller one layer up turning that into `inspectionPauseQueue: true`.
 */
export type ReactorInspectorComponents = {
  queue?: IInspectableQueue;
  processorManager?: IProcessorManager;
  catchUp?: ICatchUp;
  integrity?: IDocumentIntegrityService;
  storageHealth?: IStorageHealthProvider;
  documentModelRegistry?: IDocumentModelRegistry;
  reactor?: IReactor;
  attachmentStore?: IInspectableAttachmentStore;
};

const healthyStorageDefault: StorageHealth = {
  healthy: true,
  everRecreated: false,
  recreateCount: 0,
};

const emptyQueueState: QueueStateSnapshot = {
  isPaused: false,
  pendingJobs: [],
  executingJobs: [],
  totalPending: 0,
  totalExecuting: 0,
};

const noAttachmentStore: InspectorAttachmentInfo = {
  present: false,
  storeKind: "none",
  hasReplicator: false,
  replicatorRunning: false,
  backlogScanned: false,
  refsSeen: 0,
  held: 0,
  bytesHeld: 0,
  queued: 0,
  fetching: 0,
  pendingFetches: 0,
  waiting: 0,
  notFound: 0,
  failed: 0,
  lastError: undefined,
};

function catchUpUnavailable(): Error {
  return new Error("Catch-up not available");
}

function integrityUnavailable(): Error {
  return new Error("Integrity service not available");
}

function queueControlUnsupported(what: string): Error {
  return new Error(
    `${what} is unsupported on this host's queue: pause and resume are the in-memory queue's own inspection affordances (IInspectableQueue), not part of the IQueue contract, so a reactor built with another queue implementation cannot serve them`,
  );
}

function processorsUnsupported(what: string): Error {
  return new Error(
    `${what} is unsupported on this host: it was built with no processor manager, so there is nothing tracking processors to act on`,
  );
}

/** In-process `IInspector` over a reactor module's live components. */
export class ReactorInspector implements IInspector {
  private readonly queue: IInspectableQueue | undefined;
  private readonly processorManager: IProcessorManager | undefined;
  private readonly catchUp: ICatchUp | undefined;
  private readonly integrity: IDocumentIntegrityService | undefined;
  private readonly storageHealth: IStorageHealthProvider | undefined;
  private readonly documentModelRegistry: IDocumentModelRegistry | undefined;
  private readonly reactor: IReactor | undefined;
  private readonly attachmentStore: IInspectableAttachmentStore | undefined;

  constructor(components: ReactorInspectorComponents) {
    this.queue = components.queue;
    this.processorManager = components.processorManager;
    this.catchUp = components.catchUp;
    this.integrity = components.integrity;
    this.storageHealth = components.storageHealth;
    this.documentModelRegistry = components.documentModelRegistry;
    this.reactor = components.reactor;
    this.attachmentStore = components.attachmentStore;
  }

  listDocumentModels(): Promise<InspectorDocumentModelInfo[]> {
    const registry = this.documentModelRegistry;
    if (!registry) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      registry.getAllModules().map((module) => {
        const documentType = module.documentModel.global.id;
        return {
          documentType,
          name: module.documentModel.global.name,
          version: module.version ?? 1,
          supportedVersions: registry.getSupportedVersions(documentType),
        };
      }),
    );
  }

  async listDrives(
    cursor?: string,
    limit?: number,
  ): Promise<InspectorDrivePage> {
    const reactor = this.reactor;
    if (!reactor) {
      return { results: [], nextCursor: undefined };
    }
    const page = await reactor.find({ type: DRIVE_DOCUMENT_TYPE }, undefined, {
      cursor: cursor ?? "",
      limit: limit ?? DEFAULT_DRIVE_PAGE_SIZE,
    });
    return {
      results: page.results.map(toDriveInfo),
      nextCursor: page.nextCursor,
    };
  }

  async checkDriveIntegrity(
    driveId: string,
    cursor?: string,
    limit?: number,
  ): Promise<InspectorDriveIntegrity> {
    const reactor = this.reactor;
    if (!reactor) {
      return {
        driveId,
        checkedNodeCount: 0,
        totalFileNodeCount: 0,
        missingDocuments: [],
        unsupportedTypes: [],
        nextCursor: undefined,
      };
    }
    const drive = await reactor.get(driveId);
    const fileNodes = fileNodesOf(readDriveState(drive).nodes);
    const offset = parseOffset(cursor);
    const pageSize = limit ?? DEFAULT_INTEGRITY_PAGE_SIZE;
    const slice = fileNodes.slice(offset, offset + pageSize);
    const present = await this.presentDocumentIds(slice.map((node) => node.id));
    const supported = this.supportedDocumentTypes();
    const missingDocuments: InspectorDriveIntegrityRef[] = [];
    const unsupportedTypes: InspectorDriveIntegrityRef[] = [];
    for (const node of slice) {
      const documentType = node.documentType ?? "";
      if (!present.has(node.id)) {
        missingDocuments.push({ id: node.id, documentType });
      }
      if (supported !== undefined && !supported.has(documentType)) {
        unsupportedTypes.push({ id: node.id, documentType });
      }
    }
    const nextOffset = offset + slice.length;
    return {
      driveId,
      checkedNodeCount: slice.length,
      totalFileNodeCount: fileNodes.length,
      missingDocuments,
      unsupportedTypes,
      nextCursor:
        nextOffset < fileNodes.length ? String(nextOffset) : undefined,
    };
  }

  getAttachmentInfo(): Promise<InspectorAttachmentInfo> {
    const store = this.attachmentStore;
    if (!store) {
      return Promise.resolve({ ...noAttachmentStore });
    }
    return store.getAttachmentInfo();
  }

  getQueueState(): Promise<QueueStateSnapshot> {
    const queue = this.queue;
    if (!queue) {
      return Promise.resolve({ ...emptyQueueState });
    }
    const pendingJobs = queue.getPendingJobs();
    const executingJobs: Job[] = [];
    for (const jobIds of queue.getExecutingJobIds().values()) {
      for (const jobId of jobIds) {
        const job = queue.getJob(jobId);
        if (job) {
          executingJobs.push(job);
        }
      }
    }
    return Promise.resolve({
      isPaused: queue.paused,
      pendingJobs,
      executingJobs,
      totalPending: pendingJobs.length,
      totalExecuting: executingJobs.length,
    });
  }

  pauseQueue(): Promise<void> {
    const queue = this.queue;
    if (!queue) {
      return Promise.reject(queueControlUnsupported("Pausing the queue"));
    }
    queue.pause();
    return Promise.resolve();
  }

  resumeQueue(): Promise<void> {
    const queue = this.queue;
    if (!queue) {
      return Promise.reject(queueControlUnsupported("Resuming the queue"));
    }
    return queue.resume();
  }

  getProcessors(): Promise<InspectorProcessorInfo[]> {
    const tracked = this.processorManager?.getAll() ?? [];
    return Promise.resolve(
      tracked.map((processor) => ({
        processorId: processor.processorId,
        factoryId: processor.factoryId,
        driveId: processor.driveId,
        processorIndex: processor.processorIndex,
        lastOrdinal: processor.lastOrdinal,
        status: processor.status,
        lastError: processor.lastError,
        lastErrorTimestamp: processor.lastErrorTimestamp,
      })),
    );
  }

  retryProcessor(processorId: string): Promise<void> {
    const manager = this.processorManager;
    if (!manager) {
      return Promise.reject(processorsUnsupported("Retrying a processor"));
    }
    const processor = manager.get(processorId);
    if (!processor) {
      return Promise.reject(
        new Error(
          `Cannot retry processor ${JSON.stringify(processorId)}: this reactor is not tracking it. Re-read the processor list -- the row that named it is stale.`,
        ),
      );
    }
    return processor.retry();
  }

  getCatchUpStatus(): Promise<CatchUpStatus> {
    const catchUp = this.catchUp;
    if (!catchUp) {
      return Promise.reject(catchUpUnavailable());
    }
    return Promise.resolve(catchUp.status());
  }

  sweepCatchUp(): Promise<SweepResult[]> {
    const catchUp = this.catchUp;
    if (!catchUp) {
      return Promise.reject(catchUpUnavailable());
    }
    return catchUp.sweepNow();
  }

  validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult> {
    const integrity = this.integrity;
    if (!integrity) {
      return Promise.reject(integrityUnavailable());
    }
    return integrity.validateDocument(documentId, branch);
  }

  rebuildKeyframes(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const integrity = this.integrity;
    if (!integrity) {
      return Promise.reject(integrityUnavailable());
    }
    return integrity.rebuildKeyframes(documentId, branch);
  }

  rebuildSnapshots(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const integrity = this.integrity;
    if (!integrity) {
      return Promise.reject(integrityUnavailable());
    }
    return integrity.rebuildSnapshots(documentId, branch);
  }

  getStorageHealth(): Promise<StorageHealth> {
    const provider = this.storageHealth;
    if (!provider) {
      return Promise.resolve({ ...healthyStorageDefault });
    }
    return Promise.resolve(provider.getStorageHealth());
  }

  /**
   * The ids among `ids` that are present in the reactor, paging `find` until
   * every match has been seen so a large slice cannot hide a present document
   * behind the store's default page limit.
   */
  private async presentDocumentIds(ids: string[]): Promise<Set<string>> {
    const present = new Set<string>();
    const reactor = this.reactor;
    if (!reactor || ids.length === 0) {
      return present;
    }
    let page = await reactor.find({ ids }, undefined, {
      cursor: "",
      limit: ids.length,
    });
    for (const doc of page.results) {
      present.add(doc.header.id);
    }
    while (page.nextCursor !== undefined && page.next) {
      page = await page.next();
      for (const doc of page.results) {
        present.add(doc.header.id);
      }
    }
    return present;
  }

  /**
   * The document types the registry supports, or undefined when no registry is
   * wired -- in which case the unsupported-type check is skipped rather than
   * reporting every type as unsupported.
   */
  private supportedDocumentTypes(): Set<string> | undefined {
    const registry = this.documentModelRegistry;
    if (!registry) {
      return undefined;
    }
    return new Set(
      registry.getAllModules().map((module) => module.documentModel.global.id),
    );
  }
}
