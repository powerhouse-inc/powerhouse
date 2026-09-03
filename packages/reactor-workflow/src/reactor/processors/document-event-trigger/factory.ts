import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFactoryBuilder,
  ProcessorFilter,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { workflowRuntime } from "../../subgraphs/workflow-runtime/service.js";
import { DocumentEventTrigger } from "./processor.js";

// One live instance serves every drive: the manager routes operations by
// filter, not drive, so per-drive instances would each deliver every op.
let live: DocumentEventTrigger | undefined;

export const documentEventTriggerFactoryBuilder: ProcessorFactoryBuilder =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader, _processorApp?: ProcessorApp) => {
    if (live) return [];

    const namespace = DocumentEventTrigger.getNamespace(driveHeader.id);
    const store =
      await module.relationalDb.createNamespace<DocumentEventTrigger>(
        namespace,
      );

    // An omitted field matches every value; only documentId honours "*".
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      scope: ["global"],
    };

    const processor = new DocumentEventTrigger(namespace, filter, store);
    // The supervisor stops with the processor: onDisconnect is the only
    // teardown that fires on hot reloads, so timers never leak.
    processor.onDisconnectCallback = () => {
      if (live === processor) {
        live = undefined;
        workflowRuntime.stopTriggerSupervisor();
      }
    };

    // Run the processor's migrations. Nothing in the runtime calls this, so
    // without it the first write hits a database with no tables.
    await processor.initAndUpgrade();
    live = processor;
    workflowRuntime.startTriggerSupervisor();

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
