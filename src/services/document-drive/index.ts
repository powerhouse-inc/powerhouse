import {
    AddFileInput,
    AddFolderInput,
    DocumentDriveAction,
    DocumentDriveState,
    FileNode,
    FolderNode,
    Node,
} from 'document-model-libs/document-drive';
import { Action, Document, Immutable } from 'document-model/document';

export interface IDocumentDrive {
    getDocument(): Promise<
        Immutable<Document<DocumentDriveState, DocumentDriveAction>>
    >;
    openFile: <S = unknown, A extends Action = Action>(
        path: string,
        driveId: string
    ) => Promise<Document<S, A>>;
    addFile(file: AddFileInput, document: Document): Promise<FileNode>;
    addFolder(folder: AddFolderInput): Promise<FolderNode>;
    deleteNode(drive: string, path: string): Promise<void>;
    renameNode(drive: string, path: string, name: string): Promise<Node>;
}

export { initElectronDocumentDrive } from './electron-document-drive';
