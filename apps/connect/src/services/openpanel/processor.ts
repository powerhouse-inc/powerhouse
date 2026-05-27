import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { IProcessor } from "@powerhousedao/shared/processors";

import { buildDefaultProperties, deriveEventName } from "./events.js";
import type { OpenPanelEventMapping } from "./types.js";

// ---------------------------------------------------------------------------
// Client abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal structural type for the injected analytics client.
 *
 * Using a structural interface (rather than importing `OpenPanel` from
 * `@openpanel/web` directly) keeps the SDK out of the runtime import graph
 * when no client is provided and makes test fakes trivial.  The real
 * `OpenPanel` instance satisfies this type structurally.
 */
export type OpenPanelTracker = {
  track: (name: string, properties?: Record<string, unknown>) => unknown;
  flush?: () => void;
};

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * `OpenPanelProcessor` is a read-only reactor `IProcessor` that translates
 * matching document operations into OpenPanel analytics events.
 *
 * - Only operations whose `(documentType, actionType)` pair appears in the
 *   injected lookup map are forwarded; everything else is silently skipped.
 * - Each fired event carries the six default properties (`documentType`,
 *   `actionType`, `documentId`, `scope`, `branch`, `app: "connect"`).
 * - Per-operation errors (including rejected promises from `client.track`)
 *   are forwarded to `onError` and never thrown back to the manager.
 * - `onDisconnect` optional-chains `client.flush?.()` so the SDK can drain
 *   its internal queue before the processor is removed.
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

  async onDisconnect(): Promise<void> {
    this.client.flush?.();
  }
}
