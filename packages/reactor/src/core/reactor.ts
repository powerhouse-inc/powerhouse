import type { BaseDocumentDriveServer, IDocumentStorage } from "document-drive";
import { AbortError } from "document-drive";
import type {
  Action,
  DeleteDocumentActionInput,
  DocumentModelModule,
  Operation,
  PHBaseState,
  PHDocument,
} from "document-model";
import { v4 as uuidv4 } from "uuid";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import type { IReadModelCoordinator } from "../read-models/interfaces.js";
import { createMutableShutdownStatus } from "../shared/factories.js";
import type {
  JobInfo,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ShutdownStatus,
  ViewFilter,
} from "../shared/types.js";
import { JobStatus, SYSTEM_DOCUMENT_ID } from "../shared/types.js";
import { matchesScope } from "../shared/utils.js";
import type { IReactor } from "./types.js";
import { filterByParentId, filterByType } from "./utils.js";

/**
 * This class implements the IReactor interface and serves as the main entry point
 * for the new Reactor architecture.
 */
export class Reactor implements IReactor {
  private driveServer: BaseDocumentDriveServer;
  private documentStorage: IDocumentStorage;
  private shutdownStatus: ShutdownStatus;
  private setShutdown: (value: boolean) => void;
  private queue: IQueue;
  private jobTracker: IJobTracker;
  private readModelCoordinator: IReadModelCoordinator;

  constructor(
    driveServer: BaseDocumentDriveServer,
    documentStorage: IDocumentStorage,
    queue: IQueue,
    jobTracker: IJobTracker,
    readModelCoordinator: IReadModelCoordinator,
  ) {
    // Store required dependencies
    this.driveServer = driveServer;
    this.documentStorage = documentStorage;
    this.queue = queue;
    this.jobTracker = jobTracker;
    this.readModelCoordinator = readModelCoordinator;

    // Start the read model coordinator
    this.readModelCoordinator.start();

    // Create mutable shutdown status using factory method
    const [status, setter] = createMutableShutdownStatus(false);
    this.shutdownStatus = status;
    this.setShutdown = setter;
  }

  /**
   * Signals that the reactor should shutdown.
   */
  kill(): ShutdownStatus {
    // Mark the reactor as shutdown
    this.setShutdown(true);

    // Stop the read model coordinator
    this.readModelCoordinator.stop();

    // TODO: Phase 3+ - Implement graceful shutdown for queue, executors, etc.
    // For now, we just mark as shutdown and return status

    return this.shutdownStatus;
  }

  /**
   * Retrieves a list of document model specifications
   */
  getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    // Get document model modules from the drive server + filter
    const modules = this.driveServer.getDocumentModelModules();
    const filteredModels = modules.filter(
      (module) =>
        !namespace || module.documentModel.global.name.startsWith(namespace),
    );

    // Apply paging
    const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || filteredModels.length;
    const pagedModels = filteredModels.slice(startIndex, startIndex + limit);

    // Create paged results
    const hasMore = startIndex + limit < filteredModels.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    // even thought this is currently synchronous, they could have passed in an already-aborted signal
    if (signal?.aborted) {
      throw new AbortError();
    }

