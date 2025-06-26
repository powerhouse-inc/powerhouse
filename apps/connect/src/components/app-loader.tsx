import { DocumentEditorDebugTools, serviceWorkerManager } from '#utils';
import { lazy } from 'react';
import '../i18n';
import '../index.css';

if (import.meta.env.MODE === 'development') {
    window.documentEditorDebugTools = new DocumentEditorDebugTools();
} else {
    serviceWorkerManager.registerServiceWorker(false);
}

const App = lazy(() => import('./app.js'));

const AppLoader = <App />;

export default AppLoader;
