// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

const electronApi = {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (file: unknown) => ipcRenderer.invoke('dialog:saveFile', file),
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type ElectronAPI = typeof electronApi;
