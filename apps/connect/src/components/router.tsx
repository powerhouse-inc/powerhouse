import connectConfig from '#connect-config';
import React, { Suspense } from 'react';
import {
    type RouteObject,
    RouterProvider,
    createBrowserRouter,
    createMemoryRouter,
} from 'react-router-dom';
import { Home } from '../pages/home.js';
import { AtlasImport } from './demo/atlas-import.js';
import Root from './root.js';

const Content = React.lazy(() => import('../pages/content.js'));

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

function createRoutes() {
    const routes: RouteObject[] = [
        {
            path: '/',
            element: <Home />,
        },
        {
            path: 'd?/:driveId?/*?',
            element: (
                <Suspense name="Drive">
                    <Content />
                </Suspense>
            ),
        },
        {
            path: 'import/:documentId',
            element: <AtlasImport />,
        },
    ];

    return [
        {
            path: '/',
            element: (
                <Suspense name="RouteRoot">
                    <Root />
                </Suspense>
            ),
            children: routes,
        },
        {
            element: (
                <Suspense>
                    <Root />
                </Suspense>
            ),
        },
    ];
}

const routes = createRoutes();

const RouterAsync = async () => {
    const router = await createRouter(routes);

    const Router = () => <RouterProvider router={router} />;
    return Router;
};

export default RouterAsync;
