import {
  Analytics,
  OpenPanel,
  Router,
} from "@powerhousedao/connect/components";

import { connectConfig } from "@powerhousedao/connect/config";
import { SentryProvider } from "@powerhousedao/connect/context";
import {
  DocumentEditorDebugTools,
  initLaunchQueueFileHandling,
  serviceWorkerManager,
} from "@powerhousedao/connect/utils";
import { useTheme } from "@powerhousedao/reactor-browser";
import { useEffect } from "react";
import { ToastContainer } from "../services/toast.js";
import { MissingModelBanner } from "./missing-model-banner.js";
import { OpenFileUploadList } from "./open-file-upload-list.js";
import { PackageInstallPrompt } from "./package-install-prompt.js";

export const App = () => {
  useTheme(); // keeps the OS-preference change listener active

  // refresh page on vite preload error due to outdated chunks — but only when
  // the failing dynamic import is one of Connect's own chunks. External
  // dynamic imports (e.g. the package manager loading a package from the
  // configured CDN) should let the error propagate so the caller can surface
  // it; reloading here drops any open state and hides the real failure.
  useEffect(() => {
    const handlePreloadError = (event: Event) => {
      const payload = (event as Event & { payload?: unknown }).payload;
      const message =
        payload instanceof Error
          ? payload.message
          : typeof payload === "string"
            ? payload
            : "";
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
    } else if (connectConfig.offline) {
      serviceWorkerManager.registerServiceWorker(false);
    } else {
      // Offline disabled — drop any worker a previous offline build left running.
      void serviceWorkerManager.unregisterAll();
    }
  }, []);

  // Files the OS opens with the installed PWA (manifest file_handlers).
  // launchQueue buffers launches until a consumer registers, so nothing is
  // lost by wiring it on mount; a no-op where the API doesn't exist.
  useEffect(() => {
    initLaunchQueueFileHandling();
  }, []);

  return (
    <SentryProvider>
      <ToastContainer position="bottom-right" />
      <MissingModelBanner />
      <Router />
      <OpenFileUploadList />
      <PackageInstallPrompt />
      <Analytics />
      <OpenPanel />
    </SentryProvider>
  );
};
