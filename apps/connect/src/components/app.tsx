import { Analytics } from "@powerhousedao/connect/components/analytics";
import { Router } from "@powerhousedao/connect/components/router";
import { ProcessorManagerProvider } from "@powerhousedao/connect/context/processor-manager";
import { SentryProvider } from "@powerhousedao/connect/context/sentry-provider";
import { DocumentEditorDebugTools } from "@powerhousedao/connect/utils/document-editor-debug-tools";
import { serviceWorkerManager } from "@powerhousedao/connect/utils/registerServiceWorker";
import { useEffect } from "react";
import { ToastContainer } from "@powerhousedao/design-system/connect/components/toast/toast";
import { WagmiContext } from "@powerhousedao/design-system/connect/context/WagmiContext";
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
