import type {
    DocumentDriveAction,
    DocumentDriveDocument,
} from 'document-model-libs/document-drive';
import type {
    Action,
    BaseAction,
    Document,
    DocumentHeader,
    DocumentOperations,
    Operation,
} from 'document-model/document';
import type { SynchronizationUnitQuery } from '../server/types';

export type DocumentStorage<D extends Document = Document> = Omit<
    D,
    'attachments'
>;

export type DocumentDriveStorage = DocumentStorage<DocumentDriveDocument>;

export interface IStorageDelegate {
    getCachedOperations(drive: string, id: string): Promise<DocumentOperations<Action> | undefined>;
}

export interface IStorage {
    checkDocumentExists(drive: string, id: string): Promise<boolean>;
    getDocuments: (drive: string) => Promise<string[]>;
    getDocument(drive: string, id: string): Promise<DocumentStorage>;
    createDocument(
        drive: string,
        id: string,
        document: DocumentStorage
    ): Promise<void>;
    addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
    ): Promise<void>;
    addDocumentOperationsWithTransaction?(
        drive: string,
        id: string,
        callback: (document: DocumentStorage) => Promise<{
            operations: Operation[];
            header: DocumentHeader;
        }>
    ): Promise<void>;
    deleteDocument(drive: string, id: string): Promise<void>;
    getOperationResultingState?(drive: string, id: string, index: number, scope: string, branch: string): Promise<unknown>;
    setStorageDelegate?(delegate: IStorageDelegate): void;
    getSynchronizationUnitsRevision(units: SynchronizationUnitQuery[]): Promise<{
        driveId: string;
        documentId: string;
        scope: string;
        branch: string;
        lastUpdated: string;
        revision: number;
    }[]>
}
export interface IDriveStorage extends IStorage {
    getDrives(): Promise<string[]>;
    getDrive(id: string): Promise<DocumentDriveStorage>;
    getDriveBySlug(slug: string): Promise<DocumentDriveStorage>;
    createDrive(id: string, drive: DocumentDriveStorage): Promise<void>;
    deleteDrive(id: string): Promise<void>;
    clearStorage?(): Promise<void>;
    addDriveOperations(
        id: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        header: DocumentHeader
    ): Promise<void>;
    addDriveOperationsWithTransaction?(
        drive: string,
        callback: (document: DocumentDriveStorage) => Promise<{
            operations: Operation[];
            header: DocumentHeader;
        }>
    ): Promise<void>;
    getDriveOperationResultingState?(drive: string, index: number, scope: string, branch: string): Promise<unknown>;
}