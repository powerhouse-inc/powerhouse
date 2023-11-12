import { IpcMain } from 'electron';
import ElectronStore from 'electron-store';
import { initElectronDocumentDrive } from 'src/services/document-drive';

export default async (store: ElectronStore, path: string, ipcMain: IpcMain) => {
    const documentDrive = await initElectronDocumentDrive(store, path);
    ipcMain.handle('documentDrive', () => documentDrive.getDocument());
    ipcMain.handle('documentDrive:openFile', async (_e, drive, path) =>
        documentDrive.openFile(drive, path)
    );
    ipcMain.handle('documentDrive:addFile', (_e, input, document) =>
        documentDrive.addFile(input, document)
    );
    ipcMain.handle('documentDrive:addFolder', (_e, input) =>
        documentDrive.addFolder(input)
    );
    ipcMain.handle('documentDrive:deleteNode', async (_e, drive, path) =>
        documentDrive.deleteNode(drive, path)
    );
    ipcMain.handle('documentDrive:renameNode', async (_e, drive, path, name) =>
        documentDrive.renameNode(drive, path, name)
    );
    ipcMain.handle(
        'documentDrive:copyOrMoveNode',
        async (_e, drive, srcPath, destPath, operation) =>
            documentDrive.copyOrMoveNode(drive, srcPath, destPath, operation)
    );
};
