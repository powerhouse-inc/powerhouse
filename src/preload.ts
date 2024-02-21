// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import type {
    DriveInput,
    IDocumentDriveServer,
    SyncStatus,
} from 'document-drive/server';
import {
    DocumentDriveAction,
    DocumentDriveDocument,
} from 'document-model-libs/document-drive';
import { BaseAction, Document, Operation } from 'document-model/document';
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { platformInfo } from './app/detect-platform';
import { Theme } from './store';

const electronApi = {
    platformInfo,
    ready: () => ipcRenderer.send('ready'),
    fileSaved: (document: Document, path?: string) =>
        ipcRenderer.invoke('fileSaved', document, path),
    handleFileOpen: (
        listener: (file: { name: string; content: string }) => void,
    ) => {
        function callback(
            event: IpcRendererEvent,
            file: { name: string; content: string },
        ) {
            listener(file);
        }
        ipcRenderer.on('openFile', callback);
        return () => {
            ipcRenderer.off('openFile', callback);
        };
    },
    handleFileSave: (listener: () => void) => {
        ipcRenderer.on('saveFile', listener);
        return () => {
            ipcRenderer.off('saveFile', listener);
        };
    },
    showTabMenu: (tab: string) => {
        ipcRenderer.invoke('showTabMenu', tab);
    },
    handleAddTab: (
        listener: (event: IpcRendererEvent, tab: string) => void,
    ) => {
        ipcRenderer.on('addTab', listener);
        return () => {
            ipcRenderer.off('addTab', listener);
        };
    },
    handleRemoveTab: (
        listener: (event: IpcRendererEvent, tab: string) => void,
    ) => {
        ipcRenderer.on('removeTab', listener);
        return () => {
            ipcRenderer.off('removeTab', listener);
        };
    },
    handleLogin: (
        listener: (event: IpcRendererEvent, address: string) => void,
    ) => {
        ipcRenderer.on('login', listener);
        return () => {
            ipcRenderer.off('login', listener);
        };
    },
    user: async () => (await ipcRenderer.invoke('user')) as string | undefined,
    openURL: (url: string) => ipcRenderer.invoke('openURL', url),
    setTheme: (theme: Theme) => ipcRenderer.send('theme', theme),
    documentDrive: {
        getDrives: () =>
            ipcRenderer.invoke('documentDrive:getDrives') as Promise<string[]>,
        getDrive: (id: string) =>
            ipcRenderer.invoke(
                'documentDrive:getDrive',
                id,
            ) as Promise<DocumentDriveDocument>,
        addDrive: (drive: DriveInput) =>
            ipcRenderer.invoke('documentDrive:addDrive', drive),
        addRemoteDrive: (url, options) =>
            ipcRenderer.invoke('documentDrive:addRemoteDrive', url, options),
        deleteDrive: (id: string) =>
            ipcRenderer.invoke('documentDrive:deleteDrive', id),
        getDocuments: (drive: string) =>
            ipcRenderer.invoke('documentDrive:getDocuments', drive),
        getDocument: (drive: string, id: string) =>
            ipcRenderer.invoke('documentDrive:getDocument', drive, id),
        addOperation: (drive: string, id: string, operation: Operation) =>
            ipcRenderer.invoke(
                'documentDrive:addOperation',
                drive,
                id,
                operation,
            ),
        addOperations: (drive: string, id: string, operations: Operation[]) =>
            ipcRenderer.invoke(
                'documentDrive:addOperations',
                drive,
                id,
                operations,
            ),
        addDriveOperation: (
            drive: string,
            operation: Operation<DocumentDriveAction | BaseAction>,
        ) =>
            ipcRenderer.invoke(
                'documentDrive:addDriveOperation',
                drive,
                operation,
            ),
        addDriveOperations: (
            drive: string,
            operations: Operation<DocumentDriveAction | BaseAction>[],
        ) =>
            ipcRenderer.invoke(
                'documentDrive:addDriveOperations',
                drive,
                operations,
            ),
        getSyncStatus: drive =>
            ipcRenderer.invoke('documentDrive:getSyncStatus', drive),
        on: (event, cb) => {
            function listener(_event: IpcRendererEvent, arg: any) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                Array.isArray(arg) ? cb(...arg) : cb(arg);
            }
            ipcRenderer.on(`documentDrive:event:${event}`, listener);
            return () =>
                ipcRenderer.off(`documentDrive:event:${event}`, listener);
        },
    } satisfies Omit<IDocumentDriveServer, 'getSyncStatus'> & {
        getSyncStatus: (drive: string) => Promise<SyncStatus>;
    },
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type ElectronAPI = typeof electronApi;
