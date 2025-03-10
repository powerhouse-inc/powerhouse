import { Home } from '#pages/home';
import connectConfig from 'connect-config';
import React, { Suspense } from 'react';
import {
    type RouteObject,
    RouterProvider,
    createBrowserRouter,
    createMemoryRouter,
} from 'react-router-dom';
import { AtlasImport } from './demo/atlas-import';

const Root = React.lazy(() => import('./root'));
const Content = React.lazy(() => import('#pages/content'));

async function createRouter(routes: RouteObject[]) {
    const isPackaged = await window.electronAPI?.isPackaged();
    const createRouter = isPackaged ? createMemoryRouter : createBrowserRouter;
    return createRouter(routes, {
        basename: connectConfig.routerBasename,
        future: {
            v7_fetcherPersist: true,
            v7_relativeSplatPath: true,
        },
    });
}

const RouterAsync = async () => {
    const router = await createRouter([
        {
            path: '/',
            element: (
                <Suspense>
                    <Root />
                </Suspense>
            ),
            children: [
                {
                    path: '/',
                    element: <Home />,
                },
                {
                    path: 'd?/:driveId?/*?',
                    element: (
                        <Suspense>
                            <Content />
                        </Suspense>
                    ),
                },
                {
                    path: 'import/:documentId',
                    element: <AtlasImport />,
                },
            ],
        },
        {
            element: (
                <Suspense>
                    <Root />
                </Suspense>
            ),
        },
    ]);

    const Router = () => <RouterProvider router={router} />;
    return Router;
};

export default RouterAsync;
