import {
    AddFileInput,
    DocumentDriveAction,
    DocumentDriveState,
    utils as DriveUtils,
    isFileNode,
} from 'document-model-libs/document-drive';
import { Action, Document, Immutable } from 'document-model/document';
import { IDocumentDrive } from '.';

export class RemoteDocumentDrive implements IDocumentDrive {
    private url: string;

    constructor(url: string) {
        this.url = url;
    }

    private async makeRequest<T>(endpoint: string) {
        const response = await fetch(`${this.url}/document/${endpoint}`);
        if (!response.ok) {
            throw new Error(response.statusText);
        }

        const json = response.json();
        return json as T;
    }

    async getDocument() {
        return this.makeRequest<
            Immutable<Document<DocumentDriveState, DocumentDriveAction>>
        >('all');
    }

    // private async saveFile(driveId: string, path: string, document: Document) {
    //     return fetch()
    // }

    async addFile(input: AddFileInput, document: Document) {
        // await this.saveFile(input.drive, input.path, document);
        // this.document.addFile(input);

        const node = await this.getNode(input.drive, input.path);
        if (!node || !isFileNode(node)) {
            throw new Error('Error adding file');
        }

        // this.save();
        return node;
    }

    // async updateFile(input: UpdateFileInput, document: Document) {
    //     await this.saveFile(input.drive, input.path, document);
    //     this.document.updateFile(input);
    // }

    // async deleteNode(drive: string, path: string) {
    //     await this.deleteFile(drive, path);
    //     this.document.deleteNode({ drive, path });
    //     this.save();
    // }

    async getDrive(id: string) {
        const document = await this.getDocument();
        return document.state.drives.find(drive => drive.id === id);
    }

    async getNode(driveId: string, path: string) {
        const drive = await this.getDrive(driveId);
        return drive?.nodes.find(n => n.path === path);
    }

    async openFile<S = unknown, A extends Action = Action>(
        drive: string,
        path: string
    ) {
        const file = await this.getNode(drive, path);
        if (!file) {
            throw new Error(
                `Node with path ${path} not found on drive ${drive}`
            );
        }
        if (!DriveUtils.isFileNode(file)) {
            throw new Error(
                `Node with path ${path} on drive ${drive} is not a file`
            );
        }
        return this.makeRequest<Document<S, A>>(`?drive=${drive}&path=${path}`);
    }
}
