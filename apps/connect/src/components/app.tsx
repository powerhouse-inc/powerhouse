import { Analytics, Router } from "@powerhousedao/connect/components";

import { SentryProvider } from "@powerhousedao/connect/context";
import {
  DocumentEditorDebugTools,
  serviceWorkerManager,
} from "@powerhousedao/connect/utils";
import {
  ToastContainer,
  WagmiContext,
} from "@powerhousedao/design-system/connect";
import { useEffect } from "react";
import { PackageInstallPrompt } from "./package-install-prompt.js";
export const App = () => {
  // refresh page on vite preload error due to outdated chunks
  useEffect(() => {
    const handlePreloadError = () => {
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
      <WagmiContext>
        <ToastContainer position="bottom-right" containerId="connect" />
        <Router />
        <PackageInstallPrompt />
        <Analytics />
      </WagmiContext>
    </SentryProvider>
  );
};
