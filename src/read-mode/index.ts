import { Document } from 'document-model/document';
import { DocumentDriveServerConstructor, RemoteDriveOptions } from '../server';
import { logger } from '../utils/logger';
import { ReadDriveSlugNotFoundError } from './errors';
import { ReadModeService } from './service';
import {
    IReadModeDriveService,
    IReadMoveDriveServer,
    ReadDrive,
    ReadDriveContext,
    ReadModeDriveServerMixin
} from './types';

export * from './errors';
export * from './types';

export function ReadModeServer<TBase extends DocumentDriveServerConstructor>(
    Base: TBase
): ReadModeDriveServerMixin {
    return class ReadMode extends Base implements IReadMoveDriveServer {
        #readModeStorage: IReadModeDriveService;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            super(...args);

            this.#readModeStorage = new ReadModeService(
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
