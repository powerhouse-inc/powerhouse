import { App } from "@powerhousedao/connect/components/app";
import { AppSkeleton } from "@powerhousedao/connect/components/app-skeleton";
import { CookieBanner } from "@powerhousedao/connect/components/cookie-banner";
import { ModalsContainer } from "@powerhousedao/connect/components/modal/modals-container";
import { useCheckLatestVersion } from "@powerhousedao/connect/hooks";
import "@powerhousedao/connect/i18n";
import { useSubscribeToVetraPackages } from "@powerhousedao/connect/services";
import { createReactor, useSetSentryUser } from "@powerhousedao/connect/store";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";

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
