import type { PHConnectDefaultDrive } from "@powerhousedao/shared/clis";

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
