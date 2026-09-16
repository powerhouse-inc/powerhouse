import {
  RelationalDbProcessor,
  type IRelationalDb,
  type ProcessorFilter,
} from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import type { WorkflowRuntimeService } from "../../service.js";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

// Feeds every matched operation to the workflow runtime, which fires the
// ENABLED workflows whose document-event trigger matches (doc 08 §7.2).
export class DocumentEventTrigger extends RelationalDbProcessor<DB> {
  // Set by the factory to release its one-live-processor guard.
  onDisconnectCallback?: () => void;

  constructor(
    namespace: string,
    filter: ProcessorFilter,
    store: IRelationalDb<DB>,
    private readonly runtime: WorkflowRuntimeService,
  ) {
    super(namespace, filter, store);
  }

  onOperations(operations: OperationWithContext[]): Promise<void> {
    return this.runtime.onOperations(operations);
  }

  onDisconnect(): Promise<void> {
    this.onDisconnectCallback?.();
    return Promise.resolve();
  }

  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }
}
