import { SentryProvider } from '#context';
import { DocumentEditorDebugTools, serviceWorkerManager } from '#utils';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import { Suspense } from 'react';
import ProcessorManagerProvider from '../context/processor-manager.js';
import { useRenown } from '../hooks/useRenown.js';
import Analytics from './analytics.js';
import { Router } from './router.js';

if (import.meta.env.MODE === 'development') {
    window.documentEditorDebugTools = new DocumentEditorDebugTools();
} else {
    serviceWorkerManager.registerServiceWorker(false);
}

const PreloadRenown = () => {
    useRenown();
    return null;
};

const App = () => (
    <>
        <SentryProvider>
            <WagmiContext>
                <ProcessorManagerProvider>
                    <ToastContainer
                        position="bottom-right"
                        containerId="connect"
                    />
                    <Router />
                    <Analytics />
                </ProcessorManagerProvider>
            </WagmiContext>
        </SentryProvider>
        <Suspense>
            <PreloadRenown />
        </Suspense>
    </>
);

export default App;
