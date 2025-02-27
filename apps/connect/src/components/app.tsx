import { CookieBanner } from '#components/cookie-banner';
import { ModalManager } from '#components/modal/index';
import { ReadModeContextProvider } from '#context/read-mode';
import { RootProvider } from '#context/root-provider';
import atoms, { atomStore } from '#store/index';
import { ToastContainer, WagmiContext } from '@powerhousedao/design-system';
import { UiNodesContextProvider } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import { Provider, useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import Analytics from './analytics';

const Router = React.lazy(async () => {
    const createRouterComponent = await import('./router');
    const router = await createRouterComponent.default();
    return { default: router };
});

const Preloader = () => {
    for (const atom of Object.values(atoms)) {
        useAtomValue(atom);
    }
    return null;
};

const App = () => (
    <React.StrictMode>
        <Suspense fallback={<>{/* TODO loading */}</>}>
            <Provider store={atomStore}>
                <Preloader />
                <WagmiContext>
                    <RootProvider>
                        <ReadModeContextProvider>
                            <UiNodesContextProvider>
                                <ToastContainer position="bottom-right" />
                                <ModalManager>
                                    <Router />
                                    <CookieBanner />
                                    <Analytics />
                                </ModalManager>
                            </UiNodesContextProvider>
                        </ReadModeContextProvider>
                    </RootProvider>
                </WagmiContext>
            </Provider>
        </Suspense>
    </React.StrictMode>
);

export default App;
