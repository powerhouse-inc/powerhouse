// Segments followed by a token that is the request's whole credential:
// a webhook's delivery token, a waitpoint's resume token.
const TOKEN_SEGMENTS = ["/webhooks/", "/waitpoints/"];

/**
 * Strips a webhook's delivery token out of a request path.
 *
 * The token is the endpoint's whole credential and it sits in the path, so it
 * must not reach a log line or a span attribute that ships off-box. The family
 * mounts under the host's base path, so the segment can sit at any depth.
 */
export function redactWebhookPath(url: string | undefined): string {
  if (!url) return "";
  // Dropped with the token: `http.route` is meant to be a template, and a
  // query string is another place a sender can put a credential.
  const path = url.split("?")[0] ?? url;
  for (const segment of TOKEN_SEGMENTS) {
    const at = path.indexOf(segment);
    if (at === -1) continue;
    // Nothing after the segment is nothing to redact.
    if (path.length === at + segment.length) return url;
    return `${path.slice(0, at)}${segment}[redacted]`;
  }
  return url;
}
