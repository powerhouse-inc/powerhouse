import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
    DocumentDriveAction,
    DocumentDriveLocalState,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import type {
    BaseAction,
    DocumentHeader,
    ExtendedState,
    Operation,
    OperationScope
} from 'document-model/document';
import { ConflictOperationError } from '../server/error';
import { logger } from '../utils/logger';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

type Transaction = Omit<
    PrismaClient<Prisma.PrismaClientOptions, never>,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function storageToOperation(
    op: Prisma.$OperationPayload['scalars']
): Operation {
    return {
        skip: op.skip,
        hash: op.hash,
        index: op.index,
        timestamp: new Date(op.timestamp).toISOString(),
        input: op.input,
        type: op.type,
        scope: op.scope as OperationScope
        // attachments: fileRegistry
    };
}

type PrismaStorageOptions = {
    maxTransactionRetries?: number;
}

const MAX_TRANSACTION_RETRIES = 5;

export class PrismaStorage implements IDriveStorage {
    private db: PrismaClient;
    private maxTransactionRetries: number;

    constructor(db: PrismaClient, options?: PrismaStorageOptions) {
        this.db = db;
        this.maxTransactionRetries = options?.maxTransactionRetries ?? MAX_TRANSACTION_RETRIES;
    }

    async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
        // drive for all drive documents
        await this.createDocument('drives', id, drive as DocumentStorage);
    }
    async addDriveOperations(
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        await this.addDocumentOperations('drives', id, operations, header);
    }

    async addDriveOperationsWithTransaction(
        drive: string,
        callback: (document: DocumentDriveStorage) => Promise<{
            operations: Operation<DocumentDriveAction | BaseAction>[];
            header: DocumentHeader;
            updatedOperations?: Operation[] | undefined;
        }>
    ) {
        return this.addDocumentOperationsWithTransaction(
            'drives',
            drive,
            document => callback(document as DocumentDriveStorage)
        );
    }

    async createDocument(
        drive: string,
        id: string,
        document: DocumentStorage
    ): Promise<void> {
        await this.db.document.upsert({
            where: {
                id_driveId: {
                    id,
                    driveId: drive
                }
            },
            update: {},
            create: {
                name: document.name,
                documentType: document.documentType,
                driveId: drive,
                initialState: document.initialState as Prisma.InputJsonObject,
                lastModified: document.lastModified,
                revision: document.revision,
                id
            }
        });
    }

    private async _addDocumentOperations(
        tx: Transaction,
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
        updatedOperations: Operation[] = []
    ): Promise<void> {
        const document = await this.getDocument(drive, id, tx);
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }

        try {
            await tx.operation.createMany({
                data: operations.map(op => ({
                    driveId: drive,
                    documentId: id,
                    hash: op.hash,
                    index: op.index,
                    input: op.input as Prisma.InputJsonObject,
                    timestamp: op.timestamp,
                    type: op.type,
                    scope: op.scope,
                    branch: 'main',
                    skip: op.skip
                }))
            });

            await Promise.all(
                updatedOperations.map(op =>
                    tx.operation.updateMany({
                        where: {
                            AND: {
                                driveId: drive,
                                documentId: id,
                                scope: op.scope,
                                branch: 'main',
                                index: op.index
                            }
                        },
                        data: {
                            driveId: drive,
                            documentId: id,
                            hash: op.hash,
                            index: op.index,
                            input: op.input as Prisma.InputJsonObject,
                            timestamp: op.timestamp,
                            type: op.type,
                            scope: op.scope,
                            branch: 'main',
                            skip: op.skip
                        }
                    })
                )
            );

            await tx.document.updateMany({
                where: {
                    id,
                    driveId: drive
                },
                data: {
                    lastModified: header.lastModified,
                    revision: header.revision
                }
            });
        } catch (e) {
            // P2002: Unique constraint failed
            // Operation with existing index
            if (
                e instanceof PrismaClientKnownRequestError &&
                e.code === 'P2002'
            ) {
                const existingOperation = await this.db.operation.findFirst({
                    where: {
                        AND: operations.map(op => ({
                            driveId: drive,
                            documentId: id,
                            scope: op.scope,
                            branch: 'main',
                            index: op.index
                        }))
                    }
                });

                const conflictOp = operations.find(
                    op =>
                        existingOperation?.index === op.index &&
                        existingOperation.scope === op.scope
                );

                if (!existingOperation || !conflictOp) {
                    throw e;
                } else {
                    throw new ConflictOperationError(
                        storageToOperation(existingOperation),
                        conflictOp
                    );
                }
            } else {
                throw e;
            }
        }
    }

    async addDocumentOperationsWithTransaction(
        drive: string,
        id: string,
        callback: (document: DocumentStorage) => Promise<{
            operations: Operation[];
            header: DocumentHeader;
            updatedOperations?: Operation[] | undefined;
        }>
    ) {
        let result: {
            operations: Operation[];
            header: DocumentHeader;
            updatedOperations?: Operation[] | undefined;
        } | null = null;
        let retries = 0

        while (retries < this.maxTransactionRetries) {
            try {
                await this.db.$transaction(async tx => {
                    const document = await this.getDocument(drive, id, tx);
                    if (!document) {
                        throw new Error(`Document with id ${id} not found`);
                    }
                    result = await callback(document);

                    const { operations, header, updatedOperations } = result;
                    return this._addDocumentOperations(
                        tx,
                        drive,
                        id,
                        operations,
                        header,
                        updatedOperations
                    );
                }, { isolationLevel: "Serializable" });
                break;
            } catch (error) {
                // transaction lock failed due to concurrent operations
                if ((error as { code: string }).code === 'P2034') {
                    retries++
                    continue;
                }
                throw error;
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!result) {
            throw new Error('No operations were provided');
        }

        return result;
    }

    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
        updatedOperations: Operation[] = []
    ): Promise<void> {
        return this._addDocumentOperations(
            this.db,
            drive,
            id,
            operations,
            header,
            updatedOperations
        );
    }

    async getDocuments(drive: string) {
        const docs = await this.db.document.findMany({
            where: {
                AND: {
                    driveId: drive,
                    NOT: {
                        id: 'drives'
                    }
                }
            }
        });

        return docs.map(doc => doc.id);
    }

    async getDocument(driveId: string, id: string, tx?: Transaction) {
        const result = await (tx ?? this.db).document.findFirst({
            where: {
                id: id,
                driveId: driveId
            },
            include: {
                operations: {
                    orderBy: {
                        index: 'asc'
                    },
                    include: {
                        attachments: true
                    }
                }
            }
        });

        if (result === null) {
            throw new Error(`Document with id ${id} not found`);
        }

        const dbDoc = result;
        const doc = {
            created: dbDoc.created.toISOString(),
            name: dbDoc.name ? dbDoc.name : '',
            documentType: dbDoc.documentType,
            initialState: dbDoc.initialState as ExtendedState<
                DocumentDriveState,
                DocumentDriveLocalState
            >,
            lastModified: new Date(dbDoc.lastModified).toISOString(),
            operations: {
                global: dbDoc.operations
                    .filter(op => op.scope === 'global' && !op.clipboard)
                    .map(storageToOperation),
                local: dbDoc.operations
                    .filter(op => op.scope === 'local' && !op.clipboard)
                    .map(storageToOperation)
            },
            clipboard: dbDoc.operations
                .filter(op => op.clipboard)
                .map(storageToOperation),
            revision: dbDoc.revision as Record<OperationScope, number>
        };

        return doc;
    }

    async deleteDocument(drive: string, id: string) {
        await this.db.document.delete({
            where: {
                id_driveId: {
                    driveId: drive,
                    id: id
                }
            },
            include: {
                operations: {
                    include: {
                        attachments: true
                    }
                }
            }
        });
    }

    async getDrives() {
        return this.getDocuments('drives');
    }

    async getDrive(id: string) {
        try {
            const doc = await this.getDocument('drives', id);
            return doc as DocumentDriveStorage;
        } catch (e) {
            logger.error(e);
            throw new Error(`Drive with id ${id} not found`);
        }
    }

    async deleteDrive(id: string) {
        await this.db.document.deleteMany({
            where: {
                driveId: id
            }
        });
        await this.deleteDocument('drives', id);
    }
}
