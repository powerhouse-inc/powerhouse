import {
  App,
  AppSkeleton,
  CookieBanner,
  ModalManager,
  useLoadData,
  useLoadInitialData,
} from "@powerhousedao/connect";
import { StrictMode, Suspense } from "react";
import "../i18n/index.js";

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
