import "@powerhousedao/connect/i18n";
import {
  bindPHStoreToWindow,
  createPHStore,
  getActivePHStore,
  PHStoreProvider,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { DetailedFallback, ErrorBoundary } from "./error-boundary.js";
import { App } from "./app.js";
import { ConnectionBanner } from "./connection-banner.js";
import { MigrationBanner } from "./migration-banner.js";
import { ModalsContainer } from "./modal/modals-container.js";
import { LoadingShell } from "./prerendered-shell.js";
import { ServiceWorkerUpdatePrompt } from "./service-worker-update-prompt.js";
import { StoredDocumentsRefusedFallback } from "./stored-documents-refused.js";
import { isStoredDocumentsRefused } from "../utils/stored-documents-refused.js";

const CookieBanner = lazy(() =>
  import("./cookie-banner.js").then((m) => ({ default: m.CookieBanner })),
);

// Connect's PH state. Values boot set on `window.ph` carry over, and
// `window.ph` stays as a view over the store.
function connectPHStore() {
  const active = getActivePHStore();
  if (active) return active;
  const store = createPHStore();
  bindPHStoreToWindow(store);
  return store;
}

export const AppLoader = (props: { localPackage?: DocumentModelLib }) => {
  const phStore = connectPHStore();
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
      </PHStoreProvider>
    </StrictMode>
  );
};
