// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { BudgetStatementDocument } from '@acaldas/document-model-libs/budget-statement';
import { contextBridge, ipcRenderer } from 'electron';

const electronApi = {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (file: unknown) => ipcRenderer.invoke('dialog:saveFile', file),
    handleFileOpened: (
        listener: (file: BudgetStatementDocument | undefined) => void
    ) => {
        ipcRenderer.on('fileOpened', (event, file) => {
            listener(file);
        });
    },
    handleFileSaved: (listener: () => void) => {
        ipcRenderer.on('fileSaved', listener);
        return () => ipcRenderer.off('fileSaved', listener);
    },
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type ElectronAPI = typeof electronApi;
