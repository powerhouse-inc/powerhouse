// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import {
    AddFileInput,
    AddFolderInput,
    DocumentDriveAction,
    DocumentDriveState,
    FileNode,
    FolderNode,
} from 'document-model-libs/document-drive';
import { Action, Document } from 'document-model/document';
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { IDocumentDrive } from './services/document-drive';
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
        getDocument: () =>
            ipcRenderer.invoke('documentDrive') as Promise<
                Document<DocumentDriveState, DocumentDriveAction>
            >,
        openFile: <S = unknown, A extends Action = Action>(
            drive: string,
            file: string
        ) =>
            ipcRenderer.invoke(
                'documentDrive:openFile',
                drive,
                file
            ) as Promise<Document<S, A>>,
        addFile: (input: AddFileInput, document: Document) =>
            ipcRenderer.invoke(
                'documentDrive:addFile',
                input,
                document
            ) as Promise<FileNode>,
        addFolder: (input: AddFolderInput) =>
            ipcRenderer.invoke(
                'documentDrive:addFolder',
                input
            ) as Promise<FolderNode>,
        deleteNode: (drive: string, path: string) =>
            ipcRenderer.invoke('documentDrive:deleteNode', drive, path),
        renameNode: (drive: string, path: string, name: string) =>
            ipcRenderer.invoke('documentDrive:renameNode', drive, path, name),
    } satisfies IDocumentDrive,
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type ElectronAPI = typeof electronApi;
