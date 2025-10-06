import { type Operation, type PHDocumentHeader } from "document-model";
import { createPresignedHeader } from "document-model/core";
import type { Kysely } from "kysely";
import {
  DuplicateOperationError,
  RevisionMismatchError,
  type AtomicTxn,
  type IOperationStore,
} from "../interfaces.js";
import { AtomicTransaction } from "../txn.js";
import type { Database, OperationRow } from "./types.js";

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

  private reconstructHeader(
    orderedHeaderOps: OperationRow[],
  ): PHDocumentHeader {
    // Start with a base header
    let header = createPresignedHeader();

    // Apply each header operation in order
    for (const op of orderedHeaderOps) {
      const action = JSON.parse(op.action) as {
        type: string;
        model?: string;
        version?: string;
        signing?: {
          signature: string;
          publicKey: JsonWebKey;
          nonce: string;
          createdAtUtcIso: string;
          documentType: string;
        };
      };

      if (action.type === "CREATE_DOCUMENT") {
        // Extract header from CREATE_DOCUMENT action's signing parameters
        if (action.signing) {
          header = {
            ...header,
            id: action.signing.signature, // documentId === signing.signature
            documentType: action.signing.documentType,
            createdAtUtcIso: action.signing.createdAtUtcIso,
            lastModifiedAtUtcIso: action.signing.createdAtUtcIso,
            sig: {
              nonce: action.signing.nonce,
              publicKey: action.signing.publicKey,
            },
          };
        }
      } else if (action.type === "UPGRADE_DOCUMENT") {
        // UPGRADE_DOCUMENT doesn't modify header
        // Version is tracked elsewhere in the document (state or revision)
      }

      // Update revision tracking
      header.revision[op.scope] = op.index;
      header.lastModifiedAtUtcIso = op.timestampUtcMs.toISOString();
    }

    return header;
  }

  async getSince(
    documentId: string,
    scope: string,
    branch: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<Operation[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("index", ">", index)
      .orderBy("index", "asc")
      .execute();

    return rows.map((row) => this.rowToOperation(row));
  }

  async getSinceTimestamp(
    documentId: string,
    scope: string,
    branch: string,
    timestampUtcMs: number,
    signal?: AbortSignal,
  ): Promise<Operation[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("writeTimestampUtcMs", ">", new Date(timestampUtcMs))
      .orderBy("index", "asc")
      .execute();

    return rows.map((row) => this.rowToOperation(row));
  }

  async getSinceId(id: number, signal?: AbortSignal): Promise<Operation[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("id", ">", id)
      .orderBy("id", "asc")
      .execute();

    return rows.map((row) => this.rowToOperation(row));
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
