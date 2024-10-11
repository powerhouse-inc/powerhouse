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
  SynchronizationUnit,
} from "document-model/document";
import type { SynchronizationUnitQuery } from "../server/types";
import { groupOperationsBySyncUnit } from "../server/utils";
import { logger } from "../utils/logger";
import {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
  IStorageDelegate,
} from "./types";
import {
  PgDatabase,
  PgQueryResultHKT,
  PgTransaction,
} from "drizzle-orm/pg-core";
import {
  attachmentsTable,
  documentsTable,
  drivesTable,
  operationsTable,
  synchronizationUnitsTable,
} from "./drizzle/schema";
import { randomUUID } from "crypto";
import { and, count, DrizzleError, eq, inArray, ne, sql } from "drizzle-orm";

type Transaction =
  | PgTransaction<PgQueryResultHKT, Record<string, unknown>>
  | PgDatabase<any, any, any>;

function storageToOperation(
  op: typeof operationsTable.$inferSelect & {
    attachments?: AttachmentInput[];
  },
  scope: OperationScope
): Operation {
  const operation: Operation = {
    id: op.opId || undefined,
    skip: op.skip,
    hash: op.hash,
    index: op.index,
    timestamp: new Date(op.timestamp).toISOString(),
    input: JSON.parse(op.input),
    type: op.type,
    scope,
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

export type DrizzleStorageOptions = Record<string, never>;

export class DrizzleStorage implements IDriveStorage {
  private db: PgDatabase<PgQueryResultHKT, Record<string, unknown>>;
  private delegate: IStorageDelegate | undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(
    db: PgDatabase<PgQueryResultHKT, Record<string, unknown>>,
    _options?: DrizzleStorageOptions
  ) {
    this.db = db;
  }

  setStorageDelegate(delegate: IStorageDelegate): void {
    this.delegate = delegate;
  }

  async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
    // drive for all drive documents
    await this.createDocument("drives", id, drive as DocumentStorage, [
      {
        syncId: "0",
        scope: "global",
        branch: "main",
      },
      {
        syncId: "1",
        scope: "local",
        branch: "main",
      },
    ]);

    await this.db
      .insert(drivesTable)
      .values({
        id,
        slug: drive.initialState.state.global.slug ?? id,
      })
      .onConflictDoUpdate({
        target: [drivesTable.slug],
        set: { slug: drive.initialState.state.global.slug ?? id },
      });
  }
  async addDriveOperations(
    id: string,
    operations: Operation[],
    header: DocumentHeader
  ): Promise<void> {
    await this.addDocumentOperations("drives", id, operations, header);
  }

  async addDriveOperationsWithTransaction(
    drive: string,
    callback: (document: DocumentDriveStorage) => Promise<{
      operations: Operation<DocumentDriveAction | BaseAction>[];
      header: DocumentHeader;
    }>
  ) {
    return this.addDocumentOperationsWithTransaction(
      "drives",
      drive,
      (document) => callback(document as DocumentDriveStorage)
    );
  }

  async createDocument(
    drive: string,
    id: string,
    document: DocumentStorage,
    synchronizationUnits: SynchronizationUnit[]
  ): Promise<void> {
    // create document
    this.db.insert(documentsTable).values({
      created: new Date().toISOString(),
      name: document.name,
      documentType: document.documentType,
      driveId: drive,
      initialState: JSON.stringify(document.initialState),
      lastModified: document.lastModified,
      id,
    });

    // create synchronization units
    await this.db.insert(synchronizationUnitsTable).values(
      synchronizationUnits.map((sync) => ({
        syncId: sync.syncId,
        scope: sync.scope,
        branch: sync.branch,
        documentId: id,
        driveId: drive,
        id: randomUUID(),
        revision: -1,
      }))
    );
  }

  private async _addDocumentOperations(
    tx: Transaction,
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader
  ): Promise<void> {
    // TODO all operations should belong to the same sync unit
    const groupedOperations = groupOperationsBySyncUnit(operations);
    for (const { scope, branch, operations } of groupedOperations) {
      const syncUnit = await tx
        .select()
        .from(synchronizationUnitsTable)
        .where(
          and(
            eq(synchronizationUnitsTable.driveId, drive),
            eq(synchronizationUnitsTable.documentId, id),
            eq(synchronizationUnitsTable.scope, scope),
            eq(synchronizationUnitsTable.branch, branch)
          )
        )
        .then(([result]) => result);

      if (!syncUnit) {
        throw new Error(
          `Could not find sync unit for scope: ${JSON.stringify({ driveId: drive, documentId: id, scope, branch })}`
        );
      }
      const revision = operations.reduce(
        (acc, curr) => (curr.index > acc ? curr.index : acc),
        -1
      );

      await tx
        .update(synchronizationUnitsTable)
        .set({
          lastModified: operations.at(-1)?.timestamp,
          revision: revision,
          version: sql`${synchronizationUnitsTable.version} + 1`,
        })
        .where(
          and(
            eq(synchronizationUnitsTable.driveId, drive),
            eq(synchronizationUnitsTable.documentId, id),
            eq(synchronizationUnitsTable.scope, scope),
            eq(synchronizationUnitsTable.branch, branch)
          )
        )
        .returning({
          version: synchronizationUnitsTable.version,
        });

      // create operations
      await tx.insert(operationsTable).values(
        operations.map((op) => ({
          id: randomUUID(),
          clipboard: false,
          driveId: drive,
          documentId: id,
          scope,
          branch,
          opId: op.id,
          index: op.index,
          skip: op.skip,
          hash: op.hash,
          timestamp: op.timestamp,
          type: op.type,
          input: JSON.stringify(op.input),
          context: op.context,
          resultingState: op.resultingState
            ? Buffer.from(JSON.stringify(op.resultingState))
            : undefined,
        }))
      );

      await tx
        .update(documentsTable)
        .set({ lastModified: header.lastModified })
        .where(
          and(eq(documentsTable.id, id), eq(documentsTable.driveId, drive))
        );

      await Promise.all(
        operations.map((op) => {
          op.attachments &&
            op.attachments.length > 0 &&
            this.db.insert(attachmentsTable).values(
              op.attachments.map((a) => ({
                data: a.data,
                hash: a.hash,
                id: randomUUID(),
                mimeType: a.mimeType,
                operationId: op.id!,
                filename: a.fileName,
                extension: a.extension,
              }))
            );
        })
      );
    }
  }

  async addDocumentOperationsWithTransaction(
    drive: string,
    id: string,
    callback: (document: DocumentStorage) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
      newState?: State<any, any> | undefined;
    }>
  ): Promise<void> {
    let result: {
      operations: Operation[];
      header: DocumentHeader;
      newState?: State<any, any> | undefined;
    } | null = null;

    try {
      await this.db.transaction(
        async (tx) => {
          const document = await this.getDocument(drive, id, tx);
          if (!document) {
            throw new Error(`Document with id ${id} not found`);
          }
          result = await callback(document);

          const { operations, header, newState } = result;
          return this._addDocumentOperations(tx, drive, id, operations, header);
        },
        {
          isolationLevel: "read committed",
          accessMode: "read write",
        }
      );
    } catch (e) {
      // if optimistic update fails, retry with new state
      if (e instanceof DrizzleError && e.cause === "P2025") {
        // TODO add exponential backoff?
        return this.addDocumentOperationsWithTransaction(drive, id, callback);
      } else {
        throw e;
      }
    }

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
    header: DocumentHeader
  ): Promise<void> {
    return this._addDocumentOperations(this.db, drive, id, operations, header);
  }

  async getDocuments(drive: string) {
    const docs = await this.db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.driveId, drive), ne(documentsTable.id, "drives"))
      );

    return docs.map((doc) => doc.id);
  }

  async checkDocumentExists(driveId: string, id: string) {
    const [result] = await this.db
      .select({
        count: count(),
      })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.id, id), eq(documentsTable.driveId, driveId))
      );

    if (result?.count && result?.count > 0) {
      return true;
    }

    return false;
  }

  async getDocument(driveId: string, id: string, tx?: Transaction) {
    const db = tx ?? this.db;
    const [result] = await db
      .select()
      .from(documentsTable)
      .where(
        and(eq(documentsTable.id, id), eq(documentsTable.driveId, driveId))
      );

    if (result === null) {
      throw new Error(`Document with id ${id} not found`);
    }

    const cachedOperations = (await this.delegate?.getCachedOperations(
      driveId,
      id
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
      { global: -1, local: -1 }
    );

    const conditions = Object.entries(scopeIndex).map(
      ([scope, index]) => `(o.scope = '${scope}' AND index > ${index})`
    );
    conditions.push(
      `(o.scope NOT IN (${Object.keys(cachedOperations)
        .map((s) => `'${s}'`)
        .join(", ")}))`
    );
    // retrieves operations with resulting state
    // for the last operation of each scope
    // TODO prevent SQL injection
    const queryOperations = await db.execute(
      `
            SELECT
                s."syncId" as syncId,
                o.id as id,
                "opId",
                o.scope,
                o.branch,
                index,
                skip,
                hash,
                timestamp,
                input,
                type,
                context,
                CASE 
                    WHEN ROW_NUMBER() OVER (ORDER BY index DESC) = 1 THEN "resultingState" 
                    ELSE NULL 
                END AS "resultingState"
                FROM 
                    "Operation" o JOIN "SynchronizationUnit" s
                    ON o."driveId" = s."driveId" AND o."documentId" = s."documentId"
                    AND o."scope" = s."scope" AND o."branch" = s."branch"
                WHERE s."driveId" = ${driveId} AND s."documentId" = ${id}
                    AND (${conditions.join(" OR ")})
                ORDER BY
                    scope,
                    branch,
                    index;
        `
    );

    const operationIds = queryOperations
      .filter((o) => !!o)
      .map((o: { id: string }) => o.id ?? "");
    const attachments = await db
      .select()
      .from(attachmentsTable)
      .where(inArray(attachmentsTable.operationId, operationIds));

    const fileRegistry: FileRegistry = {};

    // add attachments from cached operations
    Object.values(cachedOperations)
      .flat()
      .forEach((operation) => {
        operation.attachments?.forEach(({ hash, ...file }) => {
          fileRegistry[hash] = file;
        });
      });

    const operationsByScope = queryOperations.reduce((acc, operation) => {
      const scope = operation.scope as OperationScope;
      if (!acc[scope]) {
        acc[scope] = [];
      }
      const result = storageToOperation(operation, scope);
      result.attachments = attachments.filter(
        (a) => a.operationId === operation.id
      );
      result.attachments.forEach(({ hash, ...file }) => {
        fileRegistry[hash] = file;
      });
      acc[scope].push(result);
      return acc;
    }, cachedOperations);

    const dbDoc = result;
    if (!dbDoc) {
      throw new Error(`Document with id ${id} not found`);
    }
    const doc: Document = {
      created: dbDoc.created,
      name: dbDoc.name ? dbDoc.name : "",
      documentType: dbDoc.documentType,
      initialState: JSON.parse(dbDoc.initialState) as ExtendedState<
        DocumentDriveState,
        DocumentDriveLocalState
      >,
      state: {} as State<unknown, unknown>,
      lastModified: new Date(dbDoc.lastModified).toISOString(),
      operations: operationsByScope,
      clipboard: [],
      attachments: fileRegistry,
      revision: dbDoc.revision,
    };
    return doc;
  }

  async deleteDocument(drive: string, id: string) {
    await this.db
      .delete(documentsTable)
      .where(and(eq(documentsTable.driveId, drive), eq(documentsTable.id, id)));
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
      throw new Error(`Drive with id ${id} not found`);
    }
  }

  async getDriveBySlug(slug: string) {
    const [driveEntity] = await this.db
      .select()
      .from(drivesTable)
      .where(eq(drivesTable.slug, slug));

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
    branch: string
  ): Promise<unknown> {
    const [operation] = await this.db
      .select({
        resultingState: operationsTable.resultingState,
      })
      .from(operationsTable)
      .where(
        and(
          eq(operationsTable.driveId, driveId),
          eq(operationsTable.documentId, documentId),
          eq(operationsTable.scope, scope),
          eq(operationsTable.branch, branch),
          eq(operationsTable.index, index)
        )
      );
    return operation?.resultingState?.toString();
  }

  getDriveOperationResultingState(
    drive: string,
    index: number,
    scope: string,
    branch: string
  ): Promise<unknown> {
    return this.getOperationResultingState(
      "drives",
      drive,
      index,
      scope,
      branch
    );
  }

  async getSynchronizationUnitsRevision(
    units: SynchronizationUnitQuery[]
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
    const results = await this.db.execute<
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
    const count = await this.db.execute(sql`
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
        `);
    logger.info(`Migrated ${count} operations`);
    return;
  }
}
