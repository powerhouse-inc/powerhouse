import type { PHDocument } from "document-model";
import type {
  PagedResults,
  RelationshipChangeType,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";
import type { IReactorSubscriptionManager } from "./types.js";

type DocumentCreatedCallback = (result: PagedResults<string>) => void;
type DocumentDeletedCallback = (documentIds: string[]) => void;
type DocumentStateUpdatedCallback = (result: PagedResults<PHDocument>) => void;
type RelationshipChangedCallback = (
  parentId: string,
  childId: string,
  changeType: RelationshipChangeType,
) => void;

type Subscription<T> = {
  id: string;
  callback: T;
  search?: SearchFilter;
  view?: ViewFilter;
};

export class ReactorSubscriptionManager implements IReactorSubscriptionManager {
  private createdSubscriptions = new Map<
    string,
    Subscription<DocumentCreatedCallback>
  >();
  private deletedSubscriptions = new Map<
    string,
    Subscription<DocumentDeletedCallback>
  >();
  private updatedSubscriptions = new Map<
    string,
    Subscription<DocumentStateUpdatedCallback>
  >();
  private relationshipSubscriptions = new Map<
    string,
    Subscription<RelationshipChangedCallback>
  >();

  private subscriptionCounter = 0;

  onDocumentCreated(
    callback: DocumentCreatedCallback,
    search?: SearchFilter,
  ): () => void {
    const id = `created-${++this.subscriptionCounter}`;
    this.createdSubscriptions.set(id, { id, callback, search });

    return () => {
      this.createdSubscriptions.delete(id);
    };
  }

  onDocumentDeleted(
    callback: DocumentDeletedCallback,
    search?: SearchFilter,
  ): () => void {
    const id = `deleted-${++this.subscriptionCounter}`;
    this.deletedSubscriptions.set(id, { id, callback, search });

    return () => {
      this.deletedSubscriptions.delete(id);
    };
  }

  onDocumentStateUpdated(
    callback: DocumentStateUpdatedCallback,
    search?: SearchFilter,
    view?: ViewFilter,
  ): () => void {
    const id = `updated-${++this.subscriptionCounter}`;
    this.updatedSubscriptions.set(id, { id, callback, search, view });

    return () => {
      this.updatedSubscriptions.delete(id);
    };
  }

  onRelationshipChanged(
    callback: RelationshipChangedCallback,
    search?: SearchFilter,
  ): () => void {
    const id = `relationship-${++this.subscriptionCounter}`;
    this.relationshipSubscriptions.set(id, { id, callback, search });

    return () => {
      this.relationshipSubscriptions.delete(id);
    };
  }

  /**
   * Notify subscribers about created documents
   */
  notifyDocumentsCreated(
    documentIds: string[],
    documentTypes?: Map<string, string>,
    parentIds?: Map<string, string | null>,
  ): void {
    const result: PagedResults<string> = {
      results: documentIds,
      options: { cursor: "", limit: documentIds.length },
    };

    for (const subscription of this.createdSubscriptions.values()) {
      const filteredIds = this.filterDocumentIds(
        documentIds,
        subscription.search,
        documentTypes,
        parentIds,
      );

      if (filteredIds.length > 0) {
        subscription.callback({
          ...result,
          results: filteredIds,
        });
      }
    }
  }

  /**
   * Notify subscribers about deleted documents
   */
  notifyDocumentsDeleted(
    documentIds: string[],
    documentTypes?: Map<string, string>,
    parentIds?: Map<string, string | null>,
  ): void {
    for (const subscription of this.deletedSubscriptions.values()) {
      const filteredIds = this.filterDocumentIds(
        documentIds,
        subscription.search,
        documentTypes,
        parentIds,
      );

      if (filteredIds.length > 0) {
        subscription.callback(filteredIds);
      }
    }
  }

  /**
   * Notify subscribers about updated documents
   */
  notifyDocumentsUpdated(documents: PHDocument[]): void {
    const result: PagedResults<PHDocument> = {
      results: documents,
      options: { cursor: "", limit: documents.length },
    };

    for (const subscription of this.updatedSubscriptions.values()) {
      const filteredDocs = this.filterDocuments(documents, subscription.search);

      if (filteredDocs.length > 0) {
        subscription.callback({
          ...result,
          results: filteredDocs,
        });
      }
    }
  }

  /**
   * Notify subscribers about relationship changes
   */
  notifyRelationshipChanged(
    parentId: string,
    childId: string,
    changeType: RelationshipChangeType,
    childType?: string,
  ): void {
    for (const subscription of this.relationshipSubscriptions.values()) {
      if (
        this.matchesRelationshipFilter(
          parentId,
          childId,
          childType,
          subscription.search,
        )
      ) {
        subscription.callback(parentId, childId, changeType);
      }
    }
  }

  /**
   * Clear all subscriptions
   */
  clearAll(): void {
    this.createdSubscriptions.clear();
    this.deletedSubscriptions.clear();
    this.updatedSubscriptions.clear();
    this.relationshipSubscriptions.clear();
  }

  private filterDocumentIds(
    documentIds: string[],
    search?: SearchFilter,
    documentTypes?: Map<string, string>,
    parentIds?: Map<string, string | null>,
  ): string[] {
    if (!search) return documentIds;

    return documentIds.filter((id) => {
      if (search.ids && !search.ids.includes(id)) return false;

      if (search.type && documentTypes) {
        const docType = documentTypes.get(id);
        if (docType !== search.type) return false;
      }

      if (search.parentId && parentIds) {
        const parentId = parentIds.get(id);
        if (parentId !== search.parentId) return false;
      }

      return true;
    });
  }

  private filterDocuments(
    documents: PHDocument[],
    search?: SearchFilter,
  ): PHDocument[] {
    if (!search) return documents;

    return documents.filter((doc) => {
      if (search.ids && !search.ids.includes(doc.header.id)) return false;
      if (search.type && doc.header.documentType !== search.type) return false;
      if (search.slugs && !search.slugs.includes(doc.header.slug)) return false;

      return true;
    });
  }

  private matchesRelationshipFilter(
    parentId: string,
    childId: string,
    childType?: string,
    search?: SearchFilter,
  ): boolean {
    if (!search) return true;

    if (search.parentId && parentId !== search.parentId) return false;
    if (search.ids && !search.ids.includes(childId)) return false;
    if (search.type && childType && childType !== search.type) return false;

    return true;
  }
}
