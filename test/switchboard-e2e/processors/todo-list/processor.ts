import { type IRelationalDb } from "document-drive/processors/types";
import { RelationalDbProcessor } from "document-drive/processors/relational";
import { type InternalTransmitterUpdate } from "document-drive";
import type { TodoListDocument } from "../../document-models/todo-list/index.js";

import { up } from "./migrations.js";
import { type DB } from "./schema.js";

/**
 * TodoList Relational Database Processor
 * 
 * Following the exact implementation pattern from the RelationalDbProcessor documentation.
 * This processor listens to TodoList document operations and transforms them into 
 * relational database entries for querying via GraphQL.
 */
export class TodoListProcessor extends RelationalDbProcessor<DB> {
  // Generate a unique namespace for this processor based on the drive ID
  static override getNamespace(driveId: string): string {
    return super.getNamespace(driveId);
  }
  // Initialize the processor and run database migrations
  override async initAndUpgrade(): Promise<void> {
    console.log(`[TodoListProcessor] Running database migrations for namespace: ${this.namespace}`);
    await up(this.relationalDb);
  }

  // Main processing logic - handles incoming document changes
  override async onStrands(
    strands: InternalTransmitterUpdate[],
  ): Promise<void> {
    // Early return if no changes to process
    if (strands.length === 0) {
      return;
    }

    console.log(`[TodoListProcessor] Processing ${strands.length} strand(s)`);

    // Process each strand (batch of changes) individually
    for (const strand of strands) {
      // Skip strands with no operations
      if (strand.operations.length === 0) {
        continue;
      }

      console.log(`[TodoListProcessor] Processing strand: doc=${strand.documentId}, ops=${strand.operations.length}`);

      // Process each operation within the strand
      for (const operation of strand.operations) {
        try {
          // Insert a record for each operation following documentation pattern
          await this.relationalDb
            .insertInto("todo")
            .values({
              // Create task ID combining document ID, operation index, and type (from docs)
              task: `${strand.documentId}-${operation.index}: ${operation.action.type}`,
              status: true, // Default to completed status (from docs)
            })
            // Handle conflicts by doing nothing if the task already exists
            .onConflict((oc) => oc.column("task").doNothing())
            .execute();

          console.log(`[TodoListProcessor] Indexed operation: ${operation.action.type}`);
        } catch (error) {
          console.error(`[TodoListProcessor] Error indexing operation:`, error);
          // Continue processing other operations even if one fails
        }
      }
    }
  }

  // Cleanup method called when the processor disconnects
  async onDisconnect() {
    console.log(`[TodoListProcessor] Disconnecting processor for namespace: ${this.namespace}`);
    // Database cleanup would happen here in production
  }
}
