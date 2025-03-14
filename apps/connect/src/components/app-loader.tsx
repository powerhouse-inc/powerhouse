import { DocumentEditorDebugTools, serviceWorkerManager } from '#utils';
import { lazy, Suspense } from 'react';
import '../i18n';
import '../index.css';

if (import.meta.env.MODE === 'development') {
    window.documentEditorDebugTools = new DocumentEditorDebugTools();
} else {
    serviceWorkerManager.registerServiceWorker(false);
}

const App = lazy(() => import('./app.js'));

const AppLoader = (
    <Suspense>
        <App />
    </Suspense>
);

export default AppLoader;
