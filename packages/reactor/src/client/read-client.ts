import type {
  DocumentModelModule,
  Operation,
  PHDocument,
  ProtocolVersions,
  SignaturePolicy,
  Supports,
} from "@powerhousedao/shared/document-model";
import {
  normalizeDocumentModelVersion,
  selectProtocolVersions,
  UnsupportedDocumentModelVersionError,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { DriveCollectionId } from "../cache/operation-index-types.js";
import type { IReactor } from "../core/types.js";
import { assertAbsent } from "../decision/read-gate.js";
import type { IJobAwaiter } from "../shared/awaiter.js";
import {
  RelationshipChangeType,
  type ConsistencyToken,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ViewFilter,
} from "../shared/types.js";
import type {
  DocumentRelationship,
  IDocumentIndexer,
  IDocumentView,
  OperationFilter,
} from "../storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import {
  decodeCompositeCursor,
  encodeCompositeCursor,
  isCompositeCursor,
} from "./cursor.js";
import { type EventReads, EventReadsSource } from "./event-reads.js";
import { ReadGating } from "./internal/gating.js";
import type { ReactorClientParts } from "./internal/parts.js";
import {
  DocumentChangeType,
  type DocumentChangeEvent,
  type IReactorReadClient,
  type ProtocolSelection,
} from "./types.js";
import { withAllScopes, withAuthScope } from "./util.js";

/**
 * The in-process read half of the reactor client. Answers from the document
 * view, the document indexer and the subscription read model, always through
 * the read gate, and never enqueues a job.
 */
export class ReactorReadClient implements IReactorReadClient {
  private readonly logger: ILogger;
  private readonly reactor: IReactor;
  private readonly subscriptionManager: IReactorSubscriptionManager;
  private readonly jobAwaiter: IJobAwaiter;
  private readonly documentIndexer: IDocumentIndexer;
  private readonly documentView: IDocumentView;
  private readonly gating: ReadGating;
  private readonly eventReads: EventReadsSource;
  private readonly createSignaturePolicy: SignaturePolicy;
  private readonly protocolSelection: ProtocolSelection;

  constructor(parts: ReactorClientParts) {
    this.logger = parts.logger;
    this.reactor = parts.reactor;
    this.subscriptionManager = parts.subscriptionManager;
    this.jobAwaiter = parts.jobAwaiter;
    this.documentIndexer = parts.documentIndexer;
    this.documentView = parts.documentView;
    this.gating = new ReadGating(
      parts.reactor,
      parts.documentView,
      parts.readGate,
      parts.signer,
    );
    this.eventReads = new EventReadsSource(
      parts.reactor,
      parts.documentView,
      parts.readGate,
    );
    this.createSignaturePolicy = parts.createSignaturePolicy;
    this.protocolSelection = parts.protocolSelection;
  }

