import { CookieBanner } from '#components';
import { RootProvider } from '#context';
import { useLoadData } from '#hooks';
import { AtomStoreProvider } from '@powerhousedao/common';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import 'jotai-devtools/styles.css';
import React, { lazy, Suspense } from 'react';
import Analytics from './analytics.js';

const Router = React.lazy(async () => {
    const createRouterComponent = await import('./router.js');
    const router = await createRouterComponent.default();
    return { default: router };
});

function Preloader() {
    useLoadData();
    return null;
}

const ReactorAnalyticsProvider = lazy(
    () => import('../context/reactor-analytics.js'),
);

const App = () => (
    <React.StrictMode>
        <AtomStoreProvider>
            <Preloader />
            <Suspense>
                <WagmiContext>
                    <RootProvider>
                        <ReactorAnalyticsProvider>
                            <ToastContainer
                                position="bottom-right"
                                containerId="connect"
                            />
                            <Router />
                            <CookieBanner />
                            <Analytics />
                        </ReactorAnalyticsProvider>
                    </RootProvider>
                </WagmiContext>
            </Suspense>
        </AtomStoreProvider>
    </React.StrictMode>
);

export default App;
