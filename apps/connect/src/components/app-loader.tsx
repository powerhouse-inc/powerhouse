import "@powerhousedao/connect/i18n";
import type { VetraPackage } from "@powerhousedao/reactor-browser";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { App, CookieBanner } from "./index.js";
import { ModalsContainer } from "./modal/modals-container.js";

export const AppLoader = (props: { localPackage?: VetraPackage }) => {
  const Load = lazy(() =>
    import("./load.js").then((m) => m.loadComponent(props.localPackage)),
  );
  return (
    <StrictMode>
      <Suspense fallback={<AppSkeleton />} name="AppLoader">
        <Load {...props}>
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
};
