// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import type {
    DocumentDriveAction,
    DocumentDriveDocument,
    DriveInput,
    RemoteDriveOptions,
} from 'document-drive';
import { Action, Operation, PHDocument } from 'document-model';
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { platformInfo } from './app/detect-platform';
import type { IConnectCrypto } from './services/crypto';
import type { IRenown, User } from './services/renown/types';
import type { Theme } from './store';

const connectCrypto: IConnectCrypto = {
    regenerateDid: (): Promise<void> =>
        ipcRenderer.invoke('crypto:regenerateDid') as Promise<void>,
    did: () => ipcRenderer.invoke('crypto:did') as Promise<`did:key:${string}`>,
    sign: message => ipcRenderer.invoke('crypto:sign', message),
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const electronDocumentDrive = {
    getDrives: () =>
        ipcRenderer.invoke('documentDrive:getDrives') as Promise<string[]>,
    getDrive: (id: string) =>
        ipcRenderer.invoke(
            'documentDrive:getDrive',
            id,
        ) as Promise<DocumentDriveDocument>,
    addDrive: (drive: DriveInput) =>
        ipcRenderer.invoke('documentDrive:addDrive', drive),
    addRemoteDrive: (url: any, options: any) =>
        ipcRenderer.invoke('documentDrive:addRemoteDrive', url, options),
    deleteDrive: (id: string) =>
        ipcRenderer.invoke('documentDrive:deleteDrive', id),
    getDocuments: (drive: string) =>
        ipcRenderer.invoke('documentDrive:getDocuments', drive),
    getDocument: (drive: string, id: string) =>
        ipcRenderer.invoke('documentDrive:getDocument', drive, id),
    addOperation: (drive: string, id: string, operation: Operation) =>
        ipcRenderer.invoke('documentDrive:addOperation', drive, id, operation),
    addOperations: (drive: string, id: string, operations: Operation[]) =>
        ipcRenderer.invoke(
            'documentDrive:addOperations',
            drive,
            id,
            operations,
        ),
    queueOperation(drive: any, id: any, operation: any, forceSync: any) {
        return ipcRenderer.invoke(
            'documentDrive:queueOperation',
            drive,
            id,
            operation,
            forceSync,
        );
    },
    queueOperations(drive: any, id: any, operations: any, forceSync: any) {
        return ipcRenderer.invoke(
            'documentDrive:queueOperations',
            drive,
            id,
            operations,
            forceSync,
        );
    },
    queueDriveOperation(drive: any, operation: any, forceSync: any) {
        return ipcRenderer.invoke(
            'documentDrive:queueDriveOperation',
            drive,
            operation,
            forceSync,
        );
    },
    queueDriveOperations(drive: any, operations: any, forceSync: any) {
        return ipcRenderer.invoke(
            'documentDrive:queueDriveOperations',
            drive,
            operations,
            forceSync,
        );
    },
    addDriveOperation: (
        drive: string,
        operation: Operation<DocumentDriveAction | Action>,
    ) =>
        ipcRenderer.invoke('documentDrive:addDriveOperation', drive, operation),
    clearStorage: () => ipcRenderer.invoke('documentDrive:clearStorage'),
    addDriveOperations: (
        drive: string,
        operations: Operation<DocumentDriveAction | Action>[],
    ) =>
        ipcRenderer.invoke(
            'documentDrive:addDriveOperations',
            drive,
            operations,
        ),
    getSyncStatus: (drive: any) =>
        ipcRenderer.invoke('documentDrive:getSyncStatus', drive),
    on: (event: any, cb: (arg0: any) => any) => {
        function listener(_event: IpcRendererEvent, arg: any) {
            /* eslint-disable */
            // @ts-expect-error
            Array.isArray(arg) ? cb(...arg) : cb(arg);
            /* eslint-enable */
        }
        ipcRenderer.on(`documentDrive:event:${event}`, listener);
        return () => ipcRenderer.off(`documentDrive:event:${event}`, listener);
    },
    registerPullResponderTrigger: (
        drive: string,
        url: string,
        options: Pick<RemoteDriveOptions, 'pullFilter' | 'pullInterval'>,
    ) => {
        return ipcRenderer.invoke(
            'documentDrive:registerPullResponderTrigger',
            drive,
            url,
            options,
        );
    },
} as any;

const electronApi = {
    platformInfo,
    ready: () => ipcRenderer.send('ready'),
    protocol: () => ipcRenderer.invoke('protocol') as Promise<string>,
    isPackaged: () => ipcRenderer.invoke('isPackaged') as Promise<boolean>,
    fileSaved: (document: PHDocument, path?: string) =>
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
    getSyncStatus: (drive: string) =>
        ipcRenderer.invoke('documentDrive:getSyncStatus', drive),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    documentDrive: electronDocumentDrive,
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);
contextBridge.exposeInMainWorld('connectCrypto', connectCrypto);
contextBridge.exposeInMainWorld('renown', renown);

export type ElectronAPI = typeof electronApi;
