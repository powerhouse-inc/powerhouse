/** A switchboard drive address, `<base>/d/<slug>`, taken apart. */
export interface SwitchboardDrive {
  /** `<origin>[/<prefix>]`: one base is one switchboard. */
  base: string;
  /** `<base>/graphql`. */
  graphql: string;
  /** The slug the drive is served under. */
  slug: string;
}

/** The switchboard a drive address names; undefined when `url` is not one. */
export function switchboardOfDrive(url: string): SwitchboardDrive | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  const match = /^(.*)\/d\/([^/]+)\/?$/.exec(parsed.pathname);
  if (!match) return undefined;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
  const base = `${parsed.origin}${match[1]}`;
  return { base, graphql: `${base}/graphql`, slug };
}

/** Why `url` is refused as a reactor link, naming the drive address to use. */
export function driveAddressMessage(url: string): string {
  const graphql = /^(https?:\/\/[^?#]*?)\/graphql\/?(?:[?#].*)?$/.exec(url);
  const use = graphql
    ? `use ${graphql[1]}/d/<slug>, one of the switchboard's drives`
    : "use one of the switchboard's drives, e.g. http://localhost:4001/d/powerhouse";
  return `${url} is not a switchboard drive address (<switchboard>/d/<slug>): ${use}.`;
}
