import {
  isPurgeMarker,
  type OperationWithContext,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import type { PurgeMarkerContext } from "../events/types.js";
import type { IReadModel } from "../read-models/interfaces.js";
import { DocumentNotFoundError } from "../shared/errors.js";
import { RelationshipChangeType } from "../shared/types.js";
import type { IDocumentView } from "../storage/interfaces.js";
import type { ReactorSubscriptionManager } from "./react-subscription-manager.js";

/**
 * A read model that notifies the subscription manager when operations are processed.
 * This bridges the gap between operation processing and subscription callbacks.
 *
 * Must be processed AFTER other read models have completed and AFTER READ_READY
 * is emitted, so that reactor.get() returns fresh data when callbacks fire.
 */
export class SubscriptionNotificationReadModel implements IReadModel {
  readonly name = "subscription-notification";

  constructor(
    private subscriptionManager: ReactorSubscriptionManager,
    private documentView?: IDocumentView,
  ) {}

  async indexOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) return;

    const created: string[] = [];
    const deleted: string[] = [];
    const updatedIds = new Set<string>();
    const purgedIds = new Set<string>();
    const documentTypes = new Map<string, string>();
    const parentIds = new Map<string, string | null>();

    for (const item of operations) {
      const { operation, context } = item;
      const actionType = operation.action.type;

      documentTypes.set(context.documentId, context.documentType);

      if (isPurgeMarker(operation)) {
        purgedIds.add(context.documentId);
        // An already-deleted document had its Deleted notice at the deletion.
        if ((context as PurgeMarkerContext).appliedDeletion) {
          deleted.push(context.documentId);
        }
      } else if (actionType === "CREATE_DOCUMENT") {
        created.push(context.documentId);
      } else if (actionType === "DELETE_DOCUMENT") {
        const input = operation.action.input as { documentId?: string };
        const deletedId = input.documentId ?? context.documentId;
        deleted.push(deletedId);
      } else if (actionType === "ADD_RELATIONSHIP") {
        const input = operation.action.input as {
          sourceId: string;
          targetId: string;
          childType?: string;
        };
        this.subscriptionManager.notifyRelationshipChanged(
          input.sourceId,
          input.targetId,
          RelationshipChangeType.Added,
          input.childType,
        );
      } else if (actionType === "REMOVE_RELATIONSHIP") {
        const input = operation.action.input as {
          sourceId: string;
          targetId: string;
          childType?: string;
        };
        this.subscriptionManager.notifyRelationshipChanged(
          input.sourceId,
          input.targetId,
          RelationshipChangeType.Removed,
          input.childType,
        );
      } else {
        if (!created.includes(context.documentId)) {
          updatedIds.add(context.documentId);
        }
      }
    }

    if (created.length > 0) {
      this.subscriptionManager.notifyDocumentsCreated(
        created,
        documentTypes,
        parentIds,
      );
    }

    if (deleted.length > 0) {
      this.subscriptionManager.notifyDocumentsDeleted(
        deleted,
        documentTypes,
        parentIds,
      );
    }

    for (const id of purgedIds) updatedIds.delete(id);

    if (updatedIds.size > 0 && this.documentView) {
      const documentView = this.documentView;
      const documents = await Promise.all(
        Array.from(updatedIds).map((id) => this.readUpdated(documentView, id)),
      );
      const present = documents.filter(
        (document): document is PHDocument => document !== undefined,
      );
      if (present.length > 0) {
        this.subscriptionManager.notifyDocumentsUpdated(present);
      }
    }
  }

  /** Undefined for a document gone since its update; others still notify. */
  private async readUpdated(
    documentView: IDocumentView,
    id: string,
  ): Promise<PHDocument | undefined> {
    try {
      return await documentView.get(id);
    } catch (error) {
      if (DocumentNotFoundError.isError(error)) return undefined;
      throw error;
    }
  }
}
