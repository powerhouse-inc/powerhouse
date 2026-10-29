import { ORIGIN_PLACEHOLDER } from "../connect/origin-placeholder.js";

/** A switchboard drive address, `<base>/d/<slug>`, taken apart. */
export interface SwitchboardDrive {
  /** `<origin>[/<prefix>]`: one base is one switchboard. */
  base: string;
  /** `<base>/graphql`. */
  graphql: string;
  /** The slug the drive is served under. */
  slug: string;
}

// Stands in for the page origin while parsing `${origin}/d/<slug>`.
const PLACEHOLDER_HOST = "origin.invalid";

/**
 * The switchboard a drive address names; undefined when `url` is not one.
 * `${origin}/d/<slug>` is one too: a drive on the switchboard the page's own
 * origin proxies, whose base stays `${origin}` for the browser to resolve.
 */
export function switchboardOfDrive(url: string): SwitchboardDrive | undefined {
  const proxied = url.startsWith(`${ORIGIN_PLACEHOLDER}/`);
  let parsed: URL;
  try {
    parsed = proxied
      ? new URL(
          url.slice(ORIGIN_PLACEHOLDER.length),
          `http://${PLACEHOLDER_HOST}`,
        )
      : new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  // `${origin}//elsewhere/d/x` would otherwise name another host's path
  if (proxied && parsed.host !== PLACEHOLDER_HOST) return undefined;
  const match = /^(.*)\/d\/([^/]+)\/?$/.exec(parsed.pathname);
  if (!match) return undefined;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
  const base = `${proxied ? ORIGIN_PLACEHOLDER : parsed.origin}${match[1]}`;
  return { base, graphql: `${base}/graphql`, slug };
}

/** Why `url` is refused as a reactor link, naming the drive address to use. */
export function driveAddressMessage(url: string): string {
  const graphql =
    /^(https?:\/\/[^?#]*?|\$\{origin\}[^?#]*?)\/graphql\/?(?:[?#].*)?$/.exec(
      url,
    );
  const use = graphql
    ? `use ${graphql[1]}/d/<slug>, one of the switchboard's drives`
    : "use one of the switchboard's drives, e.g. http://localhost:4001/d/powerhouse";
  return `${url} is not a switchboard drive address (<switchboard>/d/<slug>): ${use}.`;
}
