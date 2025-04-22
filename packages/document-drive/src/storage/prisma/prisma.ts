import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type {
  AttachmentInput,
  BaseStateFromDocument,
  DocumentHeader,
  DocumentOperations,
  ExtendedStateFromDocument,
  FileRegistry,
  Operation,
  OperationFromDocument,
  OperationScope,
  OperationsFromDocument,
  PHDocument,
} from "document-model";
import { type IBackOffOptions, backOff } from "exponential-backoff";
import { type ICache } from "../../cache/types.js";
import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "../../drive-document-model/gen/types.js";
import {
  ConflictOperationError,
  DocumentAlreadyExistsError,
  DocumentNotFoundError,
} from "../../server/error.js";
import { type SynchronizationUnitQuery } from "../../server/types.js";
import { childLogger, logger } from "../../utils/logger.js";
import type { IDocumentStorage, IDriveStorage } from "../types.js";
import { type Prisma, type PrismaClient } from "./client/index.js";

export * from "./factory.js";

type Transaction =
  | Omit<
      PrismaClient<Prisma.PrismaClientOptions, never>,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
    >
  | ExtendedPrismaClient;

function storageToOperation(
  op: Prisma.$OperationPayload["scalars"] & {
    attachments?: AttachmentInput[];
  },
): Operation {
  const operation = {
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
  } as Operation;
  if (op.context) {
    operation.context = op.context as Prisma.JsonObject;
  }
  return operation;
}

export type PrismaStorageOptions = {
  transactionRetryBackoff?: IBackOffOptions;
};

