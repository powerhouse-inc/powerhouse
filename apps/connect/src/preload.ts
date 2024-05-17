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
import type { IConnectCrypto } from './services/crypto';
import type { IRenown, User } from './services/renown/types';
import type { Theme } from './store';

const connectCrypto: IConnectCrypto = {
    regenerateDid: (): Promise<void> =>
        ipcRenderer.invoke('crypto:regenerateDid') as Promise<void>,
    did: () => ipcRenderer.invoke('crypto:did') as Promise<string>,
};

const renown: IRenown = {
    user: () => ipcRenderer.invoke('renown:user') as Promise<User | undefined>,
    login: (did: string) => ipcRenderer.invoke('renown:login', did),
    logout: () => ipcRenderer.invoke('renown:logout'),
    on: {
        user: (listener: (user: User) => void) => {
            function wrappedListener(e: unknown, user: User) {
                listener(user);
            }
            ipcRenderer.on('renown:on:user', wrappedListener);
            return () => ipcRenderer.off('renown:on:user', wrappedListener);
        },
    },
};

const electronApi = {
    platformInfo,
    ready: () => ipcRenderer.send('ready'),
    protocol: () => ipcRenderer.invoke('protocol') as Promise<string>,
    isPackaged: () => ipcRenderer.invoke('isPackaged') as Promise<boolean>,
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
    handleLogin: (listener: (event: IpcRendererEvent, user: User) => void) => {
        ipcRenderer.on('login', listener);
        return () => {
            ipcRenderer.off('login', listener);
        };
    },
    user: async () => ipcRenderer.invoke('user') as Promise<User | undefined>,
    openURL: (url: string) => ipcRenderer.invoke('openURL', url),
    handleURL: (listener: (event: IpcRendererEvent, url: string) => void) => {
        ipcRenderer.on('handleURL', listener);
        return () => {
            ipcRenderer.off('handleURL', listener);
        };
    },
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
        queueOperation(drive, id, operation, forceSync) {
            return ipcRenderer.invoke(
                'documentDrive:queueOperation',
                drive,
                id,
                operation,
                forceSync,
            );
        },
        queueOperations(drive, id, operations, forceSync) {
            return ipcRenderer.invoke(
                'documentDrive:queueOperations',
                drive,
                id,
                operations,
                forceSync,
            );
        },
        queueDriveOperation(drive, operation, forceSync) {
            return ipcRenderer.invoke(
                'documentDrive:queueDriveOperation',
                drive,
                operation,
                forceSync,
            );
        },
        queueDriveOperations(drive, operations, forceSync) {
            return ipcRenderer.invoke(
                'documentDrive:queueDriveOperations',
                drive,
                operations,
                forceSync,
            );
        },
        addDriveOperation: (
            drive: string,
            operation: Operation<DocumentDriveAction | BaseAction>,
        ) =>
            ipcRenderer.invoke(
                'documentDrive:addDriveOperation',
                drive,
                operation,
            ),
        clearStorage: () => ipcRenderer.invoke('documentDrive:clearStorage'),
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
contextBridge.exposeInMainWorld('connectCrypto', connectCrypto);
contextBridge.exposeInMainWorld('renown', renown);

export type ElectronAPI = typeof electronApi;
