import { lazy, StrictMode, Suspense } from 'react';
import '../i18n';

import { AtomStoreProvider } from '@powerhousedao/common';
import { AppSkeleton } from './app-skeleton.js';

const App = lazy(() => import('./app.js'));
const CookieBanner = lazy(() =>
    import('./cookie-banner.js').then(m => ({ default: m.CookieBanner })),
);

const ModalManager = lazy(() =>
    import('./modal/modal.js').then(m => ({ default: m.ModalManager })),
);

export const AppLoader = (
    <StrictMode>
        <AtomStoreProvider>
            <Suspense fallback={<AppSkeleton />} name="AppLoader">
                <App />
            </Suspense>
            <Suspense name="CookieBanner">
                <ModalManager>
                    <CookieBanner />
                </ModalManager>
            </Suspense>
        </AtomStoreProvider>
    </StrictMode>
);
