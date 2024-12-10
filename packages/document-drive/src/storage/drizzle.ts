import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-model-libs/document-drive";
import type {
  Action,
  AttachmentInput,
  BaseAction,
  Document,
  DocumentHeader,
  DocumentOperations,
  ExtendedState,
  FileRegistry,
  Operation,
  OperationScope,
  State,
} from "document-model/document";
import { IBackOffOptions } from "exponential-backoff";
import { DriveNotFoundError } from "../server/error";
import type { SynchronizationUnitQuery } from "../server/types";
import { logger } from "../utils/logger";
import {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
  IStorageDelegate,
} from "./types";

import {
  and,
  count,
  eq,
  ExtractTablesWithRelations,
  inArray,
  sql,
} from "drizzle-orm";
import {
  NodePgDatabase,
  NodePgQueryResultHKT,
  NodePgTransaction,
} from "drizzle-orm/node-postgres";
import {
  createDocumentQuery,
  getDriveBySlug,
  upsertDrive,
} from "./drizzle/queries";
import {
  attachmentsTable,
  documentsTable,
  drivesTable,
  operationsTable,
} from "./drizzle/schema";
import { randomUUID } from "crypto";
import { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

// type Transaction =
//   | Omit<
//       PrismaClient<Prisma.PrismaClientOptions, never>,
//       "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
//     >
//   | ExtendedPrismaClient;

function storageToOperation(
  op: typeof operationsTable.$inferSelect & {
    attachments?: AttachmentInput[];
  },
): Operation {
  const operation: Operation = {
    id: op.opId || undefined,
    skip: op.skip,
    hash: op.hash,
    index: op.index,
    timestamp: new Date(op.timestamp).toISOString(),
    input: JSON.parse(op.input),
    type: op.type,
    scope: op.scope as OperationScope,
    resultingState: op.resultingState
      ? op.resultingState.toString()
      : undefined,
    attachments: op.attachments,
  };
  if (op.context) {
    operation.context = op.context;
  }
  return operation;
}

export type DrizzleStorageOptions = {
  transactionRetryBackoff?: IBackOffOptions;
};

function getRetryTransactionsClient<T extends NodePgDatabase>(
  db: T,
  backOffOptions?: Partial<IBackOffOptions>,
) {
  return db;
}

type ExtendedDrizzleClient = ReturnType<
  typeof getRetryTransactionsClient<NodePgDatabase>
>;

export class DrizzleStorage implements IDriveStorage {
  private db: NodePgDatabase;
  private delegate: IStorageDelegate | undefined;

  constructor(db: NodePgDatabase, options?: DrizzleStorageOptions) {
    const backOffOptions = options?.transactionRetryBackoff;
    this.db = getRetryTransactionsClient(db, {
      ...backOffOptions,
      jitter: backOffOptions?.jitter ?? "full",
    });
  }

  setStorageDelegate(delegate: IStorageDelegate): void {
    this.delegate = delegate;
  }

  async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
    // drive for all drive documents
    await this.createDocument("drives", id, drive as DocumentStorage);
    await upsertDrive(this.db, id, drive);
  }
  async addDriveOperations(
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    await this.addDocumentOperations("drives", id, operations, header);
  }

  async addDriveOperationsWithTransaction(
    drive: string,
    callback: (document: DocumentDriveStorage) => Promise<{
      operations: Operation<DocumentDriveAction | BaseAction>[];
      header: DocumentHeader;
    }>,
  ) {
    return this.addDocumentOperationsWithTransaction(
      "drives",
      drive,
      (document) => callback(document as DocumentDriveStorage),
    );
  }

  async createDocument(
    drive: string,
    id: string,
    document: DocumentStorage,
  ): Promise<void> {
    await createDocumentQuery(this.db, drive, id, document);
  }

  private async _addDocumentOperations(
    tx: PgTransaction<
      NodePgQueryResultHKT,
      Record<string, never>,
      ExtractTablesWithRelations<Record<string, never>>
    >,
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    try {
      await tx.insert(operationsTable).values(
        operations.map((op) => ({
          driveId: drive,
          id: randomUUID(),
          documentId: id,
          hash: op.hash,
          index: op.index,
          input: JSON.stringify(op.input),
          timestamp: op.timestamp,
          type: op.type,
          scope: op.scope,
          branch: "main",
          opId: op.id,
          skip: op.skip,
          context: op.context,
          resultingState: op.resultingState
            ? Buffer.from(JSON.stringify(op.resultingState))
            : undefined,
        })),
      );

      await tx
        .update(documentsTable)
        .set({
          lastModified: header.lastModified,
          revision: JSON.stringify(header.revision),
        })
        .where(
          and(eq(documentsTable.id, id), eq(documentsTable.driveId, drive)),
        );

      await Promise.all(
        operations
          .filter((o) => o.attachments?.length)
          .map((op) => {
            return tx
              .update(operationsTable)
              .set({
                driveId: drive,
                documentId: id,
                index: op.index,
                scope: op.scope,
                branch: "main",
              })
              .where(
                and(
                  eq(operationsTable.documentId, id),
                  eq(operationsTable.driveId, drive),
                ),
              );
          }),
      );
    } catch (e) {
      // P2002: Unique constraint failed
      // Operation with existing index
      //   if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      //     const existingOperation = await this.db.operation.findFirst({
      //       where: {
      //         AND: operations.map((op) => ({
      //           driveId: drive,
      //           documentId: id,
      //           scope: op.scope,
      //           branch: "main",
      //           index: op.index,
      //         })),
      //       },
      //     });
      //     const conflictOp = operations.find(
      //       (op) =>
      //         existingOperation?.index === op.index &&
      //         existingOperation.scope === op.scope
      //     );
      //     if (!existingOperation || !conflictOp) {
      //       console.error(e);
      //       throw e;
      //     } else {
      //       throw new ConflictOperationError(
      //         storageToOperation(existingOperation),
      //         conflictOp
      //       );
      //     }
      //   } else {
      //     throw e;
      //   }
      console.error(e);
      throw e;
    }
  }

  async addDocumentOperationsWithTransaction(
    drive: string,
    id: string,
    callback: (document: DocumentStorage) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
      newState?: State<any, any> | undefined;
    }>,
  ) {
    let result: {
      operations: Operation[];
      header: DocumentHeader;
      newState?: State<any, any> | undefined;
    } | null = null;

    await this.db.transaction(
      async (tx) => {
        const document = await this.getDocument(
          drive,
          id,
          tx as unknown as NodePgDatabase<Record<string, never>>,
        );
        if (!document) {
          throw new Error(`Document with id ${id} not found`);
        }
        result = await callback(document);

        const { operations, header, newState } = result;
        return this._addDocumentOperations(tx, drive, id, operations, header);
      },
      {
        accessMode: "read write",
        isolationLevel: "serializable",
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!result) {
      throw new Error("No operations were provided");
    }

    return result;
  }

  async addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    return this._addDocumentOperations(
      this.db as PgTransaction<
        NodePgQueryResultHKT,
        Record<string, never>,
        ExtractTablesWithRelations<Record<string, never>>
      >,
      drive,
      id,
      operations,
      header,
    );
  }
  async getDocuments(drive: string): Promise<string[]> {
    const docs: { id: string }[] = await this.db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(eq(documentsTable.driveId, drive));

    return docs.map((d) => d.id);
  }

  async checkDocumentExists(driveId: string, id: string) {
    const [result] = await this.db
      .select({ count: count() })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.id, id), eq(documentsTable.driveId, driveId)),
      );
    if (!result) {
      return false;
    }
    return result.count > 0;
  }

  async getDocument(
    driveId: string,
    id: string,
    tx?: NodePgDatabase<Record<string, never>>,
  ) {
    const db = tx ?? this.db;
    const [result] = await db
      .select()
      .from(documentsTable)
      .where(
        and(eq(documentsTable.id, id), eq(documentsTable.driveId, driveId)),
      )
      .limit(1);

    if (result === null) {
      throw new Error(`Document with id ${id} not found`);
    }

    const cachedOperations = (await this.delegate?.getCachedOperations(
      driveId,
      id,
    )) ?? {
      global: [],
      local: [],
    };
    const scopeIndex = Object.keys(cachedOperations).reduceRight<
      Record<OperationScope, number>
    >(
      (acc, value) => {
        const scope = value as OperationScope;
        const lastIndex = cachedOperations[scope]?.at(-1)?.index ?? -1;
        acc[scope] = lastIndex;
        return acc;
      },
      { global: -1, local: -1 },
    );

    const conditions = Object.entries(scopeIndex).map(
      ([scope, index]) => `("scope" = '${scope}' AND "index" > ${index})`,
    );
    conditions.push(
      `("scope" NOT IN (${Object.keys(cachedOperations)
        .map((s) => `'${s}'`)
        .join(", ")}))`,
    );

    // retrieves operations with resulting state
    // for the last operation of each scope
    // TODO prevent SQL injection
    const queryOperations = await this.db.execute(
      sql`WITH ranked_operations AS (
            SELECT
                *,
                ROW_NUMBER() OVER (PARTITION BY scope ORDER BY index DESC) AS rn
            FROM "Operation"
            )
            SELECT
            "id",
            "opId",
            "scope",
            "branch",
            "index",
            "skip",
            "hash",
            "timestamp",
            "input",
            "type",
            "context",
            CASE
                WHEN rn = 1 THEN "resultingState"
                ELSE NULL
            END AS "resultingState"
            FROM ranked_operations
            WHERE "driveId" = ${driveId} AND "documentId" = ${id}
            AND (${conditions.join(" OR ")})
            ORDER BY scope, index;
        `,
    );
    const operationIds = queryOperations.map((o: Operation) => o.id);
    const attachments = await this.db
      .select()
      .from(attachmentsTable)
      .where(inArray(attachmentsTable.operationId, operationIds));

    // TODO add attachments from cached operations
    const fileRegistry: FileRegistry = {};

    const operationsByScope = queryOperations.reduce<
      DocumentOperations<Action>
    >(
      (
        acc: Record<string, Operation[]>,
        operation: typeof operationsTable.$inferSelect,
      ) => {
        const scope = operation.scope as OperationScope;
        if (!acc[scope]) {
          acc[scope] = [];
        }
        const result = storageToOperation(operation);
        result.attachments = attachments.filter(
          (a) => a.operationId === operation.id,
        );
        result.attachments.forEach(({ hash, ...file }) => {
          fileRegistry[hash] = file;
        });
        acc[scope].push(result);
        return acc;
      },
      cachedOperations,
    );

    const dbDoc = result;
    if (!dbDoc) {
      throw new Error("Document not found");
    }
    const doc: Document = {
      created: dbDoc.created,
      name: dbDoc.name ? dbDoc.name : "",
      documentType: dbDoc.documentType,
      initialState: JSON.parse(dbDoc.initialState) as ExtendedState<
        DocumentDriveState,
        DocumentDriveLocalState
      >,
      // @ts-expect-error TODO: fix as this should not be undefined
      state: undefined,
      lastModified: new Date(dbDoc.lastModified).toISOString(),
      operations: operationsByScope,
      clipboard: [],
      revision: JSON.parse(dbDoc.revision) as Record<OperationScope, number>,
      attachments: {},
    };
    return doc;
  }

  async deleteDocument(drive: string, id: string) {
    try {
      await this.db
        .delete(documentsTable)
        .where(
          and(eq(documentsTable.driveId, drive), eq(documentsTable.id, id)),
        );
    } catch (e: unknown) {
      console.error(e);
      throw e;
    }
  }

  async getDrives() {
    return this.getDocuments("drives");
  }

  async getDrive(id: string) {
    try {
      const doc = await this.getDocument("drives", id);
      return doc as DocumentDriveStorage;
    } catch (e) {
      logger.error(e);
      throw new DriveNotFoundError(id);
    }
  }

  async getDriveBySlug(slug: string) {
    const driveEntity = await getDriveBySlug(this.db, slug);

    if (!driveEntity) {
      throw new Error(`Drive with slug ${slug} not found`);
    }

    return this.getDrive(driveEntity.id);
  }

  async deleteDrive(id: string) {
    // delete drive and associated slug
    await this.db.delete(drivesTable).where(eq(drivesTable.id, id));

    // delete drive document and its operations
    await this.deleteDocument("drives", id);

    // deletes all documents of the drive
    await this.db.delete(documentsTable).where(eq(documentsTable.driveId, id));
  }

  async getOperationResultingState(
    driveId: string,
    documentId: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<unknown> {
    const [operation] = await this.db
      .select()
      .from(operationsTable)
      .where(
        and(
          eq(operationsTable.driveId, driveId),
          eq(operationsTable.documentId, documentId),
          eq(operationsTable.index, index),
          eq(operationsTable.scope, scope),
          eq(operationsTable.branch, branch),
        ),
      );

    return operation?.resultingState?.toString();
  }

  getDriveOperationResultingState(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<unknown> {
    return this.getOperationResultingState(
      "drives",
      drive,
      index,
      scope,
      branch,
    );
  }

  async getSynchronizationUnitsRevision(
    units: SynchronizationUnitQuery[],
  ): Promise<
    {
      driveId: string;
      documentId: string;
      scope: string;
      branch: string;
      lastUpdated: string;
      revision: number;
    }[]
  > {
    // TODO add branch condition
    const whereClauses = units
      .map((_, index) => {
        return `("driveId" = $${index * 3 + 1} AND "documentId" = $${index * 3 + 2} AND "scope" = $${index * 3 + 3})`;
      })
      .join(" OR ");

    const query = `
            SELECT "driveId", "documentId", "scope", "branch", MAX("timestamp") as "lastUpdated", MAX("index") as revision FROM "Operation"
            WHERE ${whereClauses}
            GROUP BY "driveId", "documentId", "scope", "branch"
        `;

    const params = units
      .map((unit) => [
        unit.documentId ? unit.driveId : "drives",
        unit.documentId || unit.driveId,
        unit.scope,
      ])
      .flat();
    const results = await this.db.$queryRawUnsafe<
      {
        driveId: string;
        documentId: string;
        lastUpdated: string;
        scope: OperationScope;
        branch: string;
        revision: number;
      }[]
    >(query, ...params);
    return results.map((row) => ({
      ...row,
      driveId: row.driveId === "drives" ? row.documentId : row.driveId,
      documentId: row.driveId === "drives" ? "" : row.documentId,
      lastUpdated: new Date(row.lastUpdated).toISOString(),
    }));
  }

  // migrates all stored operations from legacy signature to signatures array
  async migrateOperationSignatures() {
    const count = await this.db.$executeRaw`
            UPDATE "Operation"
            SET context = jsonb_set(
                context #- '{signer,signature}',  -- Remove the old 'signature' field
                '{signer,signatures}',            -- Path to the new 'signatures' field
                CASE
                    WHEN context->'signer'->>'signature' = '' THEN '[]'::jsonb
                    ELSE to_jsonb(array[context->'signer'->>'signature'])
                END
            )
            WHERE context->'signer' ? 'signature'  -- Check if the 'signature' key exists
        `;
    logger.info(`Migrated ${count} operations`);
    return;
  }
}
