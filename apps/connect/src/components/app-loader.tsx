import "@powerhousedao/connect/i18n";
import type { DocumentModelLib } from "document-model";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { DetailedFallback, ErrorBoundary } from "./error-boundary.js";
import { App, CookieBanner } from "./index.js";
import { MigrationBanner } from "./migration-banner.js";
import { ModalsContainer } from "./modal/modals-container.js";
import { ServiceWorkerUpdatePrompt } from "./service-worker-update-prompt.js";

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
          {/* eslint-disable-next-line react-hooks/static-components */}
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
        <MigrationBanner />
        <ServiceWorkerUpdatePrompt />
      </ErrorBoundary>
    </StrictMode>
  );
};
