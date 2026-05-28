import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import type {
  ProcessorFactory,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";

import { OpenPanelProcessor, type OpenPanelTracker } from "./processor.js";
import type { OpenPanelEventMapping } from "./types.js";

export type OpenPanelProcessorFactoryConfig = {
  /** The initialized analytics client to forward events to. */
  client: OpenPanelTracker;

  /** Loaded event mapping data, as returned by `loadEvents()`. */
  events: {
    mappings: readonly OpenPanelEventMapping[];
    lookupMap: Map<string, Map<string, OpenPanelEventMapping>>;
  };

  /** Replay window. Defaults to `"current"` (no historical replay). */
  startFrom?: "current" | "beginning";

  /** Error handler; defaults to `console.warn`. */
  onError?: (err: unknown, op?: OperationWithContext) => void;
};

/**
 * Returns a `ProcessorFactory` that, for each drive, creates a single
 * `OpenPanelProcessor` record whose `filter.documentType` is the union of all
 * document types present in the event mapping table.
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
