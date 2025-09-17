import {
  Analytics,
  DocumentEditorDebugTools,
  Router,
  SentryProvider,
  serviceWorkerManager,
} from "@powerhousedao/connect";
import { ToastContainer, WagmiContext } from "@powerhousedao/design-system";
import { useEffect } from "react";
import { ProcessorManagerProvider } from "@powerhousedao/connect";

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
