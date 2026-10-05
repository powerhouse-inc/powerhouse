import { DocumentIntegrityService } from "../admin/document-integrity-service.js";
import type { InProcessReactorModule } from "../core/types.js";
import { InMemoryQueue } from "../queue/queue.js";
import {
  ReactorInspector,
  type ReactorInspectorComponents,
} from "./reactor-inspector.js";
import type {
  IInspectableAttachmentStore,
  IStorageHealthProvider,
} from "./types.js";

/**
 * The inspectable components of a reactor module built in this process.
 *
 * One definition rather than one per host, because "which live object answers
 * which inspection op" is a property of the reactor graph, not of the host that
 * assembled it: a browser monitor and a Switchboard must observe the same
 * reactor through the same wiring or their inspectors disagree about what a
 * field means. The two degradations are deliberate and stated here once:
 *
 * - the queue is inspectable only when it is the in-memory one, because
 *   `IInspectableQueue` is that implementation's debugging surface and not part
 *   of the `IQueue` contract. Another implementation reports empty queue state
 *   and REFUSES pause/resume by name, rather than accepting a pause it cannot
 *   perform (`ReactorInspector`).
 * - `storageHealth` is the caller's to supply. It is fed by the self-heal path
 *   that owns the PGlite session (W0.7/W0.8), which only a host that opened
 *   such a store has; a host without one gets the healthy, never-recreated
 *   default from `ReactorInspector`.
 */
export function reactorInspectorComponents(
  module: InProcessReactorModule,
  storageHealth?: IStorageHealthProvider,
  attachmentStore?: IInspectableAttachmentStore,
): ReactorInspectorComponents {
  return {
    queue: module.queue instanceof InMemoryQueue ? module.queue : undefined,
    processorManager: module.processorManager,
    catchUp: module.catchUp,
    integrity: new DocumentIntegrityService(
      module.keyframeStore,
      module.operationStore,
      module.writeCache,
      module.documentView,
      module.documentModelRegistry,
    ),
    storageHealth,
    documentModelRegistry: module.documentModelRegistry,
    reactor: module.reactor,
    attachmentStore,
  };
}

/**
 * The in-process `IInspector` over a built reactor module's live components
 * (W0.3). See {@link reactorInspectorComponents} for the wiring and its two
 * documented degradations.
 */
export function createReactorInspector(
  module: InProcessReactorModule,
  storageHealth?: IStorageHealthProvider,
  attachmentStore?: IInspectableAttachmentStore,
): ReactorInspector {
  return new ReactorInspector(
    reactorInspectorComponents(module, storageHealth, attachmentStore),
  );
}
