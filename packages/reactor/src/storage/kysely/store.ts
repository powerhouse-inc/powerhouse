import type { Operation, PHDocumentHeader } from "document-model";
import type { Kysely, Transaction } from "kysely";
import { v4 as uuidv4 } from "uuid";
import {
  DuplicateOperationError,
  RevisionMismatchError,
  type AtomicTxn,
  type IOperationStore,
} from "../interfaces.js";
import { AtomicTransaction } from "../txn.js";
import type { Database, InsertableOperation, OperationRow } from "./types.js";

export class KyselyOperationStore implements IOperationStore {
  constructor(private db: Kysely<Database>) {}

  async apply(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Check for abort signal
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      // Get the latest operation for this stream to verify revision
      const latestOp = await trx
        .selectFrom("Operation")
        .selectAll()
        .where("documentId", "=", documentId)
        .where("scope", "=", scope)
        .where("branch", "=", branch)
        .orderBy("index", "desc")
        .limit(1)
        .executeTakeFirst();

      // Check revision matches
      const currentRevision = latestOp ? latestOp.index : -1;
      if (currentRevision !== revision - 1) {
        throw new RevisionMismatchError(revision - 1, currentRevision);
      }

      // Create atomic transaction
      const atomicTxn = new AtomicTransaction(
        documentId,
        scope,
        branch,
        revision,
      );
      await fn(atomicTxn);

      // Get operations and header updates
      const operations = atomicTxn.getOperations();
      const headerUpdates = atomicTxn.getHeaderUpdates();

      // Insert operations
      if (operations.length > 0) {
        // Set prevOpId for each operation
        let prevOpId = latestOp?.opId || "";
        for (const op of operations) {
          op.prevOpId = prevOpId;
          prevOpId = op.opId;
        }

        try {
          await trx.insertInto("Operation").values(operations).execute();
        } catch (error: any) {
          if (error instanceof Error) {
            if (error.message.includes("unique constraint")) {
              // Extract the opId from the error if possible
              const opId = operations[0]?.opId || "unknown";
              throw new DuplicateOperationError(opId);
            }

            throw error;
          }

          throw error;
        }
      }

      // Update header if needed
      if (Object.keys(headerUpdates).length > 0) {
        await this.updateHeader(trx, documentId, branch, headerUpdates);
      }
    });
  }

  async getHeader(
    documentId: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<PHDocumentHeader> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // Get header operations from the 'header' scope
    const headerOps = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", "header")
      .where("branch", "=", branch)
      .where("index", "<=", revision)
      .orderBy("index", "asc")
      .execute();

    if (headerOps.length === 0) {
      throw new Error(`Document header not found: ${documentId}`);
    }

    // Reconstruct header from operations
    return this.reconstructHeader(headerOps);
  }

  async get(
    documentId: string,
    scope: string,
    branch: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<Operation> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("index", "=", index)
      .executeTakeFirst();

    if (!row) {
      throw new Error(
        `Operation not found: ${documentId}/${scope}/${branch}/${index}`,
      );
    }

    return this.rowToOperation(row);
  }

  private async updateHeader(
    trx: Transaction<Database>,
    documentId: string,
    branch: string,
    updates: Partial<PHDocumentHeader>,
  ): Promise<void> {
    // Get the latest header revision
    const latestHeader = await trx
      .selectFrom("Operation")
      .select(["index"])
      .where("documentId", "=", documentId)
      .where("scope", "=", "header")
      .where("branch", "=", branch)
      .orderBy("index", "desc")
      .limit(1)
      .executeTakeFirst();

    const nextIndex = (latestHeader?.index ?? -1) + 1;

    // Create a header update operation
    const headerOp: InsertableOperation = {
      jobId: uuidv4(),
      opId: uuidv4(),
      prevOpId: "", // Will be set if there's a previous header op
      documentId,
      scope: "header",
      branch,
      timestampUtcMs: new Date(),
      index: nextIndex,
      action: JSON.stringify({
        type: "UPDATE_HEADER",
        input: updates,
      }),
      skip: 0,
      hash: "", // Header updates don't need hash
    };

    await trx.insertInto("Operation").values(headerOp).execute();
  }

  private reconstructHeader(headerOps: OperationRow[]): PHDocumentHeader {
    // Start with a base header
    let header: PHDocumentHeader = {
      id: "",
      sig: { publicKey: {} as JsonWebKey, nonce: "" },
      documentType: "",
      createdAtUtcIso: "",
      slug: "",
      name: "",
      branch: "main",
      revision: {},
      lastModifiedAtUtcIso: "",
    };

    // Apply each header operation in order
    for (const op of headerOps) {
      const action = JSON.parse(op.action) as {
        type: string;
        input: Partial<PHDocumentHeader>;
      };

      if (action.type === "CREATE_HEADER") {
        // Initial header creation
        header = action.input as PHDocumentHeader;
      } else if (action.type === "UPDATE_HEADER") {
        // Header updates
        const updates = action.input as Partial<PHDocumentHeader>;
        header = { ...header, ...updates };
      }

      // Update revision tracking
      header.revision[op.scope] = op.index;
      header.lastModifiedAtUtcIso = op.timestampUtcMs.toISOString();
    }

    return header;
  }

  private rowToOperation(row: OperationRow): Operation {
    return {
      index: row.index,
      timestampUtcMs: row.timestampUtcMs.toISOString(),
      hash: row.hash,
      skip: row.skip,
      error: row.error || undefined,
      resultingState: row.resultingState || undefined,
      id: row.opId,
      action: JSON.parse(row.action) as Operation["action"],
    };
  }
}
