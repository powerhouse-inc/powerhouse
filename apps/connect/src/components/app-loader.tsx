import { lazy, Suspense } from 'react';
import '../i18n';
import '../index.css';
import { DocumentEditorDebugTools } from '../utils/document-editor-debug-tools';
import serviceWorkerManager from '../utils/registerServiceWorker';

if (import.meta.env.MODE === 'development') {
    window.documentEditorDebugTools = new DocumentEditorDebugTools();
} else {
    serviceWorkerManager.registerServiceWorker(false);
}

const App = lazy(() => import('./app'));

const AppLoader = (
    <Suspense>
        <App />
    </Suspense>
);

export default AppLoader;
