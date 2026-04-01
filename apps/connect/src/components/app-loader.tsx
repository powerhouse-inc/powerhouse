import "@powerhousedao/connect/i18n";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { App, CookieBanner } from "./index.js";
import { ModalsContainer } from "./modal/modals-container.js";
import type { DocumentModelLib } from "document-model";

export const AppLoader = (props: { localPackage?: DocumentModelLib }) => {
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
