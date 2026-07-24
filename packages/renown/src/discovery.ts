export interface ResolveSwitchboardEndpointOptions {
  // Explicit Switchboard GraphQL endpoint. When set, used directly.
  switchboardUrl?: string;
  // Renown base URL to ask for a switchboard endpoint when none is explicit.
  baseUrl?: string;
  // Max time (ms) to wait for the discovery probe before falling back to REST.
  timeoutMs?: number;
}

// Legacy Renown instances accept the connection but never respond to the
// discovery request; without a bound, `fetch` hangs and blocks startup.
const DEFAULT_DISCOVERY_TIMEOUT_MS = 3000;

// Shape returned by the Renown app's `/api/switchboard` discovery endpoint.
interface DiscoveryResponse {
  endpoint?: string;
}

// Resolve the Switchboard GraphQL endpoint: explicit `switchboardUrl` wins,
// else discover via `{baseUrl}/api/switchboard`; undefined means use REST.
export async function resolveSwitchboardEndpoint(
  options: ResolveSwitchboardEndpointOptions,
): Promise<string | undefined> {
  const { switchboardUrl, baseUrl, timeoutMs } = options;

  if (switchboardUrl) {
    return switchboardUrl;
  }

  if (!baseUrl) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS,
  );

  try {
    const url = new URL("/api/switchboard", baseUrl);
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as DiscoveryResponse;
    return body.endpoint || undefined;
  } catch {
    // Old Renown instances never answer (or lack the endpoint); the abort
    // timeout rejects here so we fall back to the REST flow instead of hanging.
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
