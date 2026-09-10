import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "./src/runtime-config.js";
import { initPerformanceObserver } from "./src/utils/performance-observer.js";

if (!window.ph) {
  window.ph = {};
}

// Capture FCP/LCP before anything else. The observers use `buffered: true`, so
// they catch the browser's paint even if setup runs a tick after it fires.
initPerformanceObserver();

const root = createRoot(document.getElementById("root")!);

// Paint the loading skeleton before the runtime config is fetched. The
// skeleton is config-independent (it reads the <base> tag and the ?embed=
// query param, not the config), so first contentful paint no longer waits on
// the powerhouse.config.json network round-trip.
const { default: AppSkeleton } =
  await import("./src/components/app-skeleton.js");
root.render(<AppSkeleton />);

// The config-dependent app — and the modules that read the runtime config at
// module-evaluation — loads only once the config is warm. AppLoader's Suspense
// fallback is the same AppSkeleton, so the swap causes no visible flash.
await loadRuntimeConfig();
const { AppLoader } = await import("./src/components/app-loader.js");
root.render(<AppLoader />);
