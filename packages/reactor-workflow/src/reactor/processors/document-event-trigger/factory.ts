import type {
  IRelationalDb,
  ProcessorApp,
  ProcessorFactory,
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { PHDocumentHeader } from "document-model";
import type { WorkflowRuntimeService } from "../../service.js";
import { DocumentEventTrigger } from "./processor.js";

/** Creates the runtime's document-event processor, one per host. */
export function createDocumentEventProcessorFactory(
  runtime: WorkflowRuntimeService,
  relationalDb: IRelationalDb,
): ProcessorFactory {
  // One live instance serves every drive: the manager routes operations by
  // filter, not drive, so per-drive instances would each deliver every op.
  let live: DocumentEventTrigger | undefined;

  return async (
    driveHeader: PHDocumentHeader,
    _processorApp?: ProcessorApp,
  ): Promise<ProcessorRecord[]> => {
    if (live) return [];

    const namespace = DocumentEventTrigger.getNamespace(driveHeader.id);
    const store =
      await relationalDb.createNamespace<DocumentEventTrigger>(namespace);

    // An omitted field matches every value; only documentId honours "*".
    // The "document" scope carries CREATE_DOCUMENT / DELETE_DOCUMENT and the
    // parent "child" relationships, which back the lifecycle triggers; a
    // global-only filter would drop every one of them.
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      scope: ["global", "document"],
    };

    const processor = new DocumentEventTrigger(
      namespace,
      filter,
      store,
      runtime,
    );
    // The runtime stops with the processor: onDisconnect is the only teardown
    // that fires on hot reloads, so timers and run children never leak.
    processor.onDisconnectCallback = () => {
      if (live === processor) {
        live = undefined;
        runtime.shutdown();
      }
    };

    // Run the processor's migrations. Nothing in the runtime calls this, so
    // without it the first write hits a database with no tables.
    await processor.initAndUpgrade();
    live = processor;

    return [
      {
        processor,
        filter,
        // Triggers react to new operations only; never replay history.
        startFrom: "current",
        id: "document-event-trigger",
      },
    ];
  };
}
