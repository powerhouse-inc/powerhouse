import { RelationalDbProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";
import { workflowRuntime } from "../../subgraphs/workflow-runtime/service.js";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

// Feeds every matched operation to the workflow runtime, which fires the
// ENABLED workflows whose document-event trigger matches (doc 08 §7.2).
export class DocumentEventTrigger extends RelationalDbProcessor<DB> {
  // Set by the factory to release its singleton guard.
  onDisconnectCallback?: () => void;

  onOperations(operations: OperationWithContext[]): Promise<void> {
    return workflowRuntime.onOperations(operations);
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
