import type {
  PHConnectCollection,
  PHConnectDefaultDrive,
  PHConnectRuntimeConfig,
  PHConnectRuntimeDefaultDrive,
} from "@powerhousedao/shared/clis";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { remoteBackends } from "./backend-projection.js";
import type { ReactorConfig } from "./host-schemas.js";

/**
 * Instance-fact projection for compound hosts: the drives a compound's
 * reactor member created, projected into the Connect member's runtime-config
 * override. Pure functions, moved from ph-cli's vetra service so the generic
 * compound and the classic path share one implementation.
 */

function isLocalDrive(
  drive: PHConnectDefaultDrive,
): drive is Extract<PHConnectDefaultDrive, { local: true }> {
  return "local" in drive;
}

// Identity key for de-duplication: remote entries are keyed by URL; local
// entries are keyed by `local:<id>` so a local drive id can never collide
// with a remote URL that happens to be the same string.
const driveKey = (drive: PHConnectDefaultDrive): string =>
  isLocalDrive(drive) ? `local:${drive.id}` : drive.url;

/**
 * Concatenate groups of `connect.drives.defaultDrives` in the order given,
 * de-duplicating by drive identity (URL for remote entries, id for local
 * ones). The first occurrence of a drive wins, so earlier groups keep their
 * position and metadata — e.g. the Vetra drive `ph vetra` starts stays first
 * even when the project's `powerhouse.config.json` lists the same drive.
 */
export function mergeDefaultDrives(
  ...groups: PHConnectDefaultDrive[][]
): PHConnectDefaultDrive[] {
  const seen = new Set<string>();
  const out: PHConnectDefaultDrive[] = [];
  for (const group of groups) {
    for (const drive of group) {
      const key = driveKey(drive);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(drive);
    }
  }
  return out;
}

/**
 * Rebase a local drive URL onto a public base: keeps the /d/<slug> path,
 * swaps the loopback origin for the public base. Browser clients behind a
 * reverse proxy can't reach http://localhost:<port>. Non-loopback URLs
 * (e.g. a remote drive) are already public and pass through unchanged, as do
 * unparseable ones.
 */
export function rebaseDriveUrl(driveUrl: string, publicBase: string): string {
  let url: URL;
  try {
    url = new URL(driveUrl);
  } catch {
    return driveUrl;
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return driveUrl;
  }
  return `${publicBase.replace(/\/+$/, "")}${url.pathname}`;
}

export interface DriveProjectionInput {
  /** Drive URLs the compound's reactor member created, in display order
   * (e.g. vetra, preview, workflows). Null/undefined entries are skipped. */
  createdDriveUrls: (string | null | undefined)[];
  /** The project's configured `connect.drives.defaultDrives`. */
  configuredDefaultDrives?: PHConnectDefaultDrive[];
  /** `--drives-public-base`: advertise proxy-reachable URLs to the browser. */
  publicBase?: string | null;
}

/**
 * The compound's drives projection: created drives first (rebased onto the
 * public base when given), then the project's configured drives, de-duplicated
 * — and `preserve-all`, because compound-injected drive lists change per
 * launch context and must never detach drives the user added by hand.
 */
export function projectDrivesIntoConnect(
  input: DriveProjectionInput,
): Pick<PHConnectRuntimeConfig, "drives"> {
  const created: PHConnectDefaultDrive[] = input.createdDriveUrls
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((url) => ({
      url: input.publicBase ? rebaseDriveUrl(url, input.publicBase) : url,
      name: null,
      icon: null,
    }));
  return {
    drives: {
      defaultDrives: mergeDefaultDrives(
        created,
        input.configuredDefaultDrives ?? [],
      ),
      preserveStrategy: "preserve-all",
    },
  };
}

/** A served slug names a declared one as is, or hashed (`<slug>-<8 hex>`). */
function servesSlug(declared: string, served: string): boolean {
  return (
    served === declared ||
    (served.startsWith(`${declared}-`) &&
      /^[0-9a-f]{8}$/.test(served.slice(declared.length + 1)))
  );
}

export interface PlacedConnectDrives {
  defaultDrives: PHConnectRuntimeDefaultDrive[];
  collections?: Record<string, PHConnectCollection>;
}

/** Annotates remote default drives with their backend (`sync: false` when placed on it); other remote placements become collections. */
export function placeConnectDrives(
  reactor: ReactorConfig | undefined,
  defaultDrives: readonly PHConnectDefaultDrive[],
): PlacedConnectDrives {
  const remotes = remoteBackends(reactor).flatMap(({ name, url }) => {
    const at = switchboardOfDrive(url);
    return at ? [{ name, base: at.base }] : [];
  });
  if (remotes.length === 0) return { defaultDrives: [...defaultDrives] };
  const placement = Object.entries(reactor?.placement?.drives ?? {});
  const matched = new Set<string>();
  const placed = defaultDrives.map((drive): PHConnectRuntimeDefaultDrive => {
    if (!("url" in drive)) return drive;
    const at = switchboardOfDrive(drive.url);
    const backend = remotes.find((remote) => remote.base === at?.base)?.name;
    if (!at || !backend) return drive;
    const entry = placement.find(([slug]) => servesSlug(slug, at.slug));
    if (entry) matched.add(entry[0]);
    return entry?.[1] === backend
      ? { ...drive, backend, sync: false }
      : { ...drive, backend };
  });
  const names = new Set(remotes.map((remote) => remote.name));
  const collections = Object.fromEntries(
    placement
      .filter(([slug, backend]) => !matched.has(slug) && names.has(backend))
      .map(([slug, backend]) => [slug, { backend, sync: false }]),
  );
  return Object.keys(collections).length > 0
    ? { defaultDrives: placed, collections }
    : { defaultDrives: placed };
}
