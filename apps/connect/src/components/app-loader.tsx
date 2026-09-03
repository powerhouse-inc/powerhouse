import "@powerhousedao/connect/i18n";
import type { DocumentModelLib } from "document-model";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { DetailedFallback, ErrorBoundary } from "./error-boundary.js";
import { App } from "./index.js";
import { ConnectionBanner } from "./connection-banner.js";
import { MigrationBanner } from "./migration-banner.js";
import { ModalsContainer } from "./modal/modals-container.js";
import { ServiceWorkerUpdatePrompt } from "./service-worker-update-prompt.js";

const CookieBanner = lazy(() =>
  import("./cookie-banner.js").then((m) => ({ default: m.CookieBanner })),
);

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
        {/* The cookie banner is an optional, ad-blocker-vulnerable chunk:
            if its module (or its dependencies) is blocked, the silent
            boundary renders nothing and the app continues with the
            flags at their rejected defaults (analytics off). */}
        <ErrorBoundary
          variant="silent"
          loggerContext={["Connect", "CookieBanner"]}
        >
          <Suspense fallback={null} name="CookieBanner">
            <CookieBanner />
          </Suspense>
        </ErrorBoundary>
        <Suspense name="ModalsContainer">
          <ModalsContainer />
        </Suspense>
        <MigrationBanner />
        <ServiceWorkerUpdatePrompt />
        <ConnectionBanner />
      </ErrorBoundary>
    </StrictMode>
  );
};
