import connectConfig from 'connect-config';
import {
    RouteObject,
    RouterProvider,
    createBrowserRouter,
    createMemoryRouter,
} from 'react-router-dom';

async function createRouter(routes: RouteObject[]) {
    const isPackaged = await window.electronAPI?.isPackaged();
    const createRouter = isPackaged ? createMemoryRouter : createBrowserRouter;
    return createRouter(routes, { basename: connectConfig.routerBasename });
}

const RouterAsync = async () => {
    const router = await createRouter([
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

    const Router = () => <RouterProvider router={router} />;
    return Router;
};

export default RouterAsync;
