import { useLoadInitialData } from '#hooks';
import { StrictMode, Suspense } from 'react';
import { useLoadData } from '../hooks/useLoadData.js';
import '../i18n';
import { AppSkeleton } from './app-skeleton.js';
import App from './app.js';
import { ModalManager } from './modal/index.js';
import { CookieBanner } from './cookie-banner.js';

function Load() {
    useLoadInitialData();
    useLoadData();
    return null;
}

export const AppLoader = () => (
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
