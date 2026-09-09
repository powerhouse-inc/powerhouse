/**
 * Normalises a route path for path-to-regexp v8:
 * - Collapses duplicate slashes (e.g. "//explorer" → "/explorer")
 * - Converts legacy optional-param syntax "/:param?" → "{/:param}". The
 *   slash must move inside the group: in p-r v8 a group whose content
 *   begins with "/" is what makes the slash and the parameter optional
 *   together, while a literal "/" left in front of the group compiles to
 *   a pattern that matches nothing (and v8 rejects a bare ":param?").
 *
 * Shared by both http adapters so registry dispatch matches the same path
 * shapes regardless of which framework is in use.
 */
export function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/:(\w+)\?/g, "{/:$1}");
}
