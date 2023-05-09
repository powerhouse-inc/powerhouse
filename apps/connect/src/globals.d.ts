import type { ElectronAPI } from './preload';
export {};

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }

    const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
    const MAIN_WINDOW_VITE_NAME: string;
}
