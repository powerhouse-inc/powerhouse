import type {
  Operation,
  PHDocumentHeader,
  PHDocumentMeta,
} from "document-model";
import { v4 as uuidv4 } from "uuid";
import { type AtomicTxn } from "./interfaces.js";
import type { InsertableOperation } from "./kysely/types.js";

export class AtomicTransaction implements AtomicTxn {
  private operations: InsertableOperation[] = [];
  private headerUpdates: Partial<PHDocumentHeader> = {};

  constructor(
    private documentId: string,
    private scope: string,
    private branch: string,
    private baseRevision: number,
  ) {
    //
  }

  addOperations(...operations: Operation[]): void {
    for (const op of operations) {
      this.operations.push({
        jobId: uuidv4(),
        opId: op.id || uuidv4(),
        prevOpId: "", // Will be set during apply
        documentId: this.documentId,
        scope: this.scope,
        branch: this.branch,
        timestampUtcMs: new Date(op.timestampUtcMs),
        index: op.index,
        action: JSON.stringify(op.action),
        skip: op.skip,
        resultingState: op.resultingState || null,
        error: op.error || null,
        hash: op.hash,
      });
    }
  }

  setSlug(slug: string): void {
    this.headerUpdates.slug = slug;
  }

  setName(name: string): void {
    this.headerUpdates.name = name;
  }

  setMeta(meta: PHDocumentMeta): void {
    this.headerUpdates.meta = meta;
  }

  getOperations(): InsertableOperation[] {
    return this.operations;
  }

  getHeaderUpdates(): Partial<PHDocumentHeader> {
    return this.headerUpdates;
  }
}
