import { ReadModeContextProvider, SentryProvider } from '#context';
import { atomStore } from '#store';
import { DocumentEditorDebugTools, serviceWorkerManager } from '#utils';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import { UiNodesContextProvider } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import { Provider } from 'jotai';
import { Suspense } from 'react';
import ReactorAnalyticsProvider from '../context/reactor-analytics.js';
import { useRenown } from '../hooks/useRenown.js';
import { useProcessorManager } from '../store/processors.js';
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

const PreloadProcessorManager = () => {
    useProcessorManager();
    return null;
};

const App = () => (
    <Provider store={atomStore}>
        <SentryProvider>
            <WagmiContext>
                <ReadModeContextProvider>
                    <ReactorAnalyticsProvider>
                        <ToastContainer
                            position="bottom-right"
                            containerId="connect"
                        />
                        <UiNodesContextProvider>
                            <Router />
                            <Analytics />
                        </UiNodesContextProvider>
                    </ReactorAnalyticsProvider>
                </ReadModeContextProvider>
            </WagmiContext>
        </SentryProvider>
        <Suspense>
            <PreloadProcessorManager />
            <PreloadRenown />
        </Suspense>
    </Provider>
);

export default App;
