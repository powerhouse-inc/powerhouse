import { CookieBanner } from '#components';
import { ReadModeContextProvider, RootProvider } from '#context';
import { atoms, atomStore } from '#store';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import { Provider, useAtomValue } from 'jotai';
import React, { lazy, Suspense } from 'react';
import { useProcessorManager } from '../store/processors.js';
import Analytics from './analytics.js';

const Router = React.lazy(async () => {
    const createRouterComponent = await import('./router.js');
    const router = await createRouterComponent.default();
    return { default: router };
});

const Preloader = () => {
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
    <React.StrictMode>
        <Suspense fallback={<>{/* TODO loading */}</>}>
            <Provider store={atomStore}>
                <Preloader />
                <WagmiContext>
                    <RootProvider>
                        <ReadModeContextProvider>
                            <ReactorAnalyticsProvider>
                                <ToastContainer
                                    position="bottom-right"
                                    containerId="connect"
                                />
                                <Router />
                                <CookieBanner />
                                <Analytics />
                            </ReactorAnalyticsProvider>
                        </ReadModeContextProvider>
                    </RootProvider>
                </WagmiContext>
            </Provider>
        </Suspense>
    </React.StrictMode>
);

export default App;
