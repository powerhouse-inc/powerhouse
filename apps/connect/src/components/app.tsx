import { ReadModeContextProvider, SentryProvider } from '#context';
import { DocumentEditorDebugTools, serviceWorkerManager } from '#utils';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import { UiNodesContextProvider } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import { Suspense } from 'react';
import ProcessorManagerProvider from '../context/processor-manager.js';
import { useRenown } from '../hooks/useRenown.js';
import { useProcessorManager } from '../store/processors.js';
import Analytics from './analytics.js';
import { PGLiteTest } from './PGLiteTest.js';
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

const PreloadProcessorManager = () => {
    useProcessorManager();
    return null;
};

const App = () => (
    <>
        <SentryProvider>
            <WagmiContext>
                <ReadModeContextProvider>
                    <ProcessorManagerProvider>
                        <PGLiteTest />
                        <ToastContainer
                            position="bottom-right"
                            containerId="connect"
                        />
                        <UiNodesContextProvider>
                            <Router />
                            <Analytics />
                        </UiNodesContextProvider>
                    </ProcessorManagerProvider>
                </ReadModeContextProvider>
            </WagmiContext>
        </SentryProvider>
        <Suspense>
            <PreloadProcessorManager />
            <PreloadRenown />
        </Suspense>
    </>
);

export default App;
