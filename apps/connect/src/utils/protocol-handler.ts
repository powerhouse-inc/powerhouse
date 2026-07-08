import { PWA_PROTOCOL_LAUNCH_PARAM } from "@powerhousedao/shared/connect";
import { connectConfig } from "../connect.config.js";

// PWA protocol handling: consume `web+ph://…` links the OS routes to the
// installed Connect app. The manifest registers a Connect-owned handler URL
// (`./?ph-protocol=%s`), so a launch arrives as a normal navigation carrying
// the full link in the `ph-protocol` query param; we translate it into an
// in-app route.

/** Fired on a protocol launch, carrying the raw `web+ph://…` link, so product
 * code can implement richer routing than the default path mapping below. The
 * event is cancelable: a listener that calls `preventDefault()` suppresses the
 * built-in navigation and takes over routing itself. */
export const PROTOCOL_LAUNCH_EVENT = "ph:protocolLaunch";

function joinBasename(basename: string, path: string): string {
  const left = basename.endsWith("/") ? basename.slice(0, -1) : basename;
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${left}${right}` || "/";
}

/**
 * Map a `web+<scheme>://<rest>` (or `web+<scheme>:<rest>`) link to an in-app
 * path. The default mapping treats everything after the scheme as an
 * app-relative route: `web+ph://drive/abc` → `<routerBasename>/drive/abc`.
 * Returns null for a link that doesn't parse.
 */
export function protocolLinkToPath(link: string): string | null {
  const match = /^web\+[a-z]+:(\/\/)?(.*)$/i.exec(link.trim());
  if (!match) return null;
  const rest = match[2];
  if (!rest) return joinBasename(connectConfig.routerBasename, "/");
  return joinBasename(connectConfig.routerBasename, rest);
}

let initialized = false;

/**
 * Read a `?ph-protocol=` launch on boot, strip the marker from the URL, notify
 * listeners, and navigate to the mapped in-app route (best-effort, via the
 * History API + popstate so react-router picks it up). Idempotent; a no-op when
 * no protocol launch is present.
 */
export function initProtocolHandler() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const raw = url.searchParams.get(PWA_PROTOCOL_LAUNCH_PARAM);
  if (!raw) return;

  // Strip the marker so a reload doesn't re-trigger the launch.
  url.searchParams.delete(PWA_PROTOCOL_LAUNCH_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());

  // Cancelable: a listener that calls preventDefault() owns the routing, so we
  // skip the built-in navigation below.
  const event = new CustomEvent(PROTOCOL_LAUNCH_EVENT, {
    detail: { link: raw },
    cancelable: true,
  });
  window.dispatchEvent(event);
  if (event.defaultPrevented) return;

  const path = protocolLinkToPath(raw);
  if (!path) {
    console.warn("[Connect][PWA] unroutable protocol link:", raw);
    return;
  }
  // Navigate within the SPA: replaceState + popstate is what createBrowserRouter
  // subscribes to, so this routes without a full reload.
  window.history.replaceState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
