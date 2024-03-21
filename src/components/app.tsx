import {
    ItemsContextProvider,
    ToastContainer,
} from '@powerhousedao/design-system';
import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { ModalManager } from 'src/components/modal';
import atoms from 'src/store';

export const App: React.FC = () => {
    const router = createBrowserRouter([
        {
            path: '/',
            lazy: () => import('./root'),
            loader: () => <></>, // TODO loading
            children: [
                {
                    path: 'd?/:driveId?/*?',
                    lazy: () => import('src/pages/content'),
                },
                {
                    path: 'settings',
                    lazy: () => import('src/pages/settings'),
                },
            ],
        },
        {
            lazy: () => import('./root'),
            loader: () => <></>, // TODO loading
        },
    ]);
    return <RouterProvider router={router} />;
};

const Preloader = () => {
    for (const atom of Object.values(atoms)) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useAtomValue(atom);
    }
    return null;
};

export default (
    <React.StrictMode>
        {/* TODO loading */}

        <Suspense fallback={<></>}>
            <Preloader />
            <ItemsContextProvider>
                <ToastContainer position="bottom-right" />
                <ModalManager>
                    <App />
                </ModalManager>
            </ItemsContextProvider>
        </Suspense>
    </React.StrictMode>
);
