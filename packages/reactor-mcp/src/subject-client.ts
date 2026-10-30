import type {
  ConsistencyToken,
  IReactorClient,
  NewDocumentOptions,
  OperationFilter,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import type {
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  DRIVE_DOCUMENT_TYPE,
  ReactorToolError,
  type ReactorToolClient,
  type ReactorToolWriteClient,
} from "./tools/index.js";

type DriveNodes = { global?: { nodes?: { id: string }[] } };

// The tool subset over a full client, reading as `subject`. Writes go through
// the write half and are judged as the client's signer.
export class SubjectScopedClient implements ReactorToolClient {
  readonly write: ReactorToolWriteClient & {
    evaluateActions: IReactorClient["write"]["evaluateActions"];
  };

  constructor(
    private readonly inner: IReactorClient,
    private readonly subject?: AuthSubject,
  ) {
    const write = inner.write;
    this.write = {
      create: (document, parentIdentifier, signal) =>
        write.create(document, parentIdentifier, signal),
      createEmpty: (documentType, options, signal) =>
        write.createEmpty(documentType, options, signal),
      execute: (id, branch, actions, signal) =>
        write.execute(id, branch, actions, signal),
      deleteDocument: async (id, propagate, signal) => {
        await this.assertNoHiddenFiling(id, signal);
        return write.deleteDocument(id, propagate, signal);
      },
      drives: {
        addFile: (driveId, document, parentFolder, signal) =>
          write.drives.addFile(driveId, document, parentFolder, signal),
      },
      evaluateActions: (id, branch, candidates, subject, signal) =>
        write.evaluateActions(id, branch, candidates, subject, signal),
    };
  }

  private view(view?: ViewFilter): ViewFilter | undefined {
    return this.subject ? { ...view, subject: this.subject } : view;
  }

  // A drive the subject cannot read would keep a node for the deleted document.
  private async assertNoHiddenFiling(id: string, signal?: AbortSignal) {
    if (!this.subject) return;
    const parents = await this.inner.getIncomingRelationships(
      id,
      "child",
      undefined,
      undefined,
      signal,
    );
    // Unreadable nodes count as filing it: the delete cannot rule that out.
    const hidden = parents.results.find((parent) => {
      if (parent.header.documentType !== DRIVE_DOCUMENT_TYPE) return false;
      const nodes = (parent.state as DriveNodes).global?.nodes;
      return !Array.isArray(nodes) || nodes.some((n) => n.id === id);
    });
    if (hidden) {
      throw new ReactorToolError(
        "FORBIDDEN",
        `Document ${id} is filed in drive ${hidden.header.id}, which you cannot change; it was not deleted`,
      );
    }
  }

  get<T extends PHDocument>(
    id: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.get<T>(id, this.view(view), signal, consistencyToken);
  }

  resolveIdOrSlug(
    id: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.resolveIdOrSlug(
      id,
      this.view(view),
      signal,
      consistencyToken,
    );
  }

  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.find(
      search,
      this.view(view),
      paging,
      signal,
      consistencyToken,
    );
  }

  getOperations(
    id: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.getOperations(
      id,
      this.view(view),
      filter,
      paging,
      signal,
    );
  }

  getOutgoingRelationships(
    id: string,
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.getOutgoingRelationships(
      id,
      type,
      this.view(view),
      paging,
      signal,
      consistencyToken,
    );
  }

  getIncomingRelationships(
    id: string,
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.getIncomingRelationships(
      id,
      type,
      this.view(view),
      paging,
      signal,
      consistencyToken,
    );
  }

  getOutgoingRelationshipEdges(
    id: string,
    type?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.getOutgoingRelationshipEdges(
      id,
      type,
      this.view(view),
      paging,
      signal,
      consistencyToken,
    );
  }

  getIncomingRelationshipEdges(
    id: string,
    type?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.getIncomingRelationshipEdges(
      id,
      type,
      this.view(view),
      paging,
      signal,
      consistencyToken,
    );
  }

  getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.getDocumentModelModules(namespace, paging, signal);
  }

  getDocumentModelModule(documentType: string) {
    return this.inner.getDocumentModelModule(documentType);
  }

  getDocumentModelModuleForDocument(document: PHDocument) {
    return this.inner.getDocumentModelModuleForDocument(document);
  }

  newDocument<T extends PHDocument = PHDocument>(
    documentType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.newDocument<T>(documentType, options, signal);
  }
}
