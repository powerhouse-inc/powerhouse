import {
  isHtmlNavigation,
  SWITCHBOARD_PROXY_PATHS,
} from "@powerhousedao/shared/connect/origin-placeholder";
import type { ProxyOptions } from "vite";

/**
 * Vite proxy rules (dev and preview servers alike) that send the
 * switchboard's paths to `target`, so a browser on Connect's origin reaches
 * the switchboard through it and the served config can name the switchboard
 * as `${origin}` (runner.proxy on the connect host).
 *
 * `/d/<drive>` is both a switchboard endpoint and one of Connect's own
 * routes: a browser navigation there (it accepts HTML) is left to Connect,
 * every other request on the path goes to the switchboard. GraphQL carries
 * the subscriptions websocket, so that rule upgrades too. The Host header
 * is left as the browser sent it: the switchboard builds the URLs it hands
 * out from it, and on the page's origin is where they must point.
 */
export function switchboardProxy(target: string): Record<string, ProxyOptions> {
  const origin = new URL(target).origin;
  const rules: Record<string, ProxyOptions> = {};
  for (const prefix of SWITCHBOARD_PROXY_PATHS) {
    const key = prefix.endsWith("/")
      ? `^${escape(prefix)}`
      : `^${escape(prefix)}(/|$)`;
    rules[key] = {
      target: origin,
      changeOrigin: false,
      ...(prefix === "/graphql" ? { ws: true } : {}),
      ...(prefix === "/d/"
        ? {
            bypass: (req) =>
              isHtmlNavigation(req.headers.accept) ? req.url : undefined,
          }
        : {}),
    };
  }
  return rules;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
