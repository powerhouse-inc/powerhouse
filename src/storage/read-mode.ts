import {
    DocumentDriveDocument,
    documentModel as DriveDocumentModel,
    ListenerFilter
} from 'document-model-libs/document-drive';
import { Document, DocumentModel } from 'document-model/document';
import { fetchDocumentState } from '../utils/graphql';
import { DocumentDriveStorage, IDriveStorage } from './types';

export type ReadModeDrive = {
    url: string;
    filter: ListenerFilter;
};

export type IReadModeDriveStorage = {
    addReadDrive(
        id: string,
        drive: DocumentDriveStorage,
        context: ReadModeDrive
    ): Promise<void>;

    fetchDriveState(
        id: string
    ): Promise<Omit<DocumentDriveStorage, 'operations'> | DriveNotFoundError>;
    fetchDocumentState<D extends Document>(
        driveId: string,
        documentId: string,
        documentType?: string
    ): Promise<Omit<D, 'operations'> | DriveNotFoundError>;
};

export class DriveNotFoundError extends Error {
    constructor(driveId: string) {
        super(`Drive ${driveId} not found.`);
    }
}

export class ReadModeNotImplemented extends Error {
    constructor(method: string) {
        super(`${method} is not supported for Read Mode drives`);
    }
}

type GetDocumentModel = (documentType: string) => DocumentModel;

export class ReadModeStorage implements IReadModeDriveStorage, IDriveStorage {
    #baseStorage: IDriveStorage;
    #getDocumentModel: GetDocumentModel;
    #drives: Record<
        string,
        { drive: DocumentDriveStorage; context: ReadModeDrive }
    > = {};

    constructor(
        baseStorage: IDriveStorage,
        getDocumentModel: GetDocumentModel
    ) {
        this.#baseStorage = baseStorage;
        this.#getDocumentModel = getDocumentModel;

        return new Proxy(this, {
            get: (target, prop: keyof ReadModeStorage) => {
                return (...args: any[]) => {
                    const overriddenMethod =
                        prop in target && typeof target[prop] === 'function';
                    const baseMethod =
                        prop in this.#baseStorage &&
                        typeof this.#baseStorage[prop] === 'function';
                    const driveId = args.at(0) as unknown;
                    const readDrive =
                        driveId && typeof driveId === 'string'
                            ? this.#drives[driveId]
                            : undefined;

                    if (readDrive) {
                        if (overriddenMethod) {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                            return Reflect.apply(target[prop], target, args);
                        } else {
                            throw new ReadModeNotImplemented(
                                `${String(prop)} is not implemented.`
                            );
                        }
                    }

                    if (overriddenMethod) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return Reflect.apply(target[prop], target, args);
                    } else if (baseMethod) {
                        return Reflect.apply(
                            // @ts-expect-error: this is a function of the base storage
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                            this.#baseStorage[prop],
                            this.#baseStorage,
                            args
                        );
                    } else {
                        throw new ReadModeNotImplemented(
                            `${String(prop)} is not implemented.`
                        );
                    }
                };
            }
        });
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
        const drive = this.#drives[driveId];
        if (!drive) {
            return new DriveNotFoundError(driveId);
        }
        const documentModel = documentType
            ? this.#getDocumentModel(documentType)
            : undefined;
        const { url } = drive.context;
        return fetchDocumentState<D>(
            url,
            documentId,
            documentModel?.documentModel
        );
    }

    addReadDrive(
        id: string,
        drive: DocumentDriveStorage,
        context: ReadModeDrive
    ) {
        this.#drives[id] = { drive, context };
        return Promise.resolve();
    }

    async getDrives(): Promise<string[]> {
        const drives = await this.#baseStorage.getDrives();
        return drives.concat(Object.keys(this.#drives));
    }

    async getDrive(id: string): Promise<DocumentDriveStorage> {
        const readDrive = this.#drives[id];
        if (readDrive) {
            return readDrive.drive;
        } else {
            return this.#baseStorage.getDrive(id);
        }
    }

    getDriveBySlug(slug: string): Promise<DocumentDriveStorage> {
        const readDrive = Object.values(this.#drives).find(
            ({ drive }) => drive.state.global.slug === slug
        );
        if (readDrive) {
            return Promise.resolve(readDrive.drive);
        } else {
            return this.#baseStorage.getDriveBySlug(slug);
        }
    }
}
