import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
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

type Transaction =
  | Omit<
      PrismaClient<Prisma.PrismaClientOptions, never>,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
    >
  | PrismaClient;

function storageToOperation(
  op: Prisma.$OperationPayload["scalars"] & {
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
    operation.context = op.context as Prisma.JsonObject;
  }
  return operation;
}

export type PrismaStorageOptions = Record<string, never>;

export class PrismaStorage implements IDriveStorage {
  private db: PrismaClient;
  private delegate: IStorageDelegate | undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(db: PrismaClient, _options?: PrismaStorageOptions) {
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
    await this.db.drive.upsert({
      where: {
        slug: drive.initialState.state.global.slug ?? id,
      },
      create: {
        id: id,
        slug: drive.initialState.state.global.slug ?? id,
      },
      update: {
        id,
      },
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
    await this.db.document.create({
      data: {
        name: document.name,
        documentType: document.documentType,
        driveId: drive,
        initialState: JSON.stringify(document.initialState),
        lastModified: document.lastModified,
        id,
        synchronizationUnits: {
          createMany: {
            data: synchronizationUnits.map((sync) => ({
              syncId: sync.syncId,
              scope: sync.scope,
              branch: sync.branch,
            })),
          },
        },
      },
    });
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
      const syncUnit = await tx.synchronizationUnit.findUnique({
        where: {
          driveId_documentId_scope_branch: {
            driveId: drive,
            documentId: id,
            scope,
            branch,
          },
        },
        select: {
          version: true,
        },
      });
      if (!syncUnit) {
        throw new Error(
          `Could not find sync unit for scope: ${JSON.stringify({ driveId: drive, documentId: id, scope, branch })}`
        );
      }
      const revision = operations.reduce(
        (acc, curr) => (curr.index > acc ? curr.index : acc),
        -1
      );

      await tx.synchronizationUnit.update({
        where: {
          driveId_documentId_scope_branch: {
            driveId: drive,
            documentId: id,
            scope,
            branch,
          },
          version: syncUnit.version, // optimistic update
        },
        data: {
          lastModified: operations.at(-1)?.timestamp,
          revision: revision,
          version: { increment: 1 },
          operations: {
            createMany: {
              data: operations.map((op) => ({
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
              })),
            },
          },
        },
      });

      await tx.document.update({
        where: {
          id_driveId: {
            id,
            driveId: drive,
          },
        },
        data: {
          lastModified: header.lastModified,
        },
      });

      await Promise.all(
        operations
          .filter((o) => o.attachments?.length)
          .map((op) => {
            return tx.operation.update({
              where: {
                driveId_documentId_scope_branch_index: {
                  driveId: drive,
                  documentId: id,
                  index: op.index,
                  scope: op.scope,
                  branch: "main",
                },
              },
              data: {
                attachments: {
                  createMany: {
                    data: op.attachments ?? [],
                  },
                },
              },
            });
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
      await this.db.$transaction(
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
          isolationLevel: "ReadCommitted",
          maxWait: 10000,
          timeout: 20000,
        }
      );
    } catch (e) {
      // if optimistic update fails, retry with new state
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
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
    const docs = await this.db.document.findMany({
      select: {
        id: true,
      },
      where: {
        AND: {
          driveId: drive,
          NOT: {
            id: "drives",
          },
        },
      },
    });

    return docs.map((doc) => doc.id);
  }

  async checkDocumentExists(driveId: string, id: string) {
    const count = await this.db.document.count({
      where: {
        id: id,
        driveId: driveId,
      },
    });
    return count > 0;
  }

  async getDocument(driveId: string, id: string, tx?: Transaction) {
    const prisma = tx ?? this.db;
    const result = await prisma.document.findUnique({
      where: {
        id_driveId: {
          driveId,
          id,
        },
      },
    });

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
    const queryOperations = await prisma.$queryRawUnsafe<
      (Prisma.$OperationPayload["scalars"] &
        Pick<
          Prisma.$SynchronizationUnitPayload["scalars"],
          "scope" | "branch"
        >)[]
    >(
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
                WHERE s."driveId" = $1 AND s."documentId" = $2
                    AND (${conditions.join(" OR ")})
                ORDER BY
                    scope,
                    branch,
                    index;
        `,
      driveId,
      id
    );

    const operationIds = queryOperations.map((o) => o.id);
    const attachments = await prisma.attachment.findMany({
      where: {
        operationId: {
          in: operationIds,
        },
      },
    });

    const fileRegistry: FileRegistry = {};

    // add attachments from cached operations
    Object.values(cachedOperations)
      .flat()
      .forEach((operation) => {
        operation.attachments?.forEach(({ hash, ...file }) => {
          fileRegistry[hash] = file;
        });
      });

    const operationsByScope = queryOperations.reduce<
      DocumentOperations<Action>
    >((acc, operation) => {
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
    const doc: Document = {
      created: dbDoc.created.toISOString(),
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
    };
    return doc;
  }

  async deleteDocument(drive: string, id: string) {
    try {
      await this.db.document.deleteMany({
        where: {
          driveId: drive,
          id: id,
        },
      });
    } catch (e: unknown) {
      const prismaError = e as { code?: string; message?: string };
      // Ignore Error: P2025: An operation failed because it depends on one or more records that were required but not found.
      if (
        (prismaError.code && prismaError.code === "P2025") ||
        (prismaError.message &&
          prismaError.message.includes(
            "An operation failed because it depends on one or more records that were required but not found."
          ))
      ) {
        return;
      }

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
      throw new Error(`Drive with id ${id} not found`);
    }
  }

  async getDriveBySlug(slug: string) {
    const driveEntity = await this.db.drive.findFirst({
      where: {
        slug,
      },
    });

    if (!driveEntity) {
      throw new Error(`Drive with slug ${slug} not found`);
    }

    return this.getDrive(driveEntity.id);
  }

  async deleteDrive(id: string) {
    // delete drive and associated slug
    await this.db.drive.deleteMany({
      where: {
        id,
      },
    });

    // delete drive document and its operations
    await this.deleteDocument("drives", id);

    // deletes all documents of the drive
    await this.db.document.deleteMany({
      where: {
        driveId: id,
      },
    });
  }

  async getOperationResultingState(
    driveId: string,
    documentId: string,
    index: number,
    scope: string,
    branch: string
  ): Promise<unknown> {
    const operation = await this.db.operation.findFirst({
      where: {
        SynchronizationUnit: {
          driveId,
          documentId,
          scope,
          branch,
        },
        index,
      },
    });
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
