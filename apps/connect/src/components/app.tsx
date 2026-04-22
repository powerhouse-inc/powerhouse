import { Analytics, Router } from "@powerhousedao/connect/components";

import { SentryProvider } from "@powerhousedao/connect/context";
import {
  DocumentEditorDebugTools,
  serviceWorkerManager,
} from "@powerhousedao/connect/utils";
import { ToastContainer } from "@powerhousedao/design-system/connect";
import { useEffect } from "react";
import { PackageInstallPrompt } from "./package-install-prompt.js";
export const App = () => {
  // refresh page on vite preload error due to outdated chunks — but only when
  // the failing dynamic import is one of Connect's own chunks. External
  // dynamic imports (e.g. the package manager loading a package from the
  // configured CDN) should let the error propagate so the caller can surface
  // it; reloading here drops any open state and hides the real failure.
  useEffect(() => {
    const handlePreloadError = (event: Event) => {
      const payload = (event as Event & { payload?: unknown }).payload;
      const message =
        payload instanceof Error ? payload.message : String(payload ?? "");
      const failedUrl = message.match(/https?:\/\/[^\s"']+/)?.[0];

      if (failedUrl && !failedUrl.startsWith(window.location.origin)) {
        console.debug(
          `[Connect] Skipping reload — vite:preloadError for off-origin URL: ${failedUrl}`,
        );
        return;
      }

      console.log("Outdated chunks detected, reloading page...");
      window.location.reload();
    };

    window.addEventListener("vite:preloadError", handlePreloadError);

    return () => {
      window.removeEventListener("vite:preloadError", handlePreloadError);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === "development") {
      window.documentEditorDebugTools = new DocumentEditorDebugTools();
    } else {
      serviceWorkerManager.registerServiceWorker(false);
    }
  }, []);

  return (
    <SentryProvider>
      <ToastContainer position="bottom-right" containerId="connect" />
      <Router />
      <PackageInstallPrompt />
      <Analytics />
    </SentryProvider>
  );
};
