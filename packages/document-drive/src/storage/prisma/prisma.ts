import {
  isValidDocumentId,
  isValidSlug,
  resolveStorageUnitsFilter,
} from "#storage/utils";
import { AbortError } from "#utils/errors";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type {
  Action,
  AttachmentInput,
  DocumentOperations,
  FileRegistry,
  Operation,
  PHDocument,
  PHDocumentHeader,
} from "document-model";
import { actionContext } from "document-model";
import { backOff, type IBackOffOptions } from "exponential-backoff";
import { type ICache } from "../../cache/types.js";
import { type DocumentDriveDocument } from "../../drive-document-model/gen/types.js";
import {
  ConflictOperationError,
  DocumentAlreadyExistsError,
  DocumentAlreadyExistsReason,
  DocumentIdValidationError,
  DocumentNotFoundError,
  DocumentSlugValidationError,
} from "../../server/error.js";
import { type SynchronizationUnitQuery } from "../../server/types.js";
import { childLogger, logger } from "../../utils/logger.js";
import type {
  IDocumentStorage,
  IDriveOperationStorage,
  IStorageUnit,
  IStorageUnitFilter,
} from "../types.js";
import { type Prisma, type PrismaClient } from "./client/index.js";

export * from "./factory.js";

type Transaction =
  | Omit<
      PrismaClient<Prisma.PrismaClientOptions, never>,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
    >
  | ExtendedPrismaClient;

/**
 * Converts a storage payload to a typed operation.
 *
 * @param op - The storage operation.
 * @returns The typed operation.
 */
