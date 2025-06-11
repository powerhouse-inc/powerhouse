import { ReadModeContextProvider, SentryProvider } from '#context';
import { atoms, atomStore } from '#store';
import { DocumentEditorDebugTools, serviceWorkerManager } from '#utils';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import { UiNodesContextProvider } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import { Provider, useAtomValue } from 'jotai';
import React, { lazy } from 'react';
import { useRenown } from '../hooks/useRenown.js';
import { useProcessorManager } from '../store/processors.js';
import Analytics from './analytics.js';

if (import.meta.env.MODE === 'development') {
    window.documentEditorDebugTools = new DocumentEditorDebugTools();
} else {
    serviceWorkerManager.registerServiceWorker(false);
}

const Router = React.lazy(async () => {
    const createRouterComponent = await import('./router.js');
    const router = await createRouterComponent.default();
    return { default: router };
});

const Preloader = () => {
    useRenown();
    for (const atom of Object.values(atoms)) {
        useAtomValue(atom);
    }
    useProcessorManager();
    return null;
};

const ReactorAnalyticsProvider = lazy(
    () => import('../context/reactor-analytics.js'),
);

const App = () => (
    <Provider store={atomStore}>
        <Preloader />
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
    </Provider>
);

export default App;
