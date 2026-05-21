import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "./src/runtime-config.js";

if (!window.ph) {
  window.ph = {};
}

// Bootstrap the runtime config BEFORE AppLoader's transitive imports
await loadRuntimeConfig();
const { AppLoader } = await import("./src/components/app-loader.js");

createRoot(document.getElementById("root")!).render(<AppLoader />);