function operationFromStorage(
  op: Prisma.$OperationPayload["scalars"] & {
    attachments?: AttachmentInput[];
  },
): Operation {
  const action: Action = {
    id: op.actionId,
    timestampUtcMs: new Date(op.timestamp).toISOString(),
    type: op.type,
    input: JSON.parse(op.input),
    scope: op.scope,
    attachments: op.attachments,
  };

  if (op.context) {
    action.context = op.context as Prisma.JsonObject;
  } else {
    action.context = actionContext();
  }

  const operation: Operation = {
    id: op.opId || undefined,
    skip: op.skip,
    hash: op.hash,
    index: op.index,
    timestampUtcMs: new Date(op.timestamp).toISOString(),
    resultingState: op.resultingState
      ? op.resultingState.toString()
      : undefined,
    action,
  };

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

export class PrismaStorage implements IDriveOperationStorage, IDocumentStorage {
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
  // IStorageUnitStorage
  ////////////////////////////////
  async findStorageUnitsBy(
    filter: IStorageUnitFilter,
    limit: number,
    cursor?: string,
  ): Promise<{ units: IStorageUnit[]; nextCursor?: string }> {
    const {
      parentId: parentIds,
      documentId: documentIds,
      documentModelType: documentTypes,
      scope: scopes,
      branch: branches,
    } = resolveStorageUnitsFilter(filter);

    let documents = new Array<string>();

    // if parent ids are passed, find all documents that are children
    // of those parents, intersecting with document ids if provided
    if (parentIds?.size) {
      documents = await this.db.driveDocument
        .findMany({
          select: {
            documentId: true,
          },
          where: {
            driveId: {
              in: [...parentIds],
            },
            ...(documentIds ? { documentId: { in: [...documentIds] } } : {}),
          },
        })
        .then((docs) => docs.map((doc) => doc.documentId));
      documents.unshift(
        ...(documentIds ? parentIds.intersection(documentIds) : parentIds),
      );
    }

    const queryOptions: Prisma.DocumentFindManyArgs = {
      where: {
        ...(documents.length > 0 ? { id: { in: [...documents] } } : {}),
        ...(documentTypes ? { documentType: { in: [...documentTypes] } } : {}),
        ...(scopes && scopes.size > 0
          ? {
              scopes: {
                hasSome: [...scopes],
              },
            }
          : {}),
        // branch: { in: branches ? [...branches] : undefined },
      },
      orderBy: {
        ordinal: "asc",
      },
      select: {
        id: true,
        documentType: true,
        scopes: true,
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

    // Map the database results to IStorageUnit objects
    const units: IStorageUnit[] = results.flatMap((doc) =>
      doc.scopes.map((scope) => ({
        documentId: doc.id,
        documentModelType: doc.documentType,
        scope,
        branch: "main",
      })),
    );

    return {
      units,
      nextCursor,
    };
  }

  ////////////////////////////////
  // IDocumentView
  ////////////////////////////////
  async resolveIds(slugs: string[], signal?: AbortSignal): Promise<string[]> {
    const queryOptions: Prisma.DocumentFindManyArgs = {
      where: {
        slug: {
          in: slugs,
        },
      },
      select: {
        id: true,
      },
    };

    const results = await this.db.document.findMany(queryOptions);

    if (signal?.aborted) {
      throw new AbortError("Aborted");
    }

    if (results.length !== slugs.length) {
      throw new Error("Not all slugs were found");
    }

    return results.map((doc) => doc.id);
  }

  async resolveSlugs(ids: string[], signal?: AbortSignal): Promise<string[]> {
    const queryOptions: Prisma.DocumentFindManyArgs = {
      where: {
        id: {
          in: ids,
        },
      },
      select: {
        slug: true,
      },
    };

    const results = await this.db.document.findMany(queryOptions);

    if (signal?.aborted) {
      throw new AbortError("Aborted");
    }

    if (results.length !== ids.length) {
      throw new Error("Not all ids were found");
    }

    return results.map((doc) => doc.slug ?? "");
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

  async create(document: PHDocument) {
    const documentId = document.header.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    const slug =
      document.header.slug?.length > 0 ? document.header.slug : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    document.header.slug = slug;

    try {
      await this.db.document.create({
        data: {
          id: documentId,
          slug,
          name: document.header.name,
          documentType: document.header.documentType,
          initialState: JSON.stringify(document.initialState),
          created: document.header.createdAtUtcIso,
          lastModified: document.header.lastModifiedAtUtcIso,
          revision: JSON.stringify(document.header.revision),
          meta: document.header.meta
            ? JSON.stringify(document.header.meta)
            : undefined,
          scopes: Object.keys(document.state),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        const reason = (e as { message?: string }).message?.includes("slug")
          ? DocumentAlreadyExistsReason.SLUG
          : DocumentAlreadyExistsReason.ID;

        throw new DocumentAlreadyExistsError(documentId, reason);
      }

      throw e;
    }

    // temporary -- but we need to create drive records automatically for documents
    // of the correct type
    if (document.header.documentType === "powerhouse/document-drive") {
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
      Record<string, number>
    >(
      (acc, value) => {
        const scope = value;
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
              "actionId",
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
      const scope = operation.scope;
      if (!acc[scope]) {
        acc[scope] = [];
      }
      const result = operationFromStorage(operation);
      result.action!.attachments = attachments.filter(
        (a) => a.operationId === operation.id,
      );
      result.action!.attachments!.forEach(({ hash, ...file }) => {
        fileRegistry[hash] = file;
      });
      acc[scope].push(result);
      return acc;
    }, cachedOperations);
    const dbDoc = result;

    const header: PHDocumentHeader = {
      id: dbDoc.id,
      sig: {
        nonce: "",
        publicKey: {},
      },
      documentType: dbDoc.documentType,
      createdAtUtcIso: dbDoc.created.toISOString(),
      lastModifiedAtUtcIso: dbDoc.lastModified.toISOString(),
      revision: JSON.parse(dbDoc.revision) as Record<string, number>,
      meta: dbDoc.meta ? (JSON.parse(dbDoc.meta) as object) : undefined,
      slug: dbDoc.slug ? dbDoc.slug : "",
      name: dbDoc.name ? dbDoc.name : "",
      branch: "main",
    };

    const doc = {
      header,
      initialState: JSON.parse(dbDoc.initialState) as TDocument["initialState"],
      operations: operationsByScope,
      clipboard: [],
      attachments: {},
      history: [],
      state: undefined,
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
    limit = 100,
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
    try {
      // delete out of drives if document is a drive
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

      // delete document from drives
      await this.db.driveDocument.deleteMany({
        where: {
          documentId,
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
    await this.db.drive.update({
      where: {
        id: parentId,
      },
      data: {
        driveDocuments: {
          create: { documentId: childId },
        },
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
    const docs = await this.db.driveDocument.findMany({
      select: {
        documentId: true,
      },
      where: {
        driveId: parentId,
      },
    });

    return docs.map((doc) => doc.documentId);
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
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    await this.addDocumentOperations(id, operations, document);
  }

  async addDriveOperationsWithTransaction(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      document: PHDocument;
    }>,
  ) {
    return this.addDocumentOperationsWithTransaction(drive, (document) =>
      callback(document as DocumentDriveDocument),
    );
  }

  private async _addDocumentOperations(
    tx: Transaction,
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    try {
      await tx.operation.createMany({
        data: operations.map((op) => ({
          documentId: id,
          hash: op.hash,
          index: op.index,
          actionId: op.action.id,
          input: JSON.stringify(op.action.input),
          timestamp: new Date(op.timestampUtcMs),
          type: op.action.type,
          scope: op.action.scope,
          branch: "main",
          opId: op.id,
          skip: op.skip,
          context: op.action?.context,
          resultingState: op.resultingState
            ? Buffer.from(op.resultingState)
            : undefined,
        })),
      });

      await tx.document.update({
        where: {
          id,
        },
        data: {
          lastModified: document.header.lastModifiedAtUtcIso,
          revision: JSON.stringify(document.header.revision),
          scopes: Object.keys(document.state),
        },
      });

      await Promise.all(
        operations
          .filter((o) => o.action?.attachments?.length)
          .map((op) => {
            return tx.operation.update({
              where: {
                unique_operation: {
                  documentId: id,
                  index: op.index,
                  scope: op.action.scope,
                  branch: "main",
                },
              },
              data: {
                attachments: {
                  createMany: {
                    data: op.action?.attachments ?? [],
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
              documentId: id,
              scope: op.action.scope,
              branch: "main",
              index: op.index,
            })),
          },
        });

        const conflictOp = operations.find(
          (op) =>
            existingOperation?.index === op.index &&
            existingOperation.scope === op.action.scope,
        );

        if (!existingOperation || !conflictOp) {
          console.error(e);
          throw e;
        } else {
          throw new ConflictOperationError(
            operationFromStorage(existingOperation),
            conflictOp,
          );
        }
      } else {
        throw e;
      }
    }
  }

  async addDocumentOperationsWithTransaction<TDocument extends PHDocument>(
    id: string,
    callback: (document: TDocument) => Promise<{
      operations: Operation[];
      document: PHDocument;
    }>,
  ) {
    let result: {
      operations: Operation[];
      document: PHDocument;
    } | null = null;

    await this.db.$transaction(
      async (tx) => {
        const document = await this.get<TDocument>(id, tx);
        if (!document) {
          return Promise.reject(new DocumentNotFoundError(id));
        }
        result = await callback(document);

        const { operations, document: newDocument } = result;
        return this._addDocumentOperations(tx, id, operations, newDocument);
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
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    return this._addDocumentOperations(this.db, id, operations, document);
  }

  async getOperationResultingState(
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
    return this.getOperationResultingState(drive, index, scope, branch);
  }

  async getSynchronizationUnitsRevision(
    units: SynchronizationUnitQuery[],
  ): Promise<
    {
      documentId: string;
      documentType: string;
      scope: string;
      branch: string;
      lastUpdated: string;
      revision: number;
    }[]
  > {
    if (units.length === 0) {
      return [];
    }

    const documentTypes = await this.db.document.findMany({
      where: {
        id: { in: [...new Set(units.map((unit) => unit.documentId)).keys()] },
      },
      select: { id: true, documentType: true },
    });

    // TODO add branch condition
    const whereClauses = units
      .map((_, index) => {
        return `("documentId" = $${index * 2 + 1} AND "scope" = $${index * 2 + 2})`;
      })
      .join(" OR ");

    const query = `
            SELECT "documentId", "scope", "branch", MAX("timestamp") as "lastUpdated", MAX("index") + 1 as revision FROM "Operation"
            WHERE ${whereClauses}
            GROUP BY "documentId", "scope", "branch"
        `;

    const params = units.map((unit) => [unit.documentId, unit.scope]).flat();
    const results = await this.db.$queryRawUnsafe<
      {
        documentId: string;
        lastUpdated: string;
        scope: string;
        branch: string;
        revision: number;
      }[]
    >(query, ...params);

    return results.map((row) => ({
      ...row,
      documentId: row.documentId,
      documentType: documentTypes.find((doc) => doc.id === row.documentId)!
        .documentType,
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
