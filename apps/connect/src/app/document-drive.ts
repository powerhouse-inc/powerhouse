import {
    AddDriveInput,
    AddFileInput,
    DocumentDrive,
    DocumentDriveAction,
    DocumentDriveState,
    utils as DriveUtils,
    FileNode,
    UpdateFileInput,
} from 'document-model-libs/document-drive';
import {
    Document,
    ExtendedState,
    utils as baseUtils,
} from 'document-model/document';
import ElectronStore from 'electron-store';
import fs from 'fs/promises';
import path from 'path';

const BASE_PATH = '/Users/acaldas/dev/makerdao/document-model-libs/';

interface IDocumentDrive {
    store: ElectronStore;
    basePath: string;
    document: DocumentDrive;
    openFile: (path: string, driveId: string) => Promise<string>;
}

interface IElectronDocumentDriveSerialized {
    basePath: string;
    document: Document<DocumentDriveState, DocumentDriveAction>;
}

class ElectronDocumentDrive implements IDocumentDrive {
    store: ElectronStore;
    basePath: string;
    document: DocumentDrive;

    static DOCUMENT_DRIVE_KEY = 'DOCUMENT_DRIVE';

    constructor(
        store: ElectronStore,
        basePath: string,
        initialState?:
            | Partial<ExtendedState<Partial<DocumentDriveState>>>
            | undefined
    ) {
        this.store = store;
        this.document = new DocumentDrive(initialState);
        this.basePath = basePath;
    }

    private getPath(...paths: string[]) {
        return path.join(this.basePath, ...paths);
    }

    getDrive(id: string) {
        return this.document.state.drives.find(drive => drive.id === id);
    }

    getNode(driveId: string, path: string) {
        const drive = this.getDrive(driveId);
        return drive?.nodes.find(n => n.path === path);
    }

    save() {
        this.store.set(
            ElectronDocumentDrive.DOCUMENT_DRIVE_KEY,
            this.serialize()
        );
    }

    serialize() {
        return JSON.stringify({
            basePath: this.basePath,
            document: this.document.toDocument(),
        } satisfies IElectronDocumentDriveSerialized);
    }

    static deserialize(input: string, store: ElectronStore) {
        try {
            const { basePath, document } = JSON.parse(
                input
            ) as IElectronDocumentDriveSerialized;
            return new ElectronDocumentDrive(
                store,
                basePath,
                document // TODO
            );
        } catch (error) {
            return undefined;
        }
    }

    static load(store: ElectronStore) {
        const result = store.get(
            ElectronDocumentDrive.DOCUMENT_DRIVE_KEY
        ) as string;
        if (!result) {
            return undefined;
        }
        return this.deserialize(result, store);
    }

    private async saveFile(path: string, document: Document) {
        return fs.writeFile(this.getPath(path), JSON.stringify(document), {
            encoding: 'binary',
        });
    }

    async addFile(input: AddFileInput, document: Document) {
        await this.saveFile(input.path, document);
        this.document.addFile(input);
    }

    async updateFile(input: UpdateFileInput, document: Document) {
        await this.saveFile(input.path, document);
        this.document.updateFile(input);
    }

    async openFile(path: string, driveId: string) {
        const file = this.getNode(driveId, path) as FileNode;
        if (!DriveUtils.isFileNode(file)) {
            throw new Error(
                `Node with path ${path} on drive ${driveId} is not a file`
            );
        }
        return (
            await fs.readFile(this.getPath(file.path), {
                encoding: 'binary',
            })
        ).toString();
    }

    async addDrive(input: AddDriveInput) {
        await fs.mkdir(this.getPath(input.id));
        this.document.addDrive(input);
    }
}

export const initDocumentDrive = (store: ElectronStore) => {
    let documentDrive = ElectronDocumentDrive.load(store);

    if (!documentDrive) {
        documentDrive = new ElectronDocumentDrive(store, BASE_PATH, {
            name: 'My Local Drives',
            state: {
                drives: [
                    {
                        id: baseUtils.hashKey(),
                        name: 'Local Device',
                        hash: 'test',
                        nodes: [
                            {
                                name: 'Document Models',
                                path: 'Document Models',
                                hash: 'folder',
                                kind: 'folder',
                            },
                            {
                                name: 'Address Book',
                                path: 'Document Models/addressBook.phdm.zip',
                                hash: 'Address Book',
                                kind: 'file',
                                documentType: 'powerhouse/document-model',
                            },
                            {
                                name: 'Document Drive',
                                path: 'Document Models/documentDrive.phdm.zip',
                                hash: 'Document Drive',
                                kind: 'file',
                                documentType: 'powerhouse/document-model',
                            },
                            {
                                name: 'Document Editor',
                                path: 'Document Models/documentEditor.phdm.zip',
                                hash: 'Document Editor',
                                kind: 'file',
                                documentType: 'powerhouse/document-model',
                            },
                        ],
                    },
                ],
            },
        });

        documentDrive.save();
    }
    return documentDrive;
};
