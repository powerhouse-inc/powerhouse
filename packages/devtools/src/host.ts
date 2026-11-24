import { DEVTOOLS_TOKEN_META } from "./paths.js";

/** The attribute of the token tag that names the dev server's base path. */
export const DEVTOOLS_BASE_ATTRIBUTE = "data-base";

function tokenTag(): HTMLMetaElement | undefined {
  // A server that renders the app has no document.
  const page = globalThis.document as Document | undefined;
  return (
    page?.querySelector<HTMLMetaElement>(
      `meta[name="${DEVTOOLS_TOKEN_META}"]`,
    ) ?? undefined
  );
}

/**
 * The token the dev server put in this page, or undefined on a page no
 * DevTools dev server served: a build, or a dev server without DevTools.
 * This is the one switch: DevTools shows only where it returns a token.
 */
export function readDevtoolsToken(): string | undefined {
  return tokenTag()?.content.trim() || undefined;
}

/** The base path the dev server serves the app under, as its tag says. */
export function readDevtoolsBase(): string | undefined {
  return tokenTag()?.getAttribute(DEVTOOLS_BASE_ATTRIBUTE) ?? undefined;
}

const attribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The tag a dev server puts in the `<head>` of the pages it serves. */
export function devtoolsTokenTag(token: string, base = "/"): string {
  return `<meta name="${DEVTOOLS_TOKEN_META}" content="${attribute(token)}" ${DEVTOOLS_BASE_ATTRIBUTE}="${attribute(base)}">`;
}
