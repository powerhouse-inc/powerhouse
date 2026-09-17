// The runtime's operation intake, as a reactor read model: the cursor beneath
// it makes an event written while the runtime was down catch up, not vanish.
import {
  BaseReadModel,
  defaultReadModelIndexingConfig,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IOperationIndex,
  type IWriteCache,
  type ReadModelRegistrationStage,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "document-model";
import type { Kysely, Transaction } from "kysely";
import type { WorkflowRuntimeService } from "./service.js";

export const WORKFLOW_TRIGGERS_READ_MODEL = "workflow-triggers";

// Post-ready, so a piece that reads the document that fired it sees the state
// that fired it. The host registers with this; the engine decides it.
export const WORKFLOW_TRIGGERS_READ_MODEL_STAGE: ReadModelRegistrationStage =
  "post_ready";

// Hands every batch to onOperations and keeps the reactor's ViewState cursor.
// Triggers fire forward only, so a first registration starts at head, not zero.
export class WorkflowTriggersReadModel extends BaseReadModel {
  // Set by init() when no cursor row exists, cleared by the first batch that
  // writes one: nothing else tells a fresh registration from a restart.
  private freshRegistration = false;

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
    });
  }

  // No row means no backlog a trigger could want, so base init()'s ordinal-zero
  // row and full replay are precisely what a first registration must skip.
  override async init(): Promise<void> {
    if ((await this.loadState()) === undefined) {
      this.freshRegistration = true;
      return;
    }
    this.freshRegistration = false;
    await super.init();
  }

  // The fresh mark lifts only once a batch is through: a pass that threw rolled
  // back the insert below, and the batch after it has to write the row again.
  override async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;
    await super.indexOperations(items);
    this.freshRegistration = false;
  }

  // The only await that matters here: onOperations journals every matched fire
  // before it resolves, so the cursor saved after it never passes a lost event.
  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    await this.runtime.onOperations(items);
  }

  // super.saveState only UPDATEs, so the row init() skipped appears here, in the
  // transaction that first advances the cursor. Conflict-safe: a second process.
  protected override async saveState(
    trx: Transaction<DocumentViewDatabase>,
    items: OperationWithContext[],
  ): Promise<void> {
    if (this.freshRegistration) {
      await trx
        .insertInto("ViewState")
        .values({ readModelId: this.config.readModelId, lastOrdinal: 0 })
        .onConflict((oc) => oc.column("readModelId").doNothing())
        .execute();
    }
    await super.saveState(trx, items);
  }
}
