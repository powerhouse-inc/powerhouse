import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { BaseDocumentDriveServer } from '.';
import {
    IReadModeDriveStorage,
    ReadDrive,
    ReadDriveContext,
    ReadDriveNotFoundError,
    ReadDriveSlugNotFoundError,
    ReadModeStorage
} from '../storage/read-mode';
import { logger } from '../utils/logger';
import { RemoteDriveOptions } from './types';

// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

// This mixin adds a scale property, with getters and setters
// for changing it with an encapsulated private property:

export type DocumentDriveServer = Constructor<BaseDocumentDriveServer>;

export interface IReadMoveDriveServer extends IReadModeDriveStorage {
    migrateReadDrive(
        id: string,
        options: RemoteDriveOptions
    ): Promise<DocumentDriveDocument | ReadDriveNotFoundError>;
}

export function ReadModeServer<TBase extends DocumentDriveServer>(
    Base: TBase
): Constructor<BaseDocumentDriveServer & IReadMoveDriveServer> {
    return class ReadMode extends Base implements IReadMoveDriveServer {
        #readModeStorage: IReadModeDriveStorage;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            super(...args);

            this.#readModeStorage = new ReadModeStorage(
                this.getDocumentModel.bind(this)
            );
        }

        getReadDrives(): Promise<string[]> {
            return this.#readModeStorage.getReadDrives();
        }

        getReadDrive(id: string) {
            return this.#readModeStorage.getReadDrive(id);
        }

        getReadDriveBySlug(
            slug: string
        ): Promise<ReadDrive | ReadDriveSlugNotFoundError> {
            return this.#readModeStorage.getReadDriveBySlug(slug);
        }

        getReadDriveContext(id: string) {
            return this.#readModeStorage.getReadDriveContext(id);
        }

        addReadDrive(id: string, context: ReadDriveContext) {
            return this.#readModeStorage.addReadDrive(id, context);
        }

        fetchDriveState(id: string) {
            return this.#readModeStorage.fetchDriveState(id);
        }

        fetchDocumentState<D extends Document>(
            driveId: string,
            documentId: string,
            documentType?: string
        ) {
            return this.#readModeStorage.fetchDocumentState<D>(
                driveId,
                documentId,
                documentType
            );
        }

        deleteReadDrive(id: string) {
            return this.#readModeStorage.deleteReadDrive(id);
        }

        async migrateReadDrive(id: string, options: RemoteDriveOptions) {
            const result = await this.getReadDriveContext(id);
            if (result instanceof Error) {
                return result;
            }

            try {
                const newDrive = await this.addRemoteDrive(result.url, options);
                return newDrive;
            } catch (error) {
                // if an error is thrown, then add the read drive again
                logger.error(error);
                await this.addReadDrive(id, result);
                throw error;
            }
        }
    };
}
