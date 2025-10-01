import {
  App,
  AppSkeleton,
  CookieBanner,
  ModalsContainer,
  useCheckLatestVersion,
  useSubscribeToVetraPackages,
  useSetSentryUser,
  createReactor,
} from "@powerhousedao/connect";
import "../i18n/index.js";
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
