/**
 * The public runtime config: the app's own `powerhouse.config.json` with the
 * switchboard's local origin replaced by the site's public one, so the SPA
 * served at `https://app.<zone>` calls `https://app.<zone>` for its drives.
 *
 * It is served on demand by the switchboard, on `PUBLIC_CONFIG_PATH`, and
 * Caddy rewrites the app label's `/powerhouse.config.json` to it. On demand,
 * not rendered once at tunnel start: in the compound the app comes up after
 * the switchboard, so a one-shot fetch at boot found nothing and the public
 * site served loopback drive URLs until the next restart.
 */

/** Where the switchboard serves it; the path is no secret, the config is public. */
export const PUBLIC_CONFIG_PATH = "/portle/public/powerhouse.config.json";

export interface PublicConfigSource {
  /** The app upstream's origin, e.g. `http://localhost:2540`. */
  appUrl: string;
  /** The switchboard's local port, the one the app's config names. */
  apiPort: string;
  /** What replaces it: `https://app.<zone>`. */
  publicOrigin: string;
}

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"] as const;

/**
 * Replaces every `http://<local host>:<apiPort>` with the public origin. The
 * text must be JSON: an HTML fallback page from a dev server is refused.
 */
export function rewritePublicConfig(
  text: string,
  source: Pick<PublicConfigSource, "apiPort" | "publicOrigin">,
): string {
  JSON.parse(text);
  let rewritten = text;
  for (const host of LOCAL_HOSTS) {
    rewritten = rewritten
      .split(`http://${host}:${source.apiPort}`)
      .join(source.publicOrigin);
  }
  return rewritten;
}

export interface PublicConfigHandlerOptions {
  /** Null while the site is not published same-origin: the route answers 404. */
  source: () => PublicConfigSource | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
}

const json = (status: number, body: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });

/** A Fetch handler for the switchboard's HTTP adapter. */
export function createPublicConfigHandler(
  options: PublicConfigHandlerOptions,
): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { error: "GET only" }, { allow: "GET, HEAD" });
    }
    const source = options.source();
    if (!source) {
      return json(404, { error: "This site is not published same-origin" });
    }
    const from = `${source.appUrl}/powerhouse.config.json`;
    try {
      const res = await fetchImpl(from, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`the app answered HTTP ${res.status}`);
      const body = rewritePublicConfig(await res.text(), source);
      return new Response(request.method === "HEAD" ? null : body, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.log?.("public runtime config unavailable", {
        from,
        error: message,
      });
      return json(502, {
        error: `The app's runtime config could not be read from ${from}: ${message}`,
      });
    }
  };
}
