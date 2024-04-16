import { DocumentDriveAction } from 'document-model-libs/document-drive';
import {
    BaseAction,
    Document,
    DocumentHeader,
    Operation
} from 'document-model/document';
import { applyUpdatedOperations, mergeOperations } from '..';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

export class BrowserStorage implements IDriveStorage {
    private db: Promise<LocalForage>;

    static DBName = 'DOCUMENT_DRIVES';
    static SEP = ':';
    static DRIVES_KEY = 'DRIVES';

    constructor(namespace?: string) {
        this.db = import('localforage').then(localForage =>
            localForage.default.createInstance({
                name: namespace ? `${namespace}:${BrowserStorage.DBName}` : BrowserStorage.DBName
            })
        );
    }

    buildKey(...args: string[]) {
        return args.join(BrowserStorage.SEP);
    }

    async getDocuments(drive: string) {
        const keys = await (await this.db).keys();
        const driveKey = `${drive}${BrowserStorage.SEP}`;
        return keys
            .filter(key => key.startsWith(driveKey))
            .map(key => key.slice(driveKey.length));
    }

    async getDocument(driveId: string, id: string) {
        const document = await (
            await this.db
        ).getItem<Document>(this.buildKey(driveId, id));
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }
        return document;
    }

    async createDocument(drive: string, id: string, document: DocumentStorage) {
        await (await this.db).setItem(this.buildKey(drive, id), document);
    }

    async deleteDocument(drive: string, id: string) {
        await (await this.db).removeItem(this.buildKey(drive, id));
    }

    async clearStorage(): Promise<void> {
        return (await this.db).clear();
    }

    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
        updatedOperations: Operation[] = []
    ): Promise<void> {
        const document = await this.getDocument(drive, id);
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }

        const mergedOperations = mergeOperations(
            document.operations,
            operations
        );

        const mergedUpdatedOperations = applyUpdatedOperations(
            mergedOperations,
            updatedOperations
        );

        const db = await this.db;
        await db.setItem(this.buildKey(drive, id), {
            ...document,
            ...header,
            operations: mergedUpdatedOperations
        });
    }

    async getDrives() {
        const db = await this.db;
        const keys = (await db.keys()) ?? [];
        return keys
            .filter(key => key.startsWith(BrowserStorage.DRIVES_KEY))
            .map(key =>
                key.slice(
                    BrowserStorage.DRIVES_KEY.length + BrowserStorage.SEP.length
                )
            );
    }

    async getDrive(id: string) {
        const drive = await (
            await this.db
        ).getItem<DocumentDriveStorage>(
            this.buildKey(BrowserStorage.DRIVES_KEY, id)
        );
        if (!drive) {
            throw new Error(`Drive with id ${id} not found`);
        }
        return drive;
    }

    async createDrive(id: string, drive: DocumentDriveStorage) {
        const db = await this.db;
        await db.setItem(this.buildKey(BrowserStorage.DRIVES_KEY, id), drive);
    }

    async deleteDrive(id: string) {
        const documents = await this.getDocuments(id);
        await Promise.all(documents.map(doc => this.deleteDocument(id, doc)));
        return (await this.db).removeItem(
            this.buildKey(BrowserStorage.DRIVES_KEY, id)
        );
    }

    async addDriveOperations(
        id: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        header: DocumentHeader
    ): Promise<void> {
        const drive = await this.getDrive(id);
        const mergedOperations = mergeOperations(drive.operations, operations);
        const db = await this.db;

        await db.setItem(this.buildKey(BrowserStorage.DRIVES_KEY, id), {
            ...drive,
            ...header,
            operations: mergedOperations
        });
        return;
    }
}
