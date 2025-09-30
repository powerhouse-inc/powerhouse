import { useCheckLatestVersion } from "#hooks";
import { useSubscribeToVetraPackages } from "#services";
import { createReactor, useSetSentryUser } from "#store";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import "../i18n";
import { AppSkeleton } from "./app-skeleton.js";
import App from "./app.js";
import { CookieBanner } from "./cookie-banner.js";
import { ModalsContainer } from "./modal/modals-container.js";

export const Load = lazy(async () => {
  await createReactor();
  return {
    default: ({ children }: { children?: ReactNode }) => {
      useSubscribeToVetraPackages();
      useSetSentryUser();
      useCheckLatestVersion();
      return children;
    },
  };
});

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
    <ModalsContainer />
  </StrictMode>
);
