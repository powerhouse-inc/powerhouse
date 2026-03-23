import type { Operation } from "@powerhousedao/shared/document-model";
import type { AtomicTxn } from "@powerhousedao/reactor";
import type { StoredOperation } from "./types.js";

export class HypercoreAtomicTransaction implements AtomicTxn {
  private operations: StoredOperation[] = [];

  constructor(
    private documentId: string,
    private documentType: string,
    private scope: string,
    private branch: string,
  ) {}

  addOperations(...operations: Operation[]): void {
    for (const op of operations) {
      this.operations.push({
        ...op,
        documentId: this.documentId,
        documentType: this.documentType,
        scope: this.scope,
        branch: this.branch,
      });
    }
  }

  getOperations(): StoredOperation[] {
    return this.operations;
  }
}
