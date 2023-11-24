// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { DriveInput, IDocumentDriveServer } from 'document-drive';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import {
    CreateChildDocumentInput,
    Document,
    Operation,
} from 'document-model/document';
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { Theme } from './store';

const electronApi = {
    ready: () => ipcRenderer.send('ready'),
    fileSaved: (document: Document, path?: string) =>
        ipcRenderer.invoke('fileSaved', document, path),
    handleFileOpen: (listener: (file: string) => void) => {
        function callback(event: IpcRendererEvent, file: string) {
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
        listener: (event: IpcRendererEvent, tab: string) => void
    ) => {
        ipcRenderer.on('addTab', listener);
        return () => {
            ipcRenderer.off('addTab', listener);
        };
    },
    handleRemoveTab: (
        listener: (event: IpcRendererEvent, tab: string) => void
    ) => {
        ipcRenderer.on('removeTab', listener);
        return () => {
            ipcRenderer.off('removeTab', listener);
        };
    },
    handleLogin: (
        listener: (event: IpcRendererEvent, address: string) => void
    ) => {
        ipcRenderer.on('login', listener);
        return () => {
            ipcRenderer.off('login', listener);
        };
    },
    user: async () => (await ipcRenderer.invoke('user')) as string | undefined,
    openURL: (url: string) => {
        ipcRenderer.invoke('openURL', url);
    },
    setTheme: (theme: Theme) => ipcRenderer.send('theme', theme),
    documentDrive: {
        getDrives: () =>
            ipcRenderer.invoke('documentDrive:getDrives') as Promise<string[]>,
        getDrive: (id: string) =>
            ipcRenderer.invoke(
                'documentDrive:getDrive',
                id
            ) as Promise<DocumentDriveDocument>,
        addDrive: (drive: DriveInput) =>
            ipcRenderer.invoke('documentDrive:addDrive', drive),
        deleteDrive: (id: string) =>
            ipcRenderer.invoke('documentDrive:deleteDrive', id),
        getDocuments: (drive: string) =>
            ipcRenderer.invoke('documentDrive:getDocuments', drive),
        getDocument: (drive: string, id: string) =>
            ipcRenderer.invoke('documentDrive:getDocument', drive, id),
        createDocument: (drive: string, input: CreateChildDocumentInput) =>
            ipcRenderer.invoke('documentDrive:createDocument', drive, input),
        deleteDocument: (drive: string, id: string) =>
            ipcRenderer.invoke('documentDrive:deleteDocument', drive, id),
        addOperation: (drive: string, id: string, operation: Operation) =>
            ipcRenderer.invoke(
                'documentDrive:addOperation',
                drive,
                id,
                operation
            ),
    } satisfies IDocumentDriveServer,
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type ElectronAPI = typeof electronApi;
