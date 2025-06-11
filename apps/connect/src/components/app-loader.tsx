import { lazy, StrictMode, Suspense } from 'react';
import '../i18n';
import '../index.css';
import { AppSkeleton } from './app-skeleton.js';

const App = lazy(() => import('./app.js'));
const CookieBanner = lazy(() =>
    import('./cookie-banner.js').then(m => ({ default: m.CookieBanner })),
);

export const AppLoader = (
    <StrictMode>
        <Suspense fallback={<AppSkeleton />} name="AppLoader">
            <App />
        </Suspense>
        <Suspense name="CookieBanner">
            <CookieBanner />
        </Suspense>
    </StrictMode>
);
