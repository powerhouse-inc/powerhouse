import { useLoadInitialData } from "@powerhousedao/connect";
import { StrictMode, Suspense } from "react";
import { useLoadData } from "../hooks/useLoadData.js";
import "../i18n/index.js";
import { AppSkeleton } from "./app-skeleton.js";
import App from "./app.js";
import { CookieBanner } from "./cookie-banner.js";
import { ModalManager } from "./modal/index.js";

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
