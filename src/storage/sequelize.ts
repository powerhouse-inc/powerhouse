import {
    DocumentDriveLocalState,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import {
    AttachmentInput,
    DocumentHeader,
    ExtendedState,
    Operation,
    OperationScope
} from 'document-model/document';
import { DataTypes, Options, Sequelize } from 'sequelize';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

export class SequelizeStorage implements IDriveStorage {
    private db: Sequelize;

    constructor(options: Options) {
        this.db = new Sequelize(options);
    }

    public syncModels() {
        const Document = this.db.define('document', {
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            driveId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            name: DataTypes.STRING,
            documentType: DataTypes.STRING,
            initialState: DataTypes.JSON,
            lastModified: DataTypes.DATE,
            revision: DataTypes.JSON
        });

        const Operation = this.db.define('operation', {
            driveId: {
                type: DataTypes.STRING,
                primaryKey: true,
                unique: 'unique_operation'
            },
            documentId: {
                type: DataTypes.STRING,
                primaryKey: true,
                unique: 'unique_operation'
            },
            hash: DataTypes.STRING,
            index: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                unique: 'unique_operation'
            },
            input: DataTypes.JSON,
            timestamp: DataTypes.DATE,
            type: DataTypes.STRING,
            scope: {
                type: DataTypes.STRING,
                primaryKey: true,
                unique: 'unique_operation'
            },
            branch: {
                type: DataTypes.STRING,
                primaryKey: true,
                unique: 'unique_operation'
            }
        });

        const Attachment = this.db.define('attachment', {
            driveId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            documentId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            scope: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            branch: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            index: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            hash: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            mimeType: DataTypes.STRING,
            fileName: DataTypes.STRING,
            extension: DataTypes.STRING,
            data: DataTypes.BLOB
        });

        Operation.hasMany(Attachment, {
            onDelete: 'CASCADE'
        });
        Attachment.belongsTo(Operation);
        Document.hasMany(Operation, {
            onDelete: 'CASCADE'
        });
        Operation.belongsTo(Document);

        return this.db.sync({ force: true });
    }

    async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
        await this.createDocument('drives', id, drive as DocumentStorage);
    }
    async addDriveOperations(
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        await this.addDocumentOperations('drives', id, operations, header);
    }
    async createDocument(
        drive: string,
        id: string,
        document: DocumentStorage
    ): Promise<void> {
        const Document = this.db.models.document;

        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.create({
            id: id,
            driveId: drive,
            name: document.name,
            documentType: document.documentType,
            initialState: document.initialState,
            lastModified: document.lastModified,
            revision: document.revision
        });
    }
    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        const document = await this.getDocument(drive, id);
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }

        const Operation = this.db.models.operation;
        if (!Operation) {
            throw new Error('Operation model not found');
        }

        await Promise.all(
            operations.map(async op => {
                return Operation.create({
                    driveId: drive,
                    documentId: id,
                    hash: op.hash,
                    index: op.index,
                    input: op.input,
                    timestamp: op.timestamp,
                    type: op.type,
                    scope: op.scope,
                    branch: 'main'
                }).then(async () => {
                    if (op.attachments) {
                        await this._addDocumentOperationAttachments(
                            drive,
                            id,
                            op,
                            op.attachments
                        );
                    }
                });
            })
        );

        const Document = this.db.models.document;
        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.update(
            {
                lastModified: header.lastModified,
                revision: header.revision
            },
            {
                where: {
                    id: id,
                    driveId: drive
                }
            }
        );
    }

    async _addDocumentOperationAttachments(
        driveId: string,
        documentId: string,
        operation: Operation,
        attachments: AttachmentInput[]
    ) {
        const Attachment = this.db.models.attachment;
        if (!Attachment) {
            throw new Error('Attachment model not found');
        }

        await Promise.all(
            attachments.map(async attachment => {
                return Attachment.create({
                    driveId: driveId,
                    documentId: documentId,
                    scope: operation.scope,
                    branch: 'main',
                    index: operation.index,
                    mimeType: attachment.mimeType,
                    fileName: attachment.fileName,
                    extension: attachment.extension,
                    data: attachment.data,
                    hash: attachment.hash
                });
            })
        );
    }

    async getDocuments(drive: string) {
        const Document = this.db.models.document;
        if (!Document) {
            throw new Error('Document model not found');
        }

        const result = await Document.findAll({
            attributes: ['id'],
            where: {
                driveId: drive
            }
        });

        const ids = result.map((e: { dataValues: { id: string } }) => {
            const { id } = e.dataValues;
            return id;
        });
        return ids;
    }

    async getDocument(driveId: string, id: string) {
        const Document = this.db.models.document;
        if (!Document) {
            throw new Error('Document model not found');
        }

        const entry = await Document.findOne({
            where: {
                id: id,
                driveId: driveId
            },
            include: [
                {
                    model: this.db.models.operation,
                    as: 'operations'
                }
            ]
        });

        if (entry === null) {
            throw new Error(`Document with id ${id} not found`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const document: {
            operations: [
                {
                    hash: string;
                    index: number;
                    timestamp: Date;
                    input: JSON;
                    type: string;
                    scope: string;
                }
            ];
            revision: Required<Record<OperationScope, number>>;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            documentType: string;
            initialState: ExtendedState<
                DocumentDriveState,
                DocumentDriveLocalState
            >;
        } = entry.dataValues;
        const Operation = this.db.models.operation;
        if (!Operation) {
            throw new Error('Operation model not found');
        }

        const operations = document.operations.map(
            (op: {
                hash: string;
                index: number;
                timestamp: Date;
                input: JSON;
                type: string;
                scope: string;
            }) => ({
                hash: op.hash,
                index: op.index,
                timestamp: new Date(op.timestamp).toISOString(),
                input: op.input,
                type: op.type,
                scope: op.scope as OperationScope
                // attachments: fileRegistry
            })
        );

        const doc = {
            created: document.createdAt.toISOString(),
            name: document.name ? document.name : '',
            documentType: document.documentType,
            initialState: document.initialState,
            lastModified: document.updatedAt.toISOString(),
            operations: {
                global: operations.filter(
                    (op: Operation) => op.scope === 'global'
                ),
                local: operations.filter(
                    (op: Operation) => op.scope === 'local'
                )
            },
            revision: document.revision
        };

        return doc;
    }

    async deleteDocument(drive: string, id: string) {
        const Document = this.db.models.document;
        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.destroy({
            where: {
                id: id,
                driveId: drive
            }
        });
    }

    async getDrives() {
        return this.getDocuments('drives');
    }

    async getDrive(id: string) {
        const doc = await this.getDocument('drives', id);
        return doc as DocumentDriveStorage;
    }

    async deleteDrive(id: string) {
        await this.deleteDocument('drives', id);

        const Document = this.db.models.document;
        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.destroy({
            where: {
                driveId: id
            }
        });
    }
}
