import { getConnectPluginUi } from "@powerhousedao/connect-core/plugins";
import { getRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { CookieConsent } from "./cookie-consent.js";

/** What the active plugins render beside the app, and the consent banner when one needs it. */
export function PluginRoots() {
  const { roots, consent } = getConnectPluginUi();
  const banner = getRuntimeConfig().connect.app?.cookieBanner !== false;
  return (
    <>
      {consent && banner && <CookieConsent />}
      {roots.map((Root, i) => (
        <Root key={i} />
      ))}
    </>
  );
}
