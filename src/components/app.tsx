import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import Settings from 'src/pages/settings';
import Tabs from 'src/pages/tabs';
import atoms from 'src/store';
import Root from './root';

export const App: React.FC = () => {
    const router = createHashRouter([
        {
            path: '/',
            element: <Root />,
            errorElement: <Root />,
            loader: () => <></>, // TODO loading
            children: [
                {
                    path: '',
                    element: <Tabs />,
                },
                {
                    path: 'settings',
                    element: <Settings />,
                },
            ],
        },
        {
            element: <Root />,
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
            <App />
        </Suspense>
    </React.StrictMode>
);
