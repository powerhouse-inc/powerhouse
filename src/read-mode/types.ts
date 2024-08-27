import {
    DocumentDriveDocument,
    ListenerFilter
} from 'document-model-libs/document-drive';
import { Document, DocumentModel } from 'document-model/document';
import { DocumentDriveServerMixin, RemoteDriveOptions } from '../server';
import {
    ReadDocumentNotFoundError,
    ReadDriveNotFoundError,
    ReadDriveSlugNotFoundError
} from './errors';

// This mixin adds a scale property, with getters and setters
// for changing it with an encapsulated private property:

export type ReadModeDriveServerMixin =
    DocumentDriveServerMixin<IReadMoveDriveServer>;

export interface IReadMoveDriveServer extends IReadModeDriveService {
    migrateReadDrive(
        id: string,
        options: RemoteDriveOptions
    ): Promise<DocumentDriveDocument | ReadDriveNotFoundError>;
}

export type ReadDriveContext = {
    url: string;
    filter: ListenerFilter;
};

export type ReadDocument<D extends Document> = Omit<D, 'operations'>;
export type ReadDrive = ReadDocument<DocumentDriveDocument>;

export interface IReadModeDriveService {
    addReadDrive(id: string, context: ReadDriveContext): Promise<void>;

    getReadDrives(): Promise<string[]>;

    getReadDriveBySlug(
        slug: string
    ): Promise<ReadDrive | ReadDriveSlugNotFoundError>;

    getReadDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError>;

    getReadDriveContext(
        id: string
    ): Promise<ReadDriveContext | ReadDriveNotFoundError>;

    fetchDriveState(id: string): Promise<ReadDrive | ReadDriveNotFoundError>;

    fetchDocumentState<D extends Document>(
        driveId: string,
        documentId: string,
        documentType?: string
    ): Promise<
        ReadDocument<D> | ReadDriveNotFoundError | ReadDocumentNotFoundError
    >;

    deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined>;
}

export type GetDocumentModel = (documentType: string) => DocumentModel;
