import { DocumentEditorDebugTools, SentryProvider, serviceWorkerManager } from "@powerhousedao/connect";
import { ToastContainer, WagmiContext } from "@powerhousedao/design-system";
import ProcessorManagerProvider from "../context/processor-manager.js";
import Analytics from "./analytics.js";
import { Router } from "./router.js";

if (import.meta.env.MODE === "development") {
  window.documentEditorDebugTools = new DocumentEditorDebugTools();
} else {
  serviceWorkerManager.registerServiceWorker(false);
}

const App = () => (
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

export default App;
