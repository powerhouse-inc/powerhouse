import {
    AddFileInput,
    AddFolderInput,
    DocumentDriveAction,
    DocumentDriveState,
    FileNode,
    FolderNode,
    Node,
    UpdateFileInput,
} from 'document-model-libs/document-drive';
import { Action, Document, Immutable } from 'document-model/document';

export interface SortOptions {
    afterNodePath?: string;
}

export interface IDocumentDrive {
    getDocument(): Promise<
        Immutable<Document<DocumentDriveState, DocumentDriveAction>>
    >;
    openFile: <S = unknown, A extends Action = Action>(
        path: string,
        driveId: string
    ) => Promise<Document<S, A>>;
    addFile(file: AddFileInput, document: Document): Promise<FileNode>;
    updateFile(file: UpdateFileInput, document: Document): Promise<FileNode>;
    addFolder(folder: AddFolderInput): Promise<FolderNode>;
    deleteNode(drive: string, path: string): Promise<void>;
    renameNode(drive: string, path: string, name: string): Promise<Node>;
    copyOrMoveNode(
        drive: string,
        srcPath: string,
        destPath: string,
        operation: string,
        sort?: SortOptions
    ): Promise<void>;
}

export { initElectronDocumentDrive } from './electron-document-drive';
