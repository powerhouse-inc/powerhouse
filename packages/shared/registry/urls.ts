// Pure URL helpers, kept free of Node imports so the browser SPA can import
// them directly (like ./manifest-slim.js) without pulling in ./registry.js.

/**
 * Derive the package-CDN base from a registry URL: `/-/cdn` is appended
 * unless the URL already points at the CDN. Packages are then served at
 * `<cdn>/<name[@version]>/...` — both Connect's runtime package manager and
 * the Connect build's PWA-fragment collection resolve packages this way.
 */
export function toCdnUrl(registryUrl: string): string {
  if (registryUrl.includes("/-/cdn")) return registryUrl;
  const base = registryUrl.endsWith("/")
    ? registryUrl.slice(0, -1)
    : registryUrl;
  return `${base}/-/cdn`;
}