function getRetryTransactionsClient<T extends PrismaClient>(
  prisma: T,
  backOffOptions?: Partial<IBackOffOptions>,
) {
  return prisma.$extends({
    client: {
      $transaction: (...args: Parameters<T["$transaction"]>) => {
        // eslint-disable-next-line prefer-spread
        return backOff(() => prisma.$transaction.apply(prisma, args), {
          retry: (e) => {
            const code = (e as { code: string }).code;
            // Retry the transaction only if the error was due to a write conflict or deadlock
            // See: https://www.prisma.io/docs/reference/api-reference/error-reference#p2034
            if (code !== "P2034") {
              logger.error("TRANSACTION ERROR", e);
            }
            return code === "P2034";
          },
          ...backOffOptions,
        });
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<
  typeof getRetryTransactionsClient<PrismaClient>
>;

export class PrismaStorage implements IDriveStorage, IDocumentStorage {
  private logger = childLogger(["PrismaStorage"]);

  private db: ExtendedPrismaClient;
  private cache: ICache;

  constructor(db: PrismaClient, cache: ICache, options?: PrismaStorageOptions) {
    const backOffOptions = options?.transactionRetryBackoff;

    this.cache = cache;
    this.db = getRetryTransactionsClient(db, {
      ...backOffOptions,
      jitter: backOffOptions?.jitter ?? "full",
    });
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  async exists(documentId: string) {
    const count = await this.db.document.count({
      where: {
        id: documentId,
      },
    });

    return count > 0;
  }

  async create(documentId: string, document: PHDocument) {
    const slug =
      (document.initialState.state.global as any)?.slug ?? documentId;

    try {
      await this.db.document.create({
        data: {
          name: document.name,
          documentType: document.documentType,
          slug,
          initialState: JSON.stringify(document.initialState),
          lastModified: document.lastModified,
          revision: JSON.stringify(document.revision),
          meta: document.meta ? JSON.stringify(document.meta) : undefined,
          id: documentId,
        },
      });
    } catch (e) {
      if ((e as any).code === "P2002") {
        throw new DocumentAlreadyExistsError(documentId);
      }

      throw e;
    }

    // temporary -- but we need to create drive records automatically for documents
    // of the correct type
    if (document.documentType === "powerhouse/document-drive") {
      await this.db.drive.create({
        data: {
          id: documentId,
        },
      });
    }
  }

  async get<TDocument extends PHDocument>(
    documentId: string,
    tx?: Transaction,
  ): Promise<TDocument> {
    const prisma = tx ?? this.db;
    const query: any = {
      where: {
        id: documentId,
      },
    };

    const result = await prisma.document.findUnique(query);
    if (result === null) {
      throw new DocumentNotFoundError(documentId);
    }

    let cachedOperations: DocumentOperations = {
      global: [],
      local: [],
    };

    const cachedDocument = await this.cache.getDocument<TDocument>(documentId);
    if (cachedDocument) {
      cachedOperations = cachedDocument.operations;
    }

    const scopeIndex = Object.keys(cachedOperations).reduceRight<
      Record<OperationScope, number>
    >(
      (acc, value) => {
        const scope = value as OperationScope;
        const lastIndex = cachedOperations[scope].at(-1)?.index ?? -1;
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
    const queryOperations = await prisma.$queryRawUnsafe<
      Prisma.$OperationPayload["scalars"][]
    >(
      `WITH ranked_operations AS (
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
              WHERE "documentId" = $1
              AND (${conditions.join(" OR ")})
              ORDER BY scope, index;
          `,
      documentId,
    );
    const operationIds = queryOperations.map((o) => o.id);
    const attachments = await prisma.attachment.findMany({
      where: {
        operationId: {
          in: operationIds,
        },
      },
    });

    // TODO add attachments from cached operations
    const fileRegistry: FileRegistry = {};

    const operationsByScope = queryOperations.reduce((acc, operation) => {
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
    }, cachedOperations) as OperationsFromDocument<TDocument>;
    const dbDoc = result;
    const doc = {
      created: dbDoc.created.toISOString(),
      name: dbDoc.name ? dbDoc.name : "",
      documentType: dbDoc.documentType,
      initialState: JSON.parse(
        dbDoc.initialState,
      ) as ExtendedStateFromDocument<TDocument>,
      state: undefined,
      lastModified: new Date(dbDoc.lastModified).toISOString(),
      operations: operationsByScope,
      clipboard: [],
      revision: JSON.parse(dbDoc.revision) as Record<OperationScope, number>,
      meta: dbDoc.meta ? (JSON.parse(dbDoc.meta) as object) : undefined,
      attachments: {},
    };

    return doc as unknown as TDocument;
  }

  async getBySlug<TDocument extends PHDocument>(
    slug: string,
  ): Promise<TDocument> {
    const result = await this.db.document.findUnique({
      where: {
        slug,
      },
    });

    if (!result) {
      return Promise.reject(new DocumentNotFoundError(slug));
    }

    return this.get<TDocument>(result.id);
  }

  async findByType(
    documentModelType: string,
    limit: number = 100,
    cursor?: string,
  ): Promise<{
    documents: string[];
    nextCursor: string | undefined;
  }> {
    const queryOptions: Prisma.DocumentFindManyArgs = {
      where: {
        documentType: documentModelType,
      },
      orderBy: {
        ordinal: "asc",
      },
      select: {
        id: true,
        ordinal: true,
      },
      take: limit,
    };

    // if cursor is provided, add it to the query
    if (cursor) {
      const cursorOrdinal = parseInt(cursor, 10);
      if (isNaN(cursorOrdinal)) {
        throw new Error("Invalid cursor format: Expected an integer");
      }

      queryOptions.cursor = {
        ordinal: cursorOrdinal,
      };

      // skip the cursor itself
      queryOptions.skip = 1;
    }

    const results = await this.db.document.findMany(queryOptions);

    let nextCursor: string | undefined;
    if (results.length === limit) {
      // the cursor is the last document in the results
      nextCursor = results[limit - 1].ordinal.toString();
    }

    return {
      documents: results.map((doc) => doc.id),
      nextCursor,
    };
  }

  async delete(documentId: string): Promise<boolean> {
    // find all children that are only children of this document
    try {
      // Find documents that are only associated with this drive (have no other parents)
      const documentsToDelete = await this.db.document.findMany({
        where: {
          driveDocuments: {
            some: {
              driveId: documentId,
            },
            every: {
              driveId: documentId,
            },
          },
        },
        select: {
          id: true,
        },
      });

      // Delete these documents that only belong to this drive
      for (const doc of documentsToDelete) {
        await this.delete(doc.id);
      }
    } catch (e: unknown) {
      this.logger.error(
        "Error deleting child documents that only belong to this document",
        e,
      );
    }

    try {
      // delete out of drives
      await this.db.drive.deleteMany({
        where: {
          driveDocuments: {
            every: {
              driveId: documentId,
            },
          },
        },
      });
    } catch (e: unknown) {
      this.logger.error(
        "Error deleting document from drives, could not delete DriveDocument links",
        e,
      );

      return false;
    }

    try {
      // delete document
      const result = await this.db.document.deleteMany({
        where: {
          id: documentId,
        },
      });

      return result.count > 0;
    } catch (e: unknown) {
      this.logger.error(
        "Error deleting document from drives, could not delete Document",
        e,
      );

      const prismaError = e as { code?: string; message?: string };
      // Ignore Error: P2025: An operation failed because it depends on one or more records that were required but not found.
      if (
        (prismaError.code && prismaError.code === "P2025") ||
        prismaError.message?.includes(
          "An operation failed because it depends on one or more records that were required but not found.",
        )
      ) {
        return false;
      }

      throw e;
    }
  }

  async addChild(parentId: string, childId: string) {
    if (parentId === childId) {
      return Promise.reject(
        new Error("Cannot associate a document with itself"),
      );
    }

    // check if the child is a parent of the parent
    const children = await this.getChildren(childId);
    if (children.includes(parentId)) {
      return Promise.reject(
        new Error("Cannot associate a document with its child"),
      );
    }

    // create the many-to-many relation
    await this.db.document.update({
      where: {
        id: childId,
      },
      data: {
        driveDocuments: { create: { driveId: parentId } },
      },
    });
  }

  async removeChild(parentId: string, childId: string) {
    try {
      await this.db.driveDocument.delete({
        where: {
          // use unique constraint so it either deletes or throws
          driveId_documentId: {
            driveId: parentId,
            documentId: childId,
          },
        },
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  async getChildren(parentId: string): Promise<string[]> {
    const docs = await this.db.document.findMany({
      select: {
        id: true,
      },
      where: {
        driveDocuments: {
          some: {
            driveId: parentId,
          },
        },
      },
    });

    return docs.map((doc) => doc.id);
  }

  async getParents(childId: string): Promise<string[]> {
    // Query the DriveDocument table to find all drives that have the given document as a child
    const driveDocuments = await this.db.driveDocument.findMany({
      where: {
        documentId: childId,
      },
      select: {
        driveId: true,
      },
    });

    // Extract the drive IDs from the query result
    return driveDocuments.map((doc) => doc.driveId);
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    await this.addDocumentOperations("drives", id, operations, header);
  }

  async addDriveOperationsWithTransaction(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ) {
    return this.addDocumentOperationsWithTransaction(
      "drives",
      drive,
      (document) => callback(document as DocumentDriveDocument),
    );
  }

  private async _addDocumentOperations(
    tx: Transaction,
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    try {
      await tx.operation.createMany({
        data: operations.map((op) => ({
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
            ? Buffer.from(op.resultingState)
            : undefined,
        })),
      });

      await tx.document.updateMany({
        where: {
          id,
        },
        data: {
          lastModified: header.lastModified,
          revision: JSON.stringify(header.revision),
        },
      });

      await Promise.all(
        operations
          .filter((o) => o.attachments?.length)
          .map((op) => {
            return tx.operation.update({
              where: {
                unique_operation: {
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
          }),
      );
    } catch (e) {
      // P2002: Unique constraint failed
      // Operation with existing index
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
        const existingOperation = await this.db.operation.findFirst({
          where: {
            AND: operations.map((op) => ({
              driveId: drive,
              documentId: id,
              scope: op.scope,
              branch: "main",
              index: op.index,
            })),
          },
        });

        const conflictOp = operations.find(
          (op) =>
            existingOperation?.index === op.index &&
            existingOperation.scope === op.scope,
        );

        if (!existingOperation || !conflictOp) {
          console.error(e);
          throw e;
        } else {
          throw new ConflictOperationError(
            storageToOperation(existingOperation),
            conflictOp,
          );
        }
      } else {
        throw e;
      }
    }
  }

  async addDocumentOperationsWithTransaction<TDocument extends PHDocument>(
    drive: string,
    id: string,
    callback: (document: TDocument) => Promise<{
      operations: OperationFromDocument<TDocument>[];
      header: DocumentHeader;
      newState?: BaseStateFromDocument<TDocument> | undefined;
    }>,
  ) {
    let result: {
      operations: OperationFromDocument<TDocument>[];
      header: DocumentHeader;
      newState?: BaseStateFromDocument<TDocument> | undefined;
    } | null = null;

    await this.db.$transaction(
      async (tx) => {
        const document = await this.get<TDocument>(id, tx);
        if (!document) {
          return Promise.reject(new DocumentNotFoundError(id));
        }
        result = await callback(document);

        const { operations, header, newState } = result;
        return this._addDocumentOperations(tx, drive, id, operations, header);
      },
      { isolationLevel: "Serializable", maxWait: 10000, timeout: 20000 },
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
    return this._addDocumentOperations(this.db, drive, id, operations, header);
  }

  async deleteDrive(id: string) {
    // delete drive
    await this.db.drive.delete({
      where: {
        id,
      },
    });

    // delete drive document (will cascade)
    await this.db.document.delete({
      where: {
        id,
      },
    });

    // deletes all documents that only belong to this drive
    await this.db.document.deleteMany({
      where: {
        driveDocuments: {
          none: {
            driveId: id,
          },
        },
      },
    });
  }

  async getOperationResultingState(
    driveId: string,
    documentId: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined> {
    const operation = await this.db.operation.findUnique({
      where: {
        unique_operation: {
          documentId,
          index,
          scope,
          branch,
        },
      },
    });
    return operation?.resultingState?.toString();
  }

  getDriveOperationResultingState(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined> {
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
        return `("documentId" = $${index * 2 + 1} AND "scope" = $${index * 2 + 2})`;
      })
      .join(" OR ");

    const query = `
            SELECT "documentId", "scope", "branch", MAX("timestamp") as "lastUpdated", MAX("index") as revision FROM "Operation"
            WHERE ${whereClauses}
            GROUP BY "documentId", "scope", "branch"
        `;

    const params = units.map((unit) => [unit.documentId, unit.scope]).flat();
    const results = await this.db.$queryRawUnsafe<
      {
        documentId: string;
        lastUpdated: string;
        scope: OperationScope;
        branch: string;
        revision: number;
      }[]
    >(query, ...params);
    return results.map((row) => ({
      ...row,
      documentId: row.documentId,
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
