import type { Operation } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { type AtomicTxn as IAtomicTxn } from "./interfaces.js";
import type { InsertableOperation } from "./kysely/types.js";

export class AtomicTransaction implements IAtomicTxn {
  private operations: InsertableOperation[] = [];

  constructor(
    private documentId: string,
    private documentType: string,
    private scope: string,
    private branch: string,
    private baseRevision: number,
  ) {
    //
  }

  addOperations(...operations: Operation[]): void {
    for (const op of operations) {
      this.operations.push({
        // WRONG -- we should be using the jobId
        jobId: uuidv4(),
        opId: op.id,
        prevOpId: "", // Will be set during apply
        documentId: this.documentId,
        documentType: this.documentType,
        scope: this.scope,
        branch: this.branch,
        timestampUtcMs: new Date(op.timestampUtcMs),
        index: op.index,
        action: JSON.stringify(op.action),
        skip: op.skip,
        error: op.error || null,
        hash: op.hash,
      });
    }
  }

  getOperations(): InsertableOperation[] {
    return this.operations;
  }
}
