import "@powerhousedao/connect/i18n";
import { getConnectPHStore } from "@powerhousedao/connect-core/runtime";
import { getRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { ConnectBrandingProvider } from "@powerhousedao/design-system/connect";
import { PHStoreProvider } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";
import { lazy, StrictMode, Suspense } from "react";
import AppSkeleton from "./app-skeleton.js";
import { DetailedFallback, ErrorBoundary } from "./error-boundary.js";
import { App } from "./app.js";
import { ConnectionBanner } from "./connection-banner.js";
import { PluginRoots } from "./plugin-roots.js";
import { MigrationBanner } from "./migration-banner.js";
import { LoadingShell } from "./prerendered-shell.js";
import { ServiceWorkerUpdatePrompt } from "./service-worker-update-prompt.js";
import { StoredDocumentsRefusedFallback } from "./stored-documents-refused.js";
import { isStoredDocumentsRefused } from "../utils/stored-documents-refused.js";

export const AppLoader = (props: {
  localPackage?: DocumentModelLib | Promise<DocumentModelLib>;
}) => {
  const phStore = getConnectPHStore();
  // connect.branding (Connect's identity) plus the explorer icons the generic
  // plugin owns (drives.icons), both resolved by the build: one provider for
  // the design-system components.
  const runtime = getRuntimeConfig().connect;
  const branding = {
    ...runtime.branding,
    homeBackground: runtime.home?.background,
    icons: runtime.drives?.icons,
  };
  const Load = lazy(() =>
    import("./load.js").then((m) =>
      m.loadComponent(props.localPackage, phStore),
    ),
  );
  return (
    <StrictMode>
      <ConnectBrandingProvider branding={branding}>
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
                <PluginRoots />
              </Load>
            </Suspense>
            <MigrationBanner />
            <ServiceWorkerUpdatePrompt />
            <ConnectionBanner />
          </ErrorBoundary>
        </PHStoreProvider>
      </ConnectBrandingProvider>
    </StrictMode>
  );
};
