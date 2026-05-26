import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import type { ProcessorFactory, ProcessorRecord } from "@powerhousedao/shared/processors";

import { OpenPanelProcessor, type OpenPanelTracker } from "./processor.js";
import type { OpenPanelEventMapping } from "./types.js";

// ---------------------------------------------------------------------------
// Factory config
// ---------------------------------------------------------------------------

export type OpenPanelProcessorFactoryConfig = {
  /** The initialized analytics client to forward events to. */
  client: OpenPanelTracker;

  /**
   * Loaded event mapping data — the object returned by `loadEvents()` from
   * `./events.ts`.  Passed here so the factory and processor do not re-parse
   * `events.json` on every drive connect.
   */
  events: {
    mappings: readonly OpenPanelEventMapping[];
    lookupMap: Map<string, Map<string, OpenPanelEventMapping>>;
  };

  /**
   * Controls the replay window for the processor.
   * Defaults to `"current"` — historical operations are not replayed into
   * analytics.
   */
  startFrom?: "current" | "beginning";

  /**
   * Optional error handler.  Receives the caught error plus the operation
   * that triggered it.  Defaults to `console.warn`.
   */
  onError?: (err: unknown, op?: OperationWithContext) => void;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns a `ProcessorFactory` that, for each drive, creates a single
 * `OpenPanelProcessor` record whose `filter.documentType` is the union of all
 * document types present in the event mapping table.
 *
 * Usage:
 * ```ts
 * const factory = createOpenPanelProcessorFactory({
 *   client,
 *   events: loadEvents(),
 *   startFrom: "current",
 * });
 * processorManager.registerFactory("openpanel", factory);
 * ```
 */
export function createOpenPanelProcessorFactory(
  config: OpenPanelProcessorFactoryConfig,
): ProcessorFactory {
  return function openPanelProcessorFactory(
    _driveHeader: PHDocumentHeader,
  ): ProcessorRecord[] {
    const documentType = Array.from(config.events.lookupMap.keys());

    const processor = new OpenPanelProcessor(
      config.client,
      config.events.lookupMap,
      config.onError,
    );

    const record: ProcessorRecord = {
      processor,
      filter: { documentType },
      startFrom: config.startFrom ?? "current",
    };

    return [record];
  };
}
