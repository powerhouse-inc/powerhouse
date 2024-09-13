import {
    ToastContainer,
    UiNodesContextProvider,
    WagmiContext,
} from '@powerhousedao/design-system';
import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { CookieBanner } from 'src/components/cookie-banner';
import { Footer } from 'src/components/footer';
import { ModalManager } from 'src/components/modal';
import { ReadModeContextProvider } from 'src/context/read-mode';
import { RootProvider } from 'src/context/root-provider';
import atoms from 'src/store';

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

export default (
    <React.StrictMode>
        <Suspense fallback={<>{/* TODO loading */}</>}>
            <Preloader />
            <WagmiContext>
                <RootProvider>
                    <ReadModeContextProvider>
                        <UiNodesContextProvider>
                            <ToastContainer position="bottom-right" />
                            <ModalManager>
                                <Router />
                                <Footer />
                                <CookieBanner />
                            </ModalManager>
                        </UiNodesContextProvider>
                    </ReadModeContextProvider>
                </RootProvider>
            </WagmiContext>
        </Suspense>
    </React.StrictMode>
);
