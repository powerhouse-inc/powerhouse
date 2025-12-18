import type { IReadModel } from "../read-models/interfaces.js";
import { RelationshipChangeType } from "../shared/types.js";
import type { OperationWithContext } from "../storage/interfaces.js";
import type { ReactorSubscriptionManager } from "./react-subscription-manager.js";

/**
 * A read model that notifies the subscription manager when operations are processed.
 * This bridges the gap between operation processing and subscription callbacks.
 *
 * Must be processed AFTER other read models have completed and AFTER OPERATIONS_READY
 * is emitted, so that reactor.get() returns fresh data when callbacks fire.
 */
export class SubscriptionNotificationReadModel implements IReadModel {
  constructor(private subscriptionManager: ReactorSubscriptionManager) {}

  indexOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) return Promise.resolve();

    const created: string[] = [];
    const deleted: string[] = [];
    const documentTypes = new Map<string, string>();
    const parentIds = new Map<string, string | null>();

    for (const item of operations) {
      const { operation, context } = item;
      const actionType = operation.action.type;

      documentTypes.set(context.documentId, context.documentType);

      if (actionType === "CREATE_DOCUMENT") {
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

    return Promise.resolve();
  }
}
