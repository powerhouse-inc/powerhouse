import "@powerhousedao/connect/i18n";
import type { DocumentModelLib } from "document-model";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { DetailedFallback, ErrorBoundary } from "./error-boundary.js";
import { App, CookieBanner } from "./index.js";
import { ModalsContainer } from "./modal/modals-container.js";

export const AppLoader = (props: { localPackage?: DocumentModelLib }) => {
  const Load = lazy(() =>
    import("./load.js").then((m) => m.loadComponent(props.localPackage)),
  );
  return (
    <StrictMode>
      <ErrorBoundary
        fallbackRender={(props) => (
          <AppSkeleton children={<DetailedFallback {...props} />} />
        )}
        resetKeys={[props.localPackage]}
        loggerContext={["Connect"]}
      >
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
      </ErrorBoundary>
    </StrictMode>
  );
};
