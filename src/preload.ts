// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { BudgetStatementDocument } from '@acaldas/document-model-libs/budget-statement';
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { Theme } from './store';

const electronApi = {
    ready: () => ipcRenderer.send('ready'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (file: unknown) => ipcRenderer.invoke('dialog:saveFile', file),
    handleFileOpened: (
        listener: (file: BudgetStatementDocument | undefined) => void
    ) => {
        function callback(
            event: IpcRendererEvent,
            file: BudgetStatementDocument | undefined
        ) {
            listener(file);
        }
        ipcRenderer.on('fileOpened', callback);
        return () => {
            ipcRenderer.off('fileOpened', callback);
        };
    },
    handleFileSaved: (listener: () => void) => {
        ipcRenderer.on('fileSaved', listener);
        return () => {
            ipcRenderer.off('fileSaved', listener);
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
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type ElectronAPI = typeof electronApi;
