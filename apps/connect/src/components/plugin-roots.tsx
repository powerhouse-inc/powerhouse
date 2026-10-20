import { getConnectPluginUi } from "@powerhousedao/connect-core/plugins";
import { CookieConsent } from "./cookie-consent.js";

/** What the active plugins render beside the app, and the consent banner when one needs it. */
export function PluginRoots() {
  const { roots, consent } = getConnectPluginUi();
  return (
    <>
      {consent && <CookieConsent />}
      {roots.map((Root, i) => (
        <Root key={i} />
      ))}
    </>
  );
}
