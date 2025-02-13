import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type {
  AttachmentInput,
  BaseDocument,
  BaseState,
  DocumentHeader,
  DocumentOperations,
  ExtendedState,
  FileRegistry,
  Operation,
  OperationScope,
} from "document-model";
import { IBackOffOptions, backOff } from "exponential-backoff";
import {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "../drive-document-model/gen/types.js";
import { ConflictOperationError, DriveNotFoundError } from "../server/error.js";
import { SynchronizationUnitQuery } from "../server/types.js";
import { logger } from "../utils/logger.js";
import { IDriveStorage, IStorageDelegate } from "./types.js";

type Transaction =
  | Omit<
      PrismaClient<Prisma.PrismaClientOptions, never>,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
    >
  | ExtendedPrismaClient;

function storageToOperation<TGlobalState, TLocalState>(
  op: Prisma.$OperationPayload["scalars"] & {
    attachments?: AttachmentInput[];
  },
): Operation<TGlobalState, TLocalState> {
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
  } as Operation<TGlobalState, TLocalState>;
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

export class PrismaStorage implements IDriveStorage {
  private db: ExtendedPrismaClient;
  private delegate: IStorageDelegate | undefined;

  constructor(db: PrismaClient, options?: PrismaStorageOptions) {
    const backOffOptions = options?.transactionRetryBackoff;
    this.db = getRetryTransactionsClient(db, {
      ...backOffOptions,
      jitter: backOffOptions?.jitter ?? "full",
    });
  }

  setStorageDelegate(delegate: IStorageDelegate): void {
    this.delegate = delegate;
  }

  async createDrive(id: string, drive: DocumentDriveDocument): Promise<void> {
    // drive for all drive documents
    await this.createDocument("drives", id, drive);
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
    operations: Operation<DocumentDriveState, DocumentDriveLocalState>[],
    header: DocumentHeader,
  ): Promise<void> {
    await this.addDocumentOperations("drives", id, operations, header);
  }

  async addDriveOperationsWithTransaction<TGlobalState, TLocalState>(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation<TGlobalState, TLocalState>[];
      header: DocumentHeader;
    }>,
  ) {
    return this.addDocumentOperationsWithTransaction(
      "drives",
      drive,
      (document) => callback(document as DocumentDriveDocument),
    );
  }

  async createDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    document: BaseDocument<TGlobalState, TLocalState>,
  ): Promise<void> {
    await this.db.document.upsert({
      where: {
        id_driveId: {
          id,
          driveId: drive,
        },
      },
      update: {},
      create: {
        name: document.name,
        documentType: document.documentType,
        driveId: drive,
        initialState: JSON.stringify(document.initialState),
        lastModified: document.lastModified,
        revision: JSON.stringify(document.revision),
        id,
      },
    });
  }

  private async _addDocumentOperations<TGlobalState, TLocalState>(
    tx: Transaction,
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    header: DocumentHeader,
  ): Promise<void> {
    try {
      await tx.operation.createMany({
        data: operations.map((op) => ({
          driveId: drive,
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
      });

      await tx.document.updateMany({
        where: {
          id,
          driveId: drive,
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

  async addDocumentOperationsWithTransaction<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    callback: (document: BaseDocument<TGlobalState, TLocalState>) => Promise<{
      operations: Operation<TGlobalState, TLocalState>[];
      header: DocumentHeader;
      newState?: BaseState<TGlobalState, TLocalState> | undefined;
    }>,
  ) {
    let result: {
      operations: Operation<TGlobalState, TLocalState>[];
      header: DocumentHeader;
      newState?: BaseState<TGlobalState, TLocalState> | undefined;
    } | null = null;

    await this.db.$transaction(
      async (tx) => {
        const document = await this.getDocument<TGlobalState, TLocalState>(
          drive,
          id,
          tx,
        );
        if (!document) {
          throw new Error(`Document with id ${id} not found`);
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

  async addDocumentOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    header: DocumentHeader,
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

  async getDocument<TGlobalState, TLocalState>(
    driveId: string,
    id: string,
    tx?: Transaction,
  ): Promise<BaseDocument<TGlobalState, TLocalState>> {
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
            WHERE "driveId" = $1 AND "documentId" = $2
            AND (${conditions.join(" OR ")})
            ORDER BY scope, index;
        `,
      driveId,
      id,
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

    const operationsByScope = queryOperations.reduce<
      DocumentOperations<TGlobalState, TLocalState>
    >(
      (acc, operation) => {
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
        acc[scope].push(result as Operation<TGlobalState, TLocalState>);
        return acc;
      },
      cachedOperations as DocumentOperations<TGlobalState, TLocalState>,
    );

    const dbDoc = result;
    const doc: BaseDocument<TGlobalState, TLocalState> = {
      created: dbDoc.created.toISOString(),
      name: dbDoc.name ? dbDoc.name : "",
      documentType: dbDoc.documentType,
      initialState: JSON.parse(dbDoc.initialState) as ExtendedState<
        TGlobalState,
        TLocalState
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
        prismaError.message?.includes(
          "An operation failed because it depends on one or more records that were required but not found.",
        )
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
      return doc as DocumentDriveDocument;
    } catch (e) {
      logger.error(e);
      throw new DriveNotFoundError(id);
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
    branch: string,
  ): Promise<string | undefined> {
    const operation = await this.db.operation.findUnique({
      where: {
        unique_operation: {
          driveId,
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
