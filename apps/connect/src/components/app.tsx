import { Analytics, Router } from "@powerhousedao/connect/components";

import { SentryProvider } from "@powerhousedao/connect/context/sentry-provider";
import { DocumentEditorDebugTools } from "@powerhousedao/connect/utils/document-editor-debug-tools";
import { serviceWorkerManager } from "@powerhousedao/connect/utils/registerServiceWorker";
import {
  ToastContainer,
  WagmiContext,
} from "@powerhousedao/design-system/connect";
import { useEffect } from "react";
import { ProcessorManagerProvider } from "@powerhousedao/connect/context/processor-manager";
export const App = () => {
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
        <ProcessorManagerProvider>
          <ToastContainer position="bottom-right" containerId="connect" />
          <Router />
          <Analytics />
        </ProcessorManagerProvider>
      </WagmiContext>
    </SentryProvider>
  );
};
