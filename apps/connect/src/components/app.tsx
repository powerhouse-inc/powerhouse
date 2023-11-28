import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { RouterProvider, createHashRouter } from 'react-router-dom';
import { ModalManager } from 'src/components/modal';
import atoms from 'src/store';

export const App: React.FC = () => {
    const router = createHashRouter([
        {
            path: '/',
            lazy: () => import('./root'),
            loader: () => <></>, // TODO loading
            children: [
                {
                    path: '',
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
        useAtomValue(atom);
    }
    return null;
};

export default (
    <React.StrictMode>
        {/* TODO loading */}
        <Suspense fallback={<></>}>
            <Preloader />
            <ModalManager>
                <App />
            </ModalManager>
        </Suspense>
    </React.StrictMode>
);
