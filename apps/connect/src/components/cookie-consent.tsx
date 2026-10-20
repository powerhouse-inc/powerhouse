import { lazy, Suspense } from "react";
import { ErrorBoundary } from "./error-boundary.js";

const CookieBanner = lazy(() =>
  import("./cookie-banner.js").then((m) => ({ default: m.CookieBanner })),
);

/** Asks for the analytics consent that active plugins need; without one, consent stays rejected. */
export function CookieConsent() {
  // An optional, ad-blocker-vulnerable chunk: if blocked, the app runs with analytics off.
  return (
    <ErrorBoundary variant="silent" loggerContext={["Connect", "CookieBanner"]}>
      <Suspense fallback={null} name="CookieBanner">
        <CookieBanner />
      </Suspense>
    </ErrorBoundary>
  );
}
