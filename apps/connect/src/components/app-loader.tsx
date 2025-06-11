import { lazy, StrictMode, Suspense } from 'react';
import '../i18n';
import '../index.css';
import { AppSkeleton } from './app-skeleton.js';

const App = lazy(() => import('./app.js'));

export const AppLoader = (
    <StrictMode>
        <Suspense fallback={<AppSkeleton />} name="AppLoader">
            <App />
        </Suspense>
    </StrictMode>
);
