import "@powerhousedao/connect/i18n";
import { getConnectPHStore } from "@powerhousedao/connect-core/runtime";
import { PHStoreProvider } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { DetailedFallback, ErrorBoundary } from "./error-boundary.js";
import { App } from "./app.js";
import { ConnectionBanner } from "./connection-banner.js";
import { CookieConsent } from "./cookie-consent.js";
import { MigrationBanner } from "./migration-banner.js";
import { LoadingShell } from "./prerendered-shell.js";
import { ServiceWorkerUpdatePrompt } from "./service-worker-update-prompt.js";
import { StoredDocumentsRefusedFallback } from "./stored-documents-refused.js";
import { isStoredDocumentsRefused } from "../utils/stored-documents-refused.js";

export const AppLoader = (props: {
  localPackage?: DocumentModelLib | Promise<DocumentModelLib>;
}) => {
  const phStore = getConnectPHStore();
  const Load = lazy(() =>
    import("./load.js").then((m) =>
      m.loadComponent(props.localPackage, phStore),
    ),
  );
  return (
    <StrictMode>
      <PHStoreProvider store={phStore}>
        <ErrorBoundary
          fallbackRender={(props) => (
            <AppSkeleton
              children={
                isStoredDocumentsRefused(props.error) ? (
                  <StoredDocumentsRefusedFallback error={props.error} />
                ) : (
                  <DetailedFallback {...props} />
                )
              }
            />
          )}
          resetKeys={[props.localPackage]}
          loggerContext={["Connect"]}
        >
          <Suspense
            fallback={<LoadingShell Fallback={AppSkeleton} />}
            name="AppLoader"
          >
            {/* eslint-disable-next-line react-hooks-extra/static-components */}
            <Load {...props}>
              <App />
            </Load>
          </Suspense>
          <CookieConsent />
          <MigrationBanner />
          <ServiceWorkerUpdatePrompt />
          <ConnectionBanner />
        </ErrorBoundary>
      </PHStoreProvider>
    </StrictMode>
  );
};
