import "@powerhousedao/connect/i18n";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { App, CookieBanner } from "./index.js";
import { ModalsContainer } from "./modal/modals-container.js";

const Load = lazy(() => import("./load.js").then((m) => m.loadComponent()));

export const AppLoader = () => (
  <StrictMode>
    <Suspense fallback={<AppSkeleton />} name="AppLoader">
      <Load>
        <App />
      </Load>
    </Suspense>
    <Suspense name="CookieBanner">
      <CookieBanner />
    </Suspense>
    <Suspense name="ModalsContainer">
      <ModalsContainer />
    </Suspense>
  </StrictMode>
);
