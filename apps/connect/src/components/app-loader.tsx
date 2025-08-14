import { useLoadInitialData, useRenown } from '#hooks';
import { lazy, StrictMode, Suspense } from 'react';
import { useLoadData } from '../hooks/useLoadData.js';
import '../i18n';
import { AppSkeleton } from './app-skeleton.js';

const App = lazy(() => import('./app.js'));
const CookieBanner = lazy(() =>
    import('./cookie-banner.js').then(m => ({ default: m.CookieBanner })),
);

const ModalManager = lazy(() =>
    import('./modal/modal.js').then(m => ({ default: m.ModalManager })),
);

function Load() {
    useLoadInitialData();
    useLoadData();
    useRenown();
    return null;
}

export const AppLoader = (
    <StrictMode>
        <Suspense fallback={<AppSkeleton />} name="AppLoader">
            <Load />
            <App />
        </Suspense>
        <Suspense name="CookieBanner">
            <ModalManager>
                <CookieBanner />
            </ModalManager>
        </Suspense>
    </StrictMode>
);
