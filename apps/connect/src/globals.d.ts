export {};

declare global {
    interface Window {
        electronAPI?: any;
    }

    const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
    const MAIN_WINDOW_VITE_NAME: string;
}
