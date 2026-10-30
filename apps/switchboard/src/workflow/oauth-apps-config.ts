import path from "node:path";

/**
 * A token broker for an app's web client (see the reactor-workflow README,
 * "OAuth2 connections"). The workflow runtime checks it when it loads the
 * apps: a client id and two absolute https URLs, else it is dropped with a
 * warning.
 */
export interface OAuthAppRelayConfig {
  clientId: string;
  redirectUri: string;
  tokenUrl: string;
}

/** One publisher OAuth2 app as `workflows.oauthApps` names it. */
export interface OAuthAppConfig {
  id: string;
  clients: { desktop?: string; web?: string };
  relay?: OAuthAppRelayConfig;
}

/**
 * The config file's `workflows.oauthApps`, client file paths made absolute
 * from `dir`, the config file's folder. A malformed entry is left out; a
 * relay that is not an object is dropped and reported, the app kept without
 * it. The relay's fields are checked by the runtime, as for apps a host
 * passes itself.
 */
export function parseOAuthApps(
  raw: unknown,
  dir: string,
  onDroppedRelay?: (appId: string, relay: unknown) => void,
): OAuthAppConfig[] {
  if (!Array.isArray(raw)) return [];
  const at = (p: unknown) =>
    typeof p === "string" && p ? path.resolve(dir, p) : undefined;
  return raw.flatMap((entry: unknown) => {
    const app = (entry ?? {}) as {
      id?: unknown;
      clients?: { desktop?: unknown; web?: unknown };
      relay?: unknown;
    };
    if (typeof app.id !== "string" || !app.id) return [];
    const desktop = at(app.clients?.desktop);
    const web = at(app.clients?.web);
    let relay: OAuthAppRelayConfig | undefined;
    if (app.relay !== undefined) {
      if (
        typeof app.relay === "object" &&
        app.relay !== null &&
        !Array.isArray(app.relay)
      ) {
        relay = app.relay as OAuthAppRelayConfig;
      } else {
        onDroppedRelay?.(app.id, app.relay);
      }
    }
    return [
      {
        id: app.id,
        clients: { ...(desktop ? { desktop } : {}), ...(web ? { web } : {}) },
        ...(relay ? { relay } : {}),
      },
    ];
  });
}
