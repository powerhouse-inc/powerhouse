// The runtime's operation intake, as a reactor read model: the cursor beneath
// it makes an event written while the runtime was down catch up, not vanish.
import {
  BaseReadModel,
  defaultReadModelIndexingConfig,
  isPurgeMarker,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IOperationIndex,
  type IWriteCache,
  type ReadModelRegistrationStage,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "document-model";
import type { Kysely } from "kysely";
import type { WorkflowRuntimeService } from "./service.js";

export const WORKFLOW_TRIGGERS_READ_MODEL = "workflow-triggers";

// Post-ready, so a piece that reads the document that fired it sees the state
// that fired it. The host registers with this; the engine decides it.
export const WORKFLOW_TRIGGERS_READ_MODEL_STAGE: ReadModelRegistrationStage =
  "post_ready";

// Hands every batch to onOperations and keeps the reactor's ViewState cursor.
// Triggers fire forward only, so a first registration starts at head, not zero.
export class WorkflowTriggersReadModel extends BaseReadModel {
  constructor(
    db: Kysely<DocumentViewDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    private readonly runtime: WorkflowRuntimeService,
  ) {
    super(db, operationIndex, writeCache, consistencyTracker, {
      readModelId: WORKFLOW_TRIGGERS_READ_MODEL,
      rebuildStateOnInit: false,
      indexing: defaultReadModelIndexingConfig,
      startFrom: "head",
      // Runs live on the relational handle, and a fire must not hold a lock.
      purgeFence: "skip",
    });
  }

  // The only await that matters here: onOperations journals every matched fire
  // before it resolves, so the cursor a sweep moves never passes a lost event.
  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    const markers = items.filter((item) => isPurgeMarker(item.operation));
    if (markers.length === 0) {
      await this.runtime.onOperations(items);
      return;
    }
    await this.runtime.onOperations(
      items.filter((item) => !isPurgeMarker(item.operation)),
    );
    await this.runtime.onDocumentsPurged(
      markers.map((item) => item.context.documentId),
    );
  }
}
