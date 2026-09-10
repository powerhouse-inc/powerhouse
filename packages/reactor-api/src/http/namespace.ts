import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A package's namespace is its npm name, used verbatim as one or two path
 * segments. Nothing is slugged: dropping the scope, folding `.`/`_` to `-` or
 * lower-casing would all map distinct package names onto one namespace, and a
 * lossy mapping means two packages can silently claim the same URL space.
 * Verbatim is injective, so there is no collision left to detect.
 */

/**
 * npm's package-name grammar, per segment. Deliberately the same shape the HTTP
 * package loader validates with, so a name that can be installed can be routed.
 */
const SEGMENT = /^[a-z0-9][-a-z0-9._]*$/i;

/** Segments that would read as path traversal rather than as a name. */
const TRAVERSAL = new Set([".", ".."]);

export class InvalidNamespaceError extends Error {}

/**
 * Turns a package name into the path segments it occupies.
 * `@powerhousedao/workflow` → ["@powerhousedao", "workflow"]
 * `document-model`          → ["document-model"]
 */
export function namespaceSegments(packageName: string): string[] {
  if (!packageName) {
    throw new InvalidNamespaceError("Package name is empty");
  }

  const scoped = packageName.startsWith("@");
  const parts = (scoped ? packageName.slice(1) : packageName).split("/");

  if (parts.length !== (scoped ? 2 : 1)) {
    throw new InvalidNamespaceError(
      `"${packageName}" is not a package name: expected ${
        scoped ? "@scope/name" : "name"
      }`,
    );
  }

  for (const part of parts) {
    if (TRAVERSAL.has(part) || !SEGMENT.test(part)) {
      throw new InvalidNamespaceError(
        `"${packageName}" contains a segment that is not a valid npm name part: "${part}"`,
      );
    }
  }

  return scoped ? [`@${parts[0]!}`, parts[1]!] : parts;
}

/**
 * The path a package's routes hang off, relative to the package prefix.
 * Scoped names occupy two segments — the addressing unpkg and jsdelivr use.
 */
export function namespacePath(packageName: string): string {
  return namespaceSegments(packageName).join("/");
}

/**
 * The same path with the leading `@` percent-encoded. Both routers match the
 * raw pathname, so a client that percent-encodes each segment would otherwise
 * 404. Registering both spellings avoids decoding the pathname before matching,
 * which would turn `%2f` into `/` and let a crafted URL cross segment
 * boundaries. `%40` cannot introduce a boundary, which is what makes this safe.
 */
export function encodedNamespacePath(packageName: string): string | undefined {
  const path = namespacePath(packageName);
  return path.startsWith("@") ? `%40${path.slice(1)}` : undefined;
}

/**
 * A route path a package supplied. Must be relative and must not climb out of
 * the scope.
 */
export function assertRelativeRoutePath(path: string): string {
  if (path.startsWith("/")) {
    throw new InvalidNamespaceError(
      `Route path "${path}" must be relative to the scope, not absolute`,
    );
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new InvalidNamespaceError(
      `Route path "${path}" must be a path, not a URL`,
    );
  }
  if (path.split("/").some((segment) => TRAVERSAL.has(segment))) {
    throw new InvalidNamespaceError(
      `Route path "${path}" must not contain "." or ".." segments`,
    );
  }
  return path.replace(/^\/+|\/+$/g, "");
}

/**
 * Resolves the npm name a package is routed under from the key the package
 * manager holds it by. That key is the specifier as configured, which is not
 * always a name:
 * - `@scope/pkg` — already a name.
 * - `@scope/pkg@1.3.9` — a registry spec; only the loader strips the tag.
 * - `/Users/me/project` — the local project, which switchboard registers by
 *   `process.cwd()`. Its real name lives in its package.json.
 *
 * Deriving a URL segment straight from the key would give a developer's home
 * directory a route namespace, so the path form is resolved rather than slugged.
 */
export function resolvePackageName(
  key: string,
  readPackageJsonName: (dir: string) => string | undefined = defaultReadName,
): string {
  const withoutVersion = stripVersionSpec(key);
  if (isPackageName(withoutVersion)) return withoutVersion;

  if (key.startsWith("/") || key.startsWith(".")) {
    const name = readPackageJsonName(key);
    if (name && isPackageName(name)) return name;
    throw new InvalidNamespaceError(
      `Package at "${key}" has no usable name in its package.json, so it cannot host routes`,
    );
  }

  throw new InvalidNamespaceError(
    `"${key}" is not a package name and not a path, so it cannot host routes`,
  );
}

function isPackageName(value: string): boolean {
  try {
    namespaceSegments(value);
    return true;
  } catch {
    return false;
  }
}

/** `@scope/pkg@1.3.9` → `@scope/pkg`; `pkg@1.0.0` → `pkg`. */
function stripVersionSpec(key: string): string {
  const at = key.lastIndexOf("@");
  if (at <= 0) return key;
  return key.slice(0, at);
}

function defaultReadName(dir: string): string | undefined {
  try {
    // Deliberately synchronous and best-effort: this runs once per package at
    // load, and a missing or unreadable manifest is a normal outcome.
    const raw = readFileSync(join(dir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A mount path the host named for one of its own route groups.
 *
 * The host owns the whole URL space — it holds the adapter — so unlike a
 * package it may name an absolute path. That is the difference between hosting
 * and being hosted, and it is why this lives on the service rather than on a
 * scope: a package is only ever handed a scope, and a scope has no way to
 * express a path outside itself.
 *
 * What the host still may not name is anything that is not one stable literal
 * prefix. A traversal segment, or a pattern segment, would make the group's own
 * routes unpredictable relative to each other. Returns the normalized path,
 * with a leading and no trailing slash.
 */
export function assertHostMountPath(path: string): string {
  if (!path.startsWith("/")) {
    throw new InvalidNamespaceError(
      `Host mount path "${path}" must be absolute, e.g. "/webhooks"`,
    );
  }

  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new InvalidNamespaceError(
      `Host mount path "${path}" is the whole URL space, which is the adapter rather than a scope of it`,
    );
  }

  for (const segment of segments) {
    if (TRAVERSAL.has(segment)) {
      throw new InvalidNamespaceError(
        `Host mount path "${path}" must not contain "." or ".." segments`,
      );
    }
    if (segment.startsWith(":") || segment.includes("*")) {
      throw new InvalidNamespaceError(
        `Host mount path "${path}" must be a literal prefix, not a pattern: "${segment}"`,
      );
    }
  }

  return `/${segments.join("/")}`;
}
