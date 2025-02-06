import {
    ToastContainer,
    UiNodesContextProvider,
    WagmiContext,
} from '@powerhousedao/design-system';
import { Provider, useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { CookieBanner } from 'src/components/cookie-banner';
import { ModalManager } from 'src/components/modal';
import { ReadModeContextProvider } from 'src/context/read-mode';
import { RootProvider } from 'src/context/root-provider';
import atoms, { atomStore } from 'src/store';
import Analytics from './analytics';

const Router = React.lazy(async () => {
    const createRouterComponent = await import('./router');
    const router = await createRouterComponent.default();
    return { default: router };
});

const Preloader = () => {
    for (const atom of Object.values(atoms)) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
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
