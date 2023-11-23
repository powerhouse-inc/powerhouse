import {
    CreateDocumentInput,
    DocumentDriveServer,
    DriveInput,
} from 'document-drive/server';
import { MemoryStorage } from 'document-drive/storage';
import { DocumentModel, Operation } from 'document-model/document';
import { IpcMain } from 'electron';

export default (
    documentModels: DocumentModel[],
    path: string,
    ipcMain: IpcMain
) => {
    const documentDrive = new DocumentDriveServer(
        documentModels,
        // new FilesystemStorage(path)
        new MemoryStorage()
    );

    documentDrive.addDrive({ id: '1', name: 'Local Device', icon: null });

    ipcMain.handle('documentDrive:getDrives', () => documentDrive.getDrives());
    ipcMain.handle('documentDrive:getDrive', (_e, id: string) =>
        documentDrive.getDrive(id)
    );
    ipcMain.handle('documentDrive:addDrive', (_e, input: DriveInput) =>
        documentDrive.addDrive(input)
    );
    ipcMain.handle('documentDrive:deleteDrive', (_e, id: string) =>
        documentDrive.deleteDrive(id)
    );

    ipcMain.handle('documentDrive:getDocuments', (_e, drive: string) =>
        documentDrive.getDocuments(drive)
    );
    ipcMain.handle(
        'documentDrive:getDocument',
        (_e, drive: string, id: string) => documentDrive.getDocument(drive, id)
    );
    ipcMain.handle(
        'documentDrive:createDocument',
        (_e, drive: string, input: CreateDocumentInput) =>
            documentDrive.createDocument(drive, input)
    );
    ipcMain.handle(
        'documentDrive:deleteDocument',
        (_e, drive: string, id: string) =>
            documentDrive.deleteDocument(drive, id)
    );
    ipcMain.handle(
        'documentDrive:addOperation',
        (_e, drive: string, id: string, operation: Operation) =>
            documentDrive.addOperation(drive, id, operation)
    );
};
