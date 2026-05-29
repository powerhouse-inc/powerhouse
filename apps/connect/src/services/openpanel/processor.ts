import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { IProcessor } from "@powerhousedao/shared/processors";

import { buildDefaultProperties, deriveEventName } from "./events.js";
import type { OpenPanelEventMapping } from "./types.js";

/**
 * Minimal structural type for the injected analytics client. Keeps
 * `@openpanel/web` out of the runtime import graph and makes test fakes
 * trivial; the real `OpenPanel` instance satisfies it structurally.
 */
export type OpenPanelTracker = {
  track: (name: string, properties?: Record<string, unknown>) => unknown;
  flush?: () => void;
};

/**
 * Read-only reactor `IProcessor` that translates matching document operations
 * into OpenPanel analytics events. Operations whose `(documentType, actionType)`
 * pair is absent from the lookup map are skipped; per-operation errors are
 * routed to `onError` and never thrown back to the manager.
 */
export class OpenPanelProcessor implements IProcessor {
  constructor(
    private readonly client: OpenPanelTracker,
    private readonly lookupMap: Map<string, Map<string, OpenPanelEventMapping>>,
    private readonly onError: (
      err: unknown,
      op?: OperationWithContext,
    ) => void = (err) =>
      console.warn("[OpenPanelProcessor] Error tracking event:", err),
  ) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const op of operations) {
      const inner = this.lookupMap.get(op.context.documentType);
      if (!inner) continue;

      const mapping = inner.get(op.operation.action.type);
      if (!mapping) continue;

      const name = deriveEventName(mapping, op);
      const payload = buildDefaultProperties(op);

      try {
        await this.client.track(name, payload);
      } catch (err) {
        this.onError(err, op);
      }
    }
  }

  onDisconnect(): Promise<void> {
    this.client.flush?.();
    return Promise.resolve();
  }
}
