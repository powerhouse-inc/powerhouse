import type {
  IRelationalDb,
  ProcessorApp,
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { PHDocumentHeader } from "document-model";
import type { AttachmentClientLike } from "../../attachment-port.js";
import { workflowRuntime } from "../../service.js";
import { DocumentEventTrigger } from "./processor.js";

// What the factory needs from the host module, named structurally so the engine
// does not depend on either host's module type.
export interface DocumentEventTriggerHost {
  relationalDb: IRelationalDb;
  attachments: AttachmentClientLike;
}

// One live instance serves every drive: the manager routes operations by
// filter, not drive, so per-drive instances would each deliver every op.
let live: DocumentEventTrigger | undefined;

export function documentEventTriggerFactoryBuilder(
  module: DocumentEventTriggerHost,
) {
  return async (
    driveHeader: PHDocumentHeader,
    _processorApp?: ProcessorApp,
  ): Promise<ProcessorRecord[]> => {
    if (live) return [];

    const namespace = DocumentEventTrigger.getNamespace(driveHeader.id);
    const store =
      await module.relationalDb.createNamespace<DocumentEventTrigger>(
        namespace,
      );

    // An omitted field matches every value; only documentId honours "*".
    // The "document" scope carries CREATE_DOCUMENT / DELETE_DOCUMENT and the
    // parent "child" relationships, which back the lifecycle triggers; a
    // global-only filter would drop every one of them.
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      scope: ["global", "document"],
    };

    const processor = new DocumentEventTrigger(namespace, filter, store);
    // The runtime stops with the processor: onDisconnect is the only teardown
    // that fires on hot reloads, so timers and run children never leak.
    processor.onDisconnectCallback = () => {
      if (live === processor) {
        live = undefined;
        workflowRuntime.shutdown();
      }
    };

    // Run the processor's migrations. Nothing in the runtime calls this, so
    // without it the first write hits a database with no tables.
    await processor.initAndUpgrade();
    live = processor;
    // The only host surface that carries an attachment client. The worker pool
    // lives in this process, so this is what turns ctx.files from an inline
    // data URI into a real attachment reference.
    workflowRuntime.setAttachments(module.attachments);
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
}