    return Promise.resolve({
      results: pagedModels,
      options: paging || { cursor: "0", limit: filteredModels.length },
      nextCursor,
      next: hasMore
        ? () =>
            this.getDocumentModels(
              namespace,
              { cursor: nextCursor!, limit },
              signal,
            )
        : undefined,
    });
  }

  /**
   * Retrieves a specific PHDocument by id
   */
  async get<TDocument extends PHDocument>(
    id: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }> {
    const document = await this.documentStorage.get<TDocument>(id);

    if (signal?.aborted) {
      throw new AbortError();
    }

    const childIds = await this.documentStorage.getChildren(id);

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Apply view filter - This will be removed when we pass the viewfilter along
    // to the underlying store, but is here now for the interface.
    for (const scope in document.state) {
      if (!matchesScope(view, scope)) {
        delete document.state[scope as keyof PHBaseState];
      }
    }

    return {
      document,
      childIds,
    };
  }

  /**
   * Retrieves a specific PHDocument by slug
   */
  async getBySlug<TDocument extends PHDocument>(
    slug: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }> {
    // Use the storage layer to resolve slug to ID
    let ids: string[];
    try {
      ids = await this.documentStorage.resolveIds([slug], signal);
    } catch (error) {
      // If the error is from resolveIds (document not found), wrap it with our message
      if (error instanceof Error && error.message.includes("not found")) {
        throw new Error(`Document not found with slug: ${slug}`);
      }

      throw error;
    }

    if (ids.length === 0 || !ids[0]) {
      throw new Error(`Document not found with slug: ${slug}`);
    }

    // Now get the document by its resolved ID
    return await this.get<TDocument>(ids[0], view, signal);
  }

  /**
   * Retrieves the operations for a document
   */
  async getOperations(
    documentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<Record<string, PagedResults<Operation>>> {
    // Use storage directly to get the document
    const document = await this.documentStorage.get(documentId);

    if (signal?.aborted) {
      throw new AbortError();
    }

    const operations = document.operations;
    const result: Record<string, PagedResults<Operation>> = {};

    // apply view filter, per scope -- this will be removed when we pass the viewfilter along
    // to the underlying store, but is here now for the interface.
    for (const scope in operations) {
      if (matchesScope(view, scope)) {
        const scopeOperations = operations[scope];

        // apply paging too
        const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
        const limit = paging?.limit || scopeOperations.length;
        const pagedOperations = scopeOperations.slice(
          startIndex,
          startIndex + limit,
        );

        result[scope] = {
          results: pagedOperations,
          options: { cursor: String(startIndex + limit), limit },
        };
      }
    }

    return Promise.resolve(result);
  }

  /**
   * Filters documents by criteria and returns a list of them
   */
  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    let results: PagedResults<PHDocument>;
    if (search.ids) {
      if (search.slugs && search.slugs.length > 0) {
        throw new Error("Cannot use both ids and slugs in the same search");
      }

      results = await this.findByIds(search.ids, view, paging, signal);

      if (search.parentId) {
        results = filterByParentId(results, search.parentId);
      }

      if (search.type) {
        results = filterByType(results, search.type);
      }
    } else if (search.slugs) {
      results = await this.findBySlugs(search.slugs, view, paging, signal);

      if (search.parentId) {
        results = filterByParentId(results, search.parentId);
      }

      if (search.type) {
        results = filterByType(results, search.type);
      }
    } else if (search.parentId) {
      results = await this.findByParentId(
        search.parentId,
        view,
        paging,
        signal,
      );

      if (search.type) {
        results = filterByType(results, search.type);
      }
    } else if (search.type) {
      results = await this.findByType(search.type, view, paging, signal);
    } else {
      throw new Error("No search criteria provided");
    }

    if (signal?.aborted) {
      throw new AbortError();
    }

    return results;
  }

  /**
   * Creates a document
   */
  async create(document: PHDocument, signal?: AbortSignal): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Create a CREATE_DOCUMENT action
    const action: Action = {
      id: `${document.header.id}-create`,
      type: "CREATE_DOCUMENT",
      scope: "system",
      timestampUtcMs: String(Date.now()),
      input: {
        document,
      },
    };

    // Create a job for the CREATE_DOCUMENT action
    const job: Job = {
      id: uuidv4(),
      documentId: SYSTEM_DOCUMENT_ID,
      scope: "system",
      branch: "main",
      operation: {
        index: 0,
        timestampUtcMs: String(Date.now()),
        hash: "",
        skip: 0,
        action: action,
      },
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
    };

    // Create job info and register with tracker
    const jobInfo: JobInfo = {
      id: job.id,
      status: JobStatus.PENDING,
      createdAtUtcIso,
    };
    this.jobTracker.registerJob(jobInfo);

    // Enqueue the job
    await this.queue.enqueue(job);

    return jobInfo;
  }

  /**
   * Deletes a document
   */
  async deleteDocument(
    id: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Create a DELETE_DOCUMENT action
    const deleteInput: DeleteDocumentActionInput = {
      documentId: id,
      propagate,
    };

    const action: Action = {
      id: `${id}-delete`,
      type: "DELETE_DOCUMENT",
      scope: "system",
      timestampUtcMs: String(Date.now()),
      input: deleteInput,
    };

    // Create a job for the DELETE_DOCUMENT action
    const job: Job = {
      id: uuidv4(),
      documentId: SYSTEM_DOCUMENT_ID,
      scope: "system",
      branch: "main",
      operation: {
        index: 0,
        timestampUtcMs: String(Date.now()),
        hash: "",
        skip: 0,
        action: action,
      },
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
    };

    // Create job info and register with tracker
    const jobInfo: JobInfo = {
      id: job.id,
      status: JobStatus.PENDING,
      createdAtUtcIso,
    };
    this.jobTracker.registerJob(jobInfo);

    // Enqueue the job
    await this.queue.enqueue(job);

    return jobInfo;
  }

  /**
   * Applies a list of actions to a document
   */
  async mutate(id: string, actions: Action[]): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();

    // Create jobs for each action/operation
    const jobs: Job[] = actions.map((action, index) => ({
      id: uuidv4(),
      documentId: id,
      scope: action.scope || "global",
      branch: "main", // Default to main branch
      operation: {
        index: index,
        timestampUtcMs: String(action.timestampUtcMs || Date.now()),
        hash: "", // Will be computed by the executor
        skip: 0,
        action: action,
      },
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
    }));

    // Create job info for the batch (using the first job's ID as the batch ID)
    const batchJobId = jobs.length > 0 ? jobs[0].id : uuidv4();
    const jobInfo: JobInfo = {
      id: batchJobId,
      status: JobStatus.PENDING,
      createdAtUtcIso,
    };
    this.jobTracker.registerJob(jobInfo);

    // Enqueue all jobs
    for (const job of jobs) {
      await this.queue.enqueue(job);
    }

    return jobInfo;
  }

  /**
   * Adds multiple documents as children to another
   */
  async addChildren(
    parentId: string,
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();
    const jobId = uuidv4();

    // Check abort signal before starting
    if (signal?.aborted) {
      throw new AbortError();
    }

    // TODO: Implement when drive server supports hierarchical documents
    // For now, this is a placeholder implementation

    // Verify parent exists
    try {
      await this.driveServer.getDocument(parentId);
    } catch (error) {
      return {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Check abort signal after parent verification
    if (signal?.aborted) {
      throw new AbortError();
    }

    // Verify all children exist
    for (const childId of documentIds) {
      try {
        await this.driveServer.getDocument(childId);
      } catch (error) {
        return {
          id: jobId,
          status: JobStatus.FAILED,
          createdAtUtcIso,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }

      // Check abort signal after each child verification
      if (signal?.aborted) {
        throw new AbortError();
      }
    }

    // TODO: Actually establish parent-child relationships

    // Return success job info
    return {
      id: jobId,
      status: JobStatus.COMPLETED,
      createdAtUtcIso,
      completedAtUtcIso: new Date().toISOString(),
    };
  }

  /**
   * Removes multiple documents as children from another
   */
  async removeChildren(
    parentId: string,
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();
    const jobId = uuidv4();

    // Check abort signal before starting
    if (signal?.aborted) {
      throw new AbortError();
    }

    // TODO: Implement when drive server supports hierarchical documents
    // For now, this is a placeholder implementation

    // Verify parent exists
    try {
      await this.driveServer.getDocument(parentId);
    } catch (error) {
      return {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Check abort signal after parent verification
    if (signal?.aborted) {
      throw new AbortError();
    }

    // TODO: Actually remove parent-child relationships

    // Return success job info
    return {
      id: jobId,
      status: JobStatus.COMPLETED,
      createdAtUtcIso,
      completedAtUtcIso: new Date().toISOString(),
    };
  }

  /**
   * Retrieves the status of a job
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new AbortError();
    }

    const jobInfo = this.jobTracker.getJobStatus(jobId);

    if (!jobInfo) {
      // Job not found - return FAILED status with appropriate error
      return Promise.resolve({
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
        error: "Job not found",
      });
    }

    return Promise.resolve(jobInfo);
  }

  /**
   * Finds documents by their IDs
   */
  private async findByIds(
    ids: string[],
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    const documents: PHDocument[] = [];

    // Fetch each document by ID using storage directly
    for (const id of ids) {
      if (signal?.aborted) {
        throw new AbortError();
      }

      let document: PHDocument;
      try {
        document = await this.documentStorage.get<PHDocument>(id);
      } catch {
        // Skip documents that don't exist or can't be accessed
        // This matches the behavior expected from a search operation
        continue;
      }

      // Apply view filter - This will be removed when we pass the viewfilter along
      // to the underlying store, but is here now for the interface.
      for (const scope in document.state) {
        if (!matchesScope(view, scope)) {
          delete document.state[scope as keyof PHBaseState];
        }
      }

      documents.push(document);
    }

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Apply paging
    const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || documents.length;
    const pagedDocuments = documents.slice(startIndex, startIndex + limit);

    // Create paged results
    const hasMore = startIndex + limit < documents.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: pagedDocuments,
      options: paging || { cursor: "0", limit: documents.length },
      nextCursor,
      next: hasMore
        ? () =>
            this.findByIds(ids, view, { cursor: nextCursor!, limit }, signal)
        : undefined,
    };
  }

  /**
   * Finds documents by their slugs
   */
  private async findBySlugs(
    slugs: string[],
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    const documents: PHDocument[] = [];

    // Use storage to resolve slugs to IDs
    let ids: string[];
    try {
      ids = await this.documentStorage.resolveIds(slugs, signal);
    } catch {
      // If slug resolution fails, return empty results
      // This matches the behavior expected from a search operation
      ids = [];
    }

    // Fetch each document by resolved ID
    for (const id of ids) {
      if (signal?.aborted) {
        throw new AbortError();
      }

      let document: PHDocument;
      try {
        document = await this.documentStorage.get<PHDocument>(id);
      } catch {
        // Skip documents that don't exist or can't be accessed
        continue;
      }

      // Apply view filter - This will be removed when we pass the viewfilter along
      // to the underlying store, but is here now for the interface.
      for (const scope in document.state) {
        if (!matchesScope(view, scope)) {
          delete document.state[scope as keyof PHBaseState];
        }
      }

      documents.push(document);
    }

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Apply paging - this will be removed when we pass the paging along
    // to the underlying store, but is here now for the interface.
    const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || documents.length;
    const pagedDocuments = documents.slice(startIndex, startIndex + limit);

    // Create paged results
    const hasMore = startIndex + limit < documents.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: pagedDocuments,
      options: paging || { cursor: "0", limit: documents.length },
      nextCursor,
      next: hasMore
        ? () =>
            this.findBySlugs(
              slugs,
              view,
              { cursor: nextCursor!, limit },
              signal,
            )
        : undefined,
    };
  }

  /**
   * Finds documents by parent ID
   */
  private async findByParentId(
    parentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    // Get child document IDs from storage
    const childIds = await this.documentStorage.getChildren(parentId);

    if (signal?.aborted) {
      throw new AbortError();
    }

    const documents: PHDocument[] = [];

    // Fetch each child document
    for (const childId of childIds) {
      if (signal?.aborted) {
        throw new AbortError();
      }

      let document: PHDocument;
      try {
        document = await this.documentStorage.get<PHDocument>(childId);
      } catch {
        // Skip documents that don't exist or can't be accessed
        // This matches the behavior expected from a search operation
        continue;
      }

      // Apply view filter - This will be removed when we pass the viewfilter along
      // to the underlying store, but is here now for the interface.
      for (const scope in document.state) {
        if (!matchesScope(view, scope)) {
          delete document.state[scope as keyof PHBaseState];
        }
      }

      documents.push(document);
    }

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Apply paging
    const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || documents.length;
    const pagedDocuments = documents.slice(startIndex, startIndex + limit);

    // Create paged results
    const hasMore = startIndex + limit < documents.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: pagedDocuments,
      options: paging || { cursor: "0", limit: documents.length },
      nextCursor,
      next: hasMore
        ? () =>
            this.findByParentId(
              parentId,
              view,
              { cursor: nextCursor!, limit },
              signal,
            )
        : undefined,
    };
  }

  /**
   * Finds documents by type
   */
  private async findByType(
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    const documents: PHDocument[] = [];

    // Use storage's findByType method directly
    const cursor = paging?.cursor;
    const limit = paging?.limit || 100;

    // Get document IDs of the specified type
    const { documents: documentIds, nextCursor } =
      await this.documentStorage.findByType(type, limit, cursor);

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Fetch each document by its ID
    for (const documentId of documentIds) {
      if (signal?.aborted) {
        throw new AbortError();
      }

      let document: PHDocument;
      try {
        document = await this.documentStorage.get<PHDocument>(documentId);
      } catch {
        // Skip documents that can't be retrieved
        continue;
      }

      // Apply view filter
      for (const scope in document.state) {
        if (!matchesScope(view, scope)) {
          delete document.state[scope as keyof PHBaseState];
        }
      }

      documents.push(document);
    }

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Results are already paged from the storage layer
    return {
      results: documents,
      options: paging || { cursor: cursor || "0", limit },
      nextCursor,
      next: nextCursor
        ? async () =>
            this.findByType(type, view, { cursor: nextCursor, limit }, signal)
        : undefined,
    };
  }
}
