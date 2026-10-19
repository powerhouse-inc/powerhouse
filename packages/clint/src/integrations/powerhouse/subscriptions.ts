/**
 * Subscription bridge — maps Reactor document change events
 * to the ph-clint event bus.
 */

import type {
  IReactorClient,
  DocumentChangeEvent,
  SearchFilter,
} from "@powerhousedao/reactor";
import type {
  SubscriptionConfig,
  DocumentRegistry,
  AnyRegistry,
} from "./types.js";
import type { EmitFn } from "../../core/types.js";

/**
 * Bridge Reactor document subscriptions to the ph-clint event bus.
 *
 * @param client - IReactorClient from the built ReactorClientModule
 * @param subscriptions - Filter configuration for which document changes to bridge
 * @param emit - Event bus emit function from CommandContext
 * @returns Unsubscribe function
 */
export function bridgeSubscriptions<R extends DocumentRegistry = AnyRegistry>(
  client: IReactorClient,
  subscriptions: SubscriptionConfig<R>,
  emit: EmitFn<R>,
): () => void {
  // The runtime SearchFilter in @powerhousedao/reactor doesn't have
  // `documentTypes`; ph-clint's high-level SubscriptionConfig exposes it and
  // we forward it as an extra field. The Reactor currently ignores unknown
  // keys — this matches pre-existing behavior.
  const search: SearchFilter & { documentTypes?: string[] } = {};
  if (subscriptions.documentTypes) {
    search.documentTypes = subscriptions.documentTypes as string[];
  }

  return client.subscribe(search, (event: DocumentChangeEvent) => {
    try {
      switch (event.type) {
        case "created":
          for (const doc of event.documents ?? []) {
            emit("powerhouse:document:created", {
              documentId: doc.header.id,
              documentType: doc.header.documentType as keyof R & string,
            });
          }
          break;
        case "updated":
          emit("powerhouse:document:changed", {
            changeType: "updated",
            documents: event.documents as Array<
              R[keyof R & string]["document"]
            >,
          });
          break;
        case "deleted":
          for (const doc of event.documents ?? []) {
            emit("powerhouse:document:deleted", { documentId: doc.header.id });
          }
          break;
      }
    } catch {
      // Don't crash the event bus on subscription handler errors
    }
  });
}
