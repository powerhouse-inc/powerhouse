import { isPluginActive } from "@powerhousedao/connect-core/plugins";
import { lazy, Suspense } from "react";
import { GENERIC_PLUGIN } from "../plugins/ids.js";
import { ErrorBoundary } from "./error-boundary.js";

const CookieBanner = lazy(() =>
  import("./cookie-banner.js").then((m) => ({ default: m.CookieBanner })),
);

/** The cookie banner is the generic chrome's; core mode never loads it, so consent stays rejected. */
export function CookieConsent() {
  if (!isPluginActive(GENERIC_PLUGIN)) return null;
  // An optional, ad-blocker-vulnerable chunk: if blocked, the app runs with analytics off.
  return (
    <ErrorBoundary variant="silent" loggerContext={["Connect", "CookieBanner"]}>
      <Suspense fallback={null} name="CookieBanner">
        <CookieBanner />
      </Suspense>
    </ErrorBoundary>
  );
}