  async getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    this.logger.verbose(
      "getDocumentModels(@namespace, @paging)",
      namespace,
      paging,
    );
    return this.reactor.getDocumentModels(namespace, paging, signal);
  }

  async getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>> {
    const modules = await this.reactor.getDocumentModels();

    let latestModule: DocumentModelModule | undefined;
    let latestVersion = -1;
    for (const module of modules.results) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      const version = module.version ?? 1;
      if (version > latestVersion) {
        latestVersion = version;
        latestModule = module;
      }
    }

    if (!latestModule) {
      throw new Error(
        `Document model module not found for type: ${documentType}`,
      );
    }

    return latestModule as DocumentModelModule<any>;
  }

  /**
   * Retrieves the document model module matching the version the document is
   * stamped with, so not-yet-upgraded documents get the reducer their
   * history was written with rather than the latest.
   */
  async getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule<any>> {
    const documentType = document.header.documentType;
    const version = normalizeDocumentModelVersion(
      (document.state as Partial<typeof document.state>).document?.version,
    );

    const modules = await this.reactor.getDocumentModels();

    const availableVersions: number[] = [];
    for (const module of modules.results) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      const moduleVersion = normalizeDocumentModelVersion(module.version);
      if (moduleVersion === version) {
        return module as DocumentModelModule<any>;
      }
      availableVersions.push(moduleVersion);
    }

    throw new UnsupportedDocumentModelVersionError(
      documentType,
      version,
      availableVersions.sort((a, b) => a - b),
    );
  }

  async get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument> {
    this.logger.verbose("get(@identifier, @view)", identifier, view);
    const document = await this.reactor.getByIdOrSlug<TDocument>(
      identifier,
      withAuthScope(view),
      consistencyToken,
      signal,
    );
    return this.gating.gateDocument(document, view, signal);
  }

  async getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument[]> {
    this.logger.verbose("getMany(@count ids, @view)", documentIds.length, view);
    const documents = await this.documentView.getMany<TDocument>(
      documentIds,
      withAuthScope(view),
      consistencyToken,
      signal,
    );
    return Promise.all(
      documents.map((document) =>
        this.gating.gateDocument(document, view, signal),
      ),
    );
  }

  /**
   * Resolves an identifier (id or slug) to the canonical document id, using the
   * same lookup as the data path. Resolves against the "main" branch. Throws if
   * the identifier cannot be resolved or is ambiguous.
   */
  async resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<string> {
    return this.documentView.resolveIdOrSlug(
      identifier,
      view,
      consistencyToken,
      signal,
    );
  }

  async getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    this.logger.verbose(
      "getOperations(@documentIdentifier, @view, @filter, @paging)",
      documentIdentifier,
      view,
      filter,
      paging,
    );

    const documentId = await this.documentView.resolveIdOrSlug(
      documentIdentifier,
      view,
      undefined,
      signal,
    );

    // Read gate: exclude operations in scopes the subject may not read. The
    // fetch carries the scopes about to be paged, not the policy alone, because
    // a conditional read grant reads the state of the scope it gates; a
    // condition can name no other scope, so the scopes not paged are not owed.
    const gated = await this.reactor.getByIdOrSlug<PHDocument>(
      documentId,
      withAuthScope(view),
      undefined,
      signal,
    );
    const canRead = await this.gating.readableScopes(gated, view, signal);

    if (paging?.cursor && isCompositeCursor(paging.cursor)) {
      return this.getOperationsWithCompositeCursor(
        documentId,
        view,
        filter,
        paging,
        signal,
        canRead,
      );
    }

    const operationsByScope = await this.reactor.getOperations(
      documentId,
      view,
      filter,
      paging,
      undefined,
      signal,
    );

    for (const scope of Object.keys(operationsByScope)) {
      if (!canRead(scope)) {
        delete operationsByScope[scope];
      }
    }

    const scopeEntries = Object.entries(operationsByScope);
    const effectivePaging = paging || { cursor: "0", limit: 100 };

    if (scopeEntries.length <= 1) {
      const allOperations =
        scopeEntries.length === 1 ? [...scopeEntries[0][1].results] : [];
      allOperations.sort((a, b) => a.index - b.index);
      const nextCursor =
        scopeEntries.length === 1 ? scopeEntries[0][1].nextCursor : undefined;
      return { results: allOperations, options: effectivePaging, nextCursor };
    }

    const allOperations: Operation[] = [];
    const activeCursors: Record<string, string> = {};

    for (const [scopeName, scopeResults] of scopeEntries) {
      allOperations.push(...scopeResults.results);
      if (scopeResults.nextCursor) {
        activeCursors[scopeName] = scopeResults.nextCursor;
      }
    }

    allOperations.sort((a, b) => a.index - b.index);

    const nextCursor =
      Object.keys(activeCursors).length > 0
        ? encodeCompositeCursor(activeCursors)
        : undefined;

    return { results: allOperations, options: effectivePaging, nextCursor };
  }

  async getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose(
      "getOutgoingRelationships(@sourceIdentifier, @relationshipType, @view, @paging)",
      sourceIdentifier,
      relationshipType,
      view,
      paging,
    );

    const sourceId = await this.documentView.resolveIdOrSlug(
      sourceIdentifier,
      view,
      consistencyToken,
      signal,
    );

    const relationships = await this.documentIndexer.getOutgoing(
      sourceId,
      [relationshipType],
      undefined,
      consistencyToken,
      signal,
    );

    const targetIds = relationships.results.map((rel) => rel.targetId);

    if (targetIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.find(
      { ids: targetIds },
      view,
      paging,
      signal,
      consistencyToken,
    );
  }

  async getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose(
      "getIncomingRelationships(@targetIdentifier, @relationshipType, @view, @paging)",
      targetIdentifier,
      relationshipType,
      view,
      paging,
    );

    const targetId = await this.documentView.resolveIdOrSlug(
      targetIdentifier,
      view,
      consistencyToken,
      signal,
    );

    const relationships = await this.documentIndexer.getIncoming(
      targetId,
      [relationshipType],
      undefined,
      consistencyToken,
      signal,
    );

    const sourceIds = relationships.results.map((rel) => rel.sourceId);

    if (sourceIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.find(
      { ids: sourceIds },
      view,
      paging,
      signal,
      consistencyToken,
    );
  }

  async getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<DocumentRelationship>> {
    this.logger.verbose(
      "getOutgoingRelationshipEdges(@sourceIdentifier, @relationshipType, @view, @paging)",
      sourceIdentifier,
      relationshipType,
      view,
      paging,
    );

    const sourceId = await this.documentView.resolveIdOrSlug(
      sourceIdentifier,
      view,
      consistencyToken,
      signal,
    );

    const edges = await this.reactor.getOutgoingRelationshipEdges(
      sourceId,
      relationshipType,
      paging,
      consistencyToken,
      signal,
    );

    return this.gating.gateEdges(edges, "targetId", view, signal);
  }

  async getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<DocumentRelationship>> {
    this.logger.verbose(
      "getIncomingRelationshipEdges(@targetIdentifier, @relationshipType, @view, @paging)",
      targetIdentifier,
      relationshipType,
      view,
      paging,
    );

    const targetId = await this.documentView.resolveIdOrSlug(
      targetIdentifier,
      view,
      consistencyToken,
      signal,
    );

    const edges = await this.reactor.getIncomingRelationshipEdges(
      targetId,
      relationshipType,
      paging,
      consistencyToken,
      signal,
    );

    return this.gating.gateEdges(edges, "sourceId", view, signal);
  }

  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose("find(@search, @view, @paging)", search, view, paging);
    const results = await this.reactor.find(
      search,
      withAuthScope(view),
      paging,
      consistencyToken,
      signal,
    );
    return this.gating.gateListing(results, view, signal);
  }

  async isServed(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<boolean> {
    this.logger.verbose("isServed(@identifier, @view)", identifier, view);
    let document: PHDocument;
    try {
      document = await this.reactor.getByIdOrSlug(
        identifier,
        withAuthScope(view),
        undefined,
        signal,
      );
    } catch (error) {
      await assertAbsent(this.documentView, identifier, error, signal);
      return false;
    }
    return (await this.gating.gateListed(document, view, signal)) !== undefined;
  }

  getCreateSignaturePolicy(): Promise<SignaturePolicy> {
    return Promise.resolve(this.createSignaturePolicy);
  }

  async getCreateProtocolVersions(
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    const { capabilities, flags, agreement, collectionsOf } =
      this.protocolSelection;
    let members: Supports[] = [];
    if (parentIdentifier !== undefined && agreement) {
      let parentId: string | undefined;
      try {
        parentId = await this.resolveIdOrSlug(
          parentIdentifier,
          undefined,
          signal,
        );
      } catch {
        parentId = undefined;
      }
      if (parentId !== undefined) {
        const memberships = await collectionsOf([parentId]);
        const collectionIds = [
          ...(memberships[parentId] ?? []),
          DriveCollectionId.forDrive(parentId).key,
        ];
        members = [...agreement().members(collectionIds).values()];
      }
    }
    return selectProtocolVersions({ capabilities, flags, members });
  }

  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    this.logger.verbose("getJobStatus(@jobId)", jobId);
    return this.reactor.getJobStatus(jobId, signal);
  }

  async waitForJob(
    jobId: string | JobInfo,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const id = typeof jobId === "string" ? jobId : jobId.id;
    this.logger.verbose("waitForJob(@id)", id);
    return this.jobAwaiter.waitForJob(id, signal);
  }

  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    this.logger.verbose("subscribe(@search, @view)", search, view);

    // A subscription is a read, gated here because the subscription manager is
    // a read model, which sees everything. It is gated as a listing is: an
    // event for a document the subject can read no domain scope of is withheld.
    const served = async (
      type: DocumentChangeType,
      documents: PHDocument[],
      reads: EventReads,
    ): Promise<DocumentChangeEvent | undefined> => {
      const documentsServed = await this.gating.gateServedAll(
        documents,
        view,
        undefined,
        reads,
      );
      return documentsServed.length > 0
        ? { type, documents: documentsServed }
        : undefined;
    };

    let disposed = false;
    let delivering: Promise<void> = Promise.resolve();

    /**
     * Queues one event behind those already queued. Gating an event resolves
     * asynchronously, so an event needing a group fetch would otherwise be
     * overtaken by the one behind it, and one still in flight would reach a
     * subscriber that has already unsubscribed. Only delivery is ordered, not
     * the gating: a single subscription can cover every document in the
     * reactor, so serializing that work would make its delivery rate the sum
     * of every gate build rather than the slowest. An event that cannot be
     * gated is withheld, because serving it unfiltered would leak the scopes
     * the gate did not clear -- but it is logged rather than swallowed, since
     * the gate rethrows a transient failure precisely so it is not read as a
     * denial. An event that resolves to undefined was withheld.
     */
    const deliver = (event: Promise<DocumentChangeEvent | undefined>): void => {
      // Attached now, or a rejection while the chain is parked on real I/O
      // waits a full turn with no handler, which Node reports as unhandled.
      void Promise.resolve(event).catch(() => undefined);

      delivering = delivering
        .then(async () => {
          const built = await event;
          if (disposed || !built) {
            return;
          }
          callback(built);
        })
        .catch((error: unknown) => {
          this.logger.error(
            "Subscription delivery failed for @search: @Error",
            { search },
            error,
          );
        });
    };

    const unsubscribeCreated = this.subscriptionManager.onDocumentCreated(
      (result) => {
        const reads = this.eventReads.forEvent();
        deliver(
          (async () => {
            // Unnarrowed: a narrowed fetch could omit the policy, which the
            // gate reads as uninitialized, or every domain scope.
            const documents = await Promise.all(
              result.results.map((id) => reads.get(id, withAllScopes(view))),
            );
            return served(DocumentChangeType.Created, documents, reads);
          })(),
        );
      },
      search,
    );

    const unsubscribeDeleted = this.subscriptionManager.onDocumentDeleted(
      (documentIds, info) => {
        const reads = this.eventReads.forEvent();
        const purged = info?.purged ? { purged: true as const } : {};
        for (const childId of documentIds) {
          deliver(
            (async () =>
              (await this.gating.servesEvery([childId], view, reads))
                ? {
                    type: DocumentChangeType.Deleted,
                    documents: [],
                    context: { childId, ...purged },
                  }
                : undefined)(),
          );
        }
      },
      search,
    );

    const unsubscribeUpdated = this.subscriptionManager.onDocumentStateUpdated(
      (result) => {
        deliver(
          served(
            DocumentChangeType.Updated,
            result.results,
            this.eventReads.forEvent(),
          ),
        );
      },
      search,
      view,
    );

    const unsubscribeRelationship =
      this.subscriptionManager.onRelationshipChanged(
        (parentId, childId, changeType) => {
          const reads = this.eventReads.forEvent();
          deliver(
            (async () =>
              (await this.gating.servesEvery([parentId, childId], view, reads))
                ? {
                    type:
                      changeType === RelationshipChangeType.Added
                        ? DocumentChangeType.ChildAdded
                        : DocumentChangeType.ChildRemoved,
                    documents: [],
                    context: { parentId, childId },
                  }
                : undefined)(),
          );
        },
        search,
      );

    return () => {
      disposed = true;
      unsubscribeCreated();
      unsubscribeDeleted();
      unsubscribeUpdated();
      unsubscribeRelationship();
    };
  }

  private async getOperationsWithCompositeCursor(
    documentId: string,
    view: ViewFilter | undefined,
    filter: OperationFilter | undefined,
    paging: PagingOptions,
    signal: AbortSignal | undefined,
    canRead: (scope: string) => boolean,
  ): Promise<PagedResults<Operation>> {
    const scopeCursors = decodeCompositeCursor(paging.cursor);
    const allOperations: Operation[] = [];
    const activeCursors: Record<string, string> = {};

    for (const [scopeName, cursor] of Object.entries(scopeCursors)) {
      if (!canRead(scopeName)) {
        continue;
      }
      const scopeView: ViewFilter = { ...view, scopes: [scopeName] };
      const scopePaging: PagingOptions = { cursor, limit: paging.limit };

      const operationsByScope = await this.reactor.getOperations(
        documentId,
        scopeView,
        filter,
        scopePaging,
        undefined,
        signal,
      );

      const scopeResult = operationsByScope[scopeName];
      allOperations.push(...scopeResult.results);
      if (scopeResult.nextCursor) {
        activeCursors[scopeName] = scopeResult.nextCursor;
      }
    }

    allOperations.sort((a, b) => a.index - b.index);

    const nextCursor =
      Object.keys(activeCursors).length > 0
        ? encodeCompositeCursor(activeCursors)
        : undefined;

    return { results: allOperations, options: paging, nextCursor };
  }
}
