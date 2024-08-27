import {
    DocumentDriveDocument,
    documentModel as DriveDocumentModel,
    ListenerFilter
} from 'document-model-libs/document-drive';
import { Document, DocumentModel } from 'document-model/document';
import { GraphQLError } from 'graphql';
import { fetchDocumentState } from '../utils/graphql';

export type ReadDriveContext = {
    url: string;
    filter: ListenerFilter;
};

export type ReadDocument<D extends Document> = Omit<D, 'operations'>;
export type ReadDrive = ReadDocument<DocumentDriveDocument>;

export interface IReadModeDriveStorage {
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

export abstract class ReadDriveError extends Error {}

export class ReadDriveNotFoundError extends ReadDriveError {
    constructor(driveId: string) {
        super(`Read drive ${driveId} not found.`);
    }
}

export class ReadDriveSlugNotFoundError extends ReadDriveError {
    constructor(slug: string) {
        super(`Read drive with slug ${slug} not found.`);
    }
}

export class ReadDocumentNotFoundError extends ReadDriveError {
    constructor(drive: string, id: string) {
        super(`Document with id ${id} not found on read drive ${drive}.`);
    }
}

type GetDocumentModel = (documentType: string) => DocumentModel;

export class ReadModeStorage implements IReadModeDriveStorage {
    #getDocumentModel: GetDocumentModel;
    #drives = new Map<
        string,
        { drive: ReadDrive; context: ReadDriveContext }
    >();

    constructor(getDocumentModel: GetDocumentModel) {
        this.#getDocumentModel = getDocumentModel;
    }

    #parseGraphQLErrors(
        errors: GraphQLError[],
        driveId: string,
        documentId?: string
    ) {
        for (const error of errors) {
            if (error.message === `Drive with id ${driveId} not found`) {
                return new ReadDriveNotFoundError(driveId);
            } else if (
                documentId &&
                error.message === `Document with id ${documentId} not found`
            ) {
                return new ReadDocumentNotFoundError(driveId, documentId);
            }
        }
        const firstError = errors.at(0);
        if (firstError) {
            return firstError;
        }
    }

    async #fetchDrive(id: string, url: string) {
        const { errors, document } =
            await fetchDocumentState<DocumentDriveDocument>(
                url,
                id,
                DriveDocumentModel
            );
        const error = errors ? this.#parseGraphQLErrors(errors, id) : undefined;
        return error || document;
    }

    async fetchDriveState(id: string) {
        return this.fetchDocumentState<DocumentDriveDocument>(
            id,
            id,
            DriveDocumentModel.id
        );
    }

    async fetchDocumentState<D extends Document>(
        driveId: string,
        documentId: string,
        documentType?: string
    ) {
        const drive = this.#drives.get(driveId);
        if (!drive) {
            return new ReadDriveNotFoundError(driveId);
        }

        const documentModel = documentType
            ? this.#getDocumentModel(documentType)
            : undefined;
        const { url } = drive.context;
        const { errors, document } = await fetchDocumentState<D>(
            url,
            documentId,
            documentModel?.documentModel
        );

        if (errors) {
            const error = this.#parseGraphQLErrors(errors, driveId, documentId);
            if (error instanceof ReadDriveError) {
                return error;
            } else if (error) {
                throw error;
            }
        }

        if (document) {
            return document as unknown as ReadDocument<D>;
        } else {
            return new ReadDocumentNotFoundError(driveId, documentId);
        }
    }

    async addReadDrive(id: string, context: ReadDriveContext) {
        const result = await this.#fetchDrive(id, context.url);
        if (result instanceof Error) {
            throw result;
        } else if (!result) {
            throw new Error(`Drive "${id}" not found at ${context.url}`);
        }
        this.#drives.set(id, {
            drive: result as unknown as ReadDrive,
            context
        });
    }

    async getReadDrives(): Promise<string[]> {
        return Promise.resolve([...this.#drives.keys()]);
    }

    async getReadDrive(id: string) {
        return Promise.resolve(
            this.#drives.get(id)?.drive ?? new ReadDriveNotFoundError(id)
        );
    }

    async getReadDriveBySlug(
        slug: string
    ): Promise<ReadDrive | ReadDriveSlugNotFoundError> {
        const readDrive = [...this.#drives.values()].find(
            ({ drive }) => drive.state.global.slug === slug
        );
        return Promise.resolve(
            readDrive?.drive || new ReadDriveSlugNotFoundError(slug)
        );
    }

    getReadDriveContext(id: string) {
        return Promise.resolve(
            this.#drives.get(id)?.context ?? new ReadDriveNotFoundError(id)
        );
    }

    deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined> {
        const deleted = this.#drives.delete(id);
        return Promise.resolve(
            deleted ? undefined : new ReadDriveNotFoundError(id)
        );
    }
}
