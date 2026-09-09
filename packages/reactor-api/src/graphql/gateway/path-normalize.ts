/**
 * Normalises a route path for path-to-regexp v8:
 * - Collapses duplicate slashes (e.g. "//explorer" → "/explorer")
 * - Converts legacy optional-param syntax ":param?" → "{/:param}?"
 *
 * Shared by both http adapters so registry dispatch matches the same path
 * shapes regardless of which framework is in use.
 */
export function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/:(\w+)\?/g, "{/:$1}");
}
