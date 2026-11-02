/**
 * Hostname rules of a Portle site, vendored from site-relay
 * (`packages/shared/src/hostnames.ts` at df26ab8). The relay's control plane
 * enforces the same rules on the names a site may claim, so a config this
 * module refuses would be refused there too. Keep in sync.
 */

/** Site IDs are opaque: 10 chars, [a-z0-9], first char a letter. */
export const SITE_ID_RE = /^[a-z][a-z0-9]{9}$/;

/** One DNS label as we allow it: 1-63 chars of [a-z0-9-], no leading/trailing dash. */
export const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export type ZoneKind = "customer" | "shared";

export function isSiteId(value: string): boolean {
  return SITE_ID_RE.test(value);
}

/** Lowercase ASCII, no trailing dot, every label well formed, at most 253 chars. */
export function isWellFormedHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  if (value !== value.toLowerCase()) return false;
  return value.split(".").every((label) => LABEL_RE.test(label));
}

/** A site zone: well formed, at least two labels, no punycode. */
export function isSiteZone(value: string): boolean {
  if (!isWellFormedHostname(value)) return false;
  const labels = value.split(".");
  return (
    labels.length >= 2 && !labels.some((label) => label.startsWith("xn--"))
  );
}

/** The wildcard name every site gets. */
export function siteWildcard(siteZone: string): string {
  return `*.${siteZone}`;
}
