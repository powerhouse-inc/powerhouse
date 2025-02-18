import connectConfig from 'connect-config';
import React, { Suspense } from 'react';
import {
    RouteObject,
    RouterProvider,
    createBrowserRouter,
    createMemoryRouter,
} from 'react-router-dom';
import { Home } from 'src/pages/home';

const Root = React.lazy(() => import('./root'));
const Content = React.lazy(() => import('src/pages/content'));

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
