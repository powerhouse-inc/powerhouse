import { getReactorDefaultDrivesConfig } from '#utils';
import {
    BaseQueueManager,
    type DocumentDriveAction,
    type DriveInput,
    type IDocumentDriveServer,
    InMemoryCache,
    logger,
    ReactorBuilder,
    type RemoteDriveOptions,
} from 'document-drive';
import { FilesystemStorage } from 'document-drive/storage/filesystem';
import {
    type DocumentAction,
    type DocumentModelModule,
    type Operation,
} from 'document-model';
import { type IpcMain, webContents } from 'electron';
import { join } from 'path';

export default (
    documentModels: DocumentModelModule[],
    path: string,
    ipcMain: IpcMain,
) => {
    const documentDrive = new ReactorBuilder(documentModels)
        .withStorage(new FilesystemStorage(join(path, 'Document Drives')))
        .withCache(new InMemoryCache())
        .withQueueManager(new BaseQueueManager(1, 10))
        .withOptions({ ...getReactorDefaultDrivesConfig() })
        .build();

    const promise = documentDrive
        .initialize()
        .then(() => bindEvents(documentDrive))
        .catch(logger.error);

    ipcMain.handle('documentDrive:getDrives', () => documentDrive.getDrives());
    ipcMain.handle('documentDrive:getDrive', (_e, id: string) =>
        documentDrive.getDrive(id),
    );
    ipcMain.handle('documentDrive:addDrive', (_e, input: DriveInput) =>
        documentDrive.addDrive(input),
    );
    ipcMain.handle(
        'documentDrive:addRemoteDrive',
        (_e, url: string, options: RemoteDriveOptions) =>
            documentDrive.addRemoteDrive(url, options),
    );
    ipcMain.handle('documentDrive:deleteDrive', (_e, id: string) =>
        documentDrive.deleteDrive(id),
    );

    ipcMain.handle('documentDrive:getDocuments', (_e, drive: string) =>
        documentDrive.getDocuments(drive),
    );
    ipcMain.handle(
        'documentDrive:getDocument',
        (_e, drive: string, id: string) => documentDrive.getDocument(drive, id),
    );
    ipcMain.handle(
        'documentDrive:addOperation',
        (
            _e,
            drive: string,
            id: string,
            operation: Operation,
            forceSync?: boolean,
        ) => documentDrive.addOperation(drive, id, operation, { forceSync }),
    );

    ipcMain.handle(
        'documentDrive:addOperations',
        (
            _e,
            drive: string,
            id: string,
            operations: Operation[],
            forceSync?: boolean,
        ) => documentDrive.addOperations(drive, id, operations, { forceSync }),
    );

    ipcMain.handle(
        'documentDrive:queueOperation',
        (
            _e,
            drive: string,
            id: string,
            operation: Operation,
            forceSync?: boolean,
        ) => documentDrive.queueOperation(drive, id, operation, { forceSync }),
    );

    ipcMain.handle(
        'documentDrive:queueOperations',
        (
            _e,
            drive: string,
            id: string,
            operations: Operation[],
            forceSync?: boolean,
        ) =>
            documentDrive.queueOperations(drive, id, operations, { forceSync }),
    );

    ipcMain.handle(
        'documentDrive:addDriveOperation',
        (
            _e,
            drive: string,
            operation: Operation<DocumentDriveAction>,
            forceSync?: boolean,
        ) => documentDrive.addDriveOperation(drive, operation, { forceSync }),
    );

    ipcMain.handle(
        'documentDrive:addDriveOperations',
        (
            _e,
            drive: string,
            operations: Operation<DocumentDriveAction | DocumentAction>[],
            forceSync?: boolean,
        ) => documentDrive.addDriveOperations(drive, operations, { forceSync }),
    );

    ipcMain.handle(
        'documentDrive:queueDriveOperation',
        (
            _e,
            drive: string,
            operation: Operation<DocumentDriveAction | DocumentAction>,
            forceSync?: boolean,
        ) =>
            documentDrive.queueDriveOperations(drive, [operation], {
                forceSync,
            }),
    );

    ipcMain.handle(
        'documentDrive:queueDriveOperations',
        (
            _e,
            drive: string,
            operations: Operation<DocumentDriveAction | DocumentAction>[],
            forceSync?: boolean,
        ) =>
            documentDrive.queueDriveOperations(drive, operations, {
                forceSync,
            }),
    );

    ipcMain.handle('documentDrive:clearStorage', () =>
        documentDrive.clearStorage(),
    );

    ipcMain.handle('documentDrive:getSyncStatus', (_e, drive: string) =>
        documentDrive.getSyncStatus(drive),
    );

    ipcMain.handle(
        'documentDrive:registerPullResponderTrigger',
        (
            _e,
            drive: string,
            url: string,
            options: Pick<RemoteDriveOptions, 'pullFilter' | 'pullInterval'>,
        ) => documentDrive.registerPullResponderTrigger(drive, url, options),
    );

    function bindEvents(drive: IDocumentDriveServer) {
        drive.on('strandUpdate', update => {
            webContents
                .getAllWebContents()
                .forEach(wc =>
                    wc.send('documentDrive:event:strandUpdate', update),
                );
        });

        drive.on('syncStatus', (driveId, status, error) => {
            webContents.getAllWebContents().forEach(wc => {
                wc.send(
                    'documentDrive:event:syncStatus',
                    driveId,
                    status,
                    error,
                );
            });
        });
    }

    return promise;
};
