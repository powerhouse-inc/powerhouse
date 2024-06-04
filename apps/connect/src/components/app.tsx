import {
    ItemsContextProvider,
    ToastContainer,
} from '@powerhousedao/design-system';
import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { ModalManager } from 'src/components/modal';
import { PHLogo } from 'src/components/ph-logo';
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
            <ItemsContextProvider>
                <ToastContainer position="bottom-right" />
                <ModalManager>
                    <Router />
                    <PHLogo />
                </ModalManager>
            </ItemsContextProvider>
        </Suspense>
    </React.StrictMode>
);
