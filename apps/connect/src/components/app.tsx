import { Analytics, Router } from "@powerhousedao/connect/components";

import {
  ProcessorManagerProvider,
  SentryProvider,
} from "@powerhousedao/connect/context";
import { DocumentEditorDebugTools, serviceWorkerManager } from "@powerhousedao/connect/utils";
import {
  ToastContainer,
  WagmiContext,
} from "@powerhousedao/design-system/connect";
import { useEffect } from "react";
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
