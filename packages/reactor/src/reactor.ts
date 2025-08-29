import type { BaseDocumentDriveServer } from "document-drive";
import type { IDocumentStorage } from "document-drive/storage/types";
import { AbortError } from "document-drive/utils/errors";
import type {
  Action,
  DocumentModelState,
  Operation,
  PHBaseState,
  PHDocument,
} from "document-model";
import { v4 as uuidv4 } from "uuid";
import type { IReactor } from "./interfaces/reactor.js";
import { createMutableShutdownStatus } from "./shared/factories.js";
import {
  JobStatus,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type SearchFilter,
  type ShutdownStatus,
  type ViewFilter,
} from "./shared/types.js";
import { matchesScope } from "./shared/utils.js";
import { filterByParentId, filterByType } from "./utils.js";

/**
 * The Reactor facade implementation.
 *
 * This class implements the IReactor interface and serves as the main entry point
 * for the new Reactor architecture. In Phase 2 of the refactoring plan, it acts
 * as a facade over the existing BaseDocumentDriveServer while we incrementally
 * migrate to the new architecture.
 *
 * The facade pattern allows us to:
 * 1. Present the new IReactor API to clients immediately
 * 2. Internally delegate to the refactored BaseDocumentDriveServer (post Phase 1)
 * 3. Incrementally replace internal implementations without breaking clients
 * 4. Validate the new architecture alongside the existing system
 */
export class Reactor implements IReactor {
  private driveServer: BaseDocumentDriveServer;
  private documentStorage: IDocumentStorage;
  private shutdownStatus: ShutdownStatus;
  private setShutdown: (value: boolean) => void;

  constructor(
    driveServer: BaseDocumentDriveServer,
    documentStorage: IDocumentStorage,
  ) {
    this.driveServer = driveServer;
    this.documentStorage = documentStorage;

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
  ): Promise<PagedResults<DocumentModelState>> {
    // Get document model modules from the drive server
    // Note: BaseDocumentDriveServer provides modules, not model states
    // This is an adaptation layer that converts modules to states
    const modules = this.driveServer.getDocumentModelModules();

    // Convert modules to DocumentModelState format
    // TODO: Proper conversion when DocumentModelState structure is finalized
    const filteredModels = modules
      .filter(
        (module) =>
          !namespace || module.documentModel.name.startsWith(namespace),
      )
      .map(
        (module) =>
          ({
            id: module.documentModel.id,
            name: module.documentModel.name,
            extension: module.documentModel.extension,
            author: module.documentModel.author,
            description: module.documentModel.description || "",
            specifications: module.documentModel.specifications,
          }) as DocumentModelState,
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
        // eslint-disable-next-line
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
  async create(document: PHDocument, signal?: AbortSignal): Promise<JobStatus> {
    try {
      // BaseDocumentDriveServer uses addDocument, not createDocument
      // addDocument adds an existing document to a drive
      await this.driveServer.addDocument(document);

      // Return success status
      // TODO: Phase 4 - This will return a job that goes through the queue
      return JobStatus.COMPLETED;
    } catch (error) {
      // TODO: Phase 4 - This will return a job that can be retried
      return JobStatus.FAILED;
    }
  }

  /**
   * Deletes a document
   */
  async deleteDocument(
    id: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const jobId = uuidv4();

    try {
      // Delete document using drive server
      await this.driveServer.deleteDocument(id);

      // TODO: Implement cascade deletion when propagate mode is CASCADE

      // Return success job info
      // TODO: Phase 4 - This will return a job that goes through the queue
      return {
        id: jobId,
        status: JobStatus.COMPLETED,
      };
    } catch (error) {
      // TODO: Phase 4 - This will return a job that can be retried
      return {
        id: jobId,
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Applies a list of actions to a document
   */
  async mutate(id: string, actions: Action[]): Promise<JobInfo> {
    const jobId = uuidv4();

    try {
      // BaseDocumentDriveServer expects Operations, not Actions
      // We need to convert Actions to Operations
      const operations: Operation[] = actions.map((action, index) => ({
        index: index,
        timestampUtcMs: action.timestampUtcMs,
        hash: "", // Will be computed by the server
        skip: 0,
        action: action,
      }));

      // Apply operations to document
      await this.driveServer.addOperations(id, operations);

      // Return success job info
      // TODO: Phase 4 - This will return a job that goes through the queue
      return {
        id: jobId,
        status: JobStatus.COMPLETED,
      };
    } catch (error) {
      // TODO: Phase 4 - This will return a job that can be retried
      return {
        id: jobId,
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
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
    const jobId = uuidv4();

    try {
      // TODO: Implement when drive server supports hierarchical documents
      // For now, this is a placeholder implementation

      // Verify parent exists
      await this.driveServer.getDocument(parentId);

      // Verify all children exist
      for (const childId of documentIds) {
        await this.driveServer.getDocument(childId);
      }

      // TODO: Actually establish parent-child relationships

      // Return success job info
      return {
        id: jobId,
        status: JobStatus.COMPLETED,
      };
    } catch (error) {
      return {
        id: jobId,
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
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
    const jobId = uuidv4();

    try {
      // TODO: Implement when drive server supports hierarchical documents
      // For now, this is a placeholder implementation

      // Verify parent exists
      await this.driveServer.getDocument(parentId);

      // TODO: Actually remove parent-child relationships

      // Return success job info
      return {
        id: jobId,
        status: JobStatus.COMPLETED,
      };
    } catch (error) {
      return {
        id: jobId,
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Retrieves the status of a job
   */
  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    // TODO: Phase 3 - Implement once IQueue and job tracking is in place
    // For now, return a not found status
    return {
      id: jobId,
      status: JobStatus.FAILED,
      error: "Job tracking not yet implemented",
    };
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
          // eslint-disable-next-line
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
          // eslint-disable-next-line
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
          // eslint-disable-next-line
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
          // eslint-disable-next-line
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
