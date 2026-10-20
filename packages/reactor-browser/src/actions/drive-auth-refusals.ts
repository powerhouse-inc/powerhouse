/**
 * Drives whose discovery the switchboard refused as an auth error
 * (`isDriveAuthError`): a protected drive the caller may not read yet.
 *
 * Discovery fails before the drive is ever listed, so the route that asked
 * for it ends in "drive not found". This lets the not-found view tell a
 * refusal (offer a login) from a drive that really is missing. Keyed by the
 * `/d/<idOrSlug>` segment of the drive URL, which is what the route carries.
 * In memory: a reload re-runs discovery and re-records.
 */
const refused = new Set<string>();
const listeners = new Set<() => void>();

/** The `<idOrSlug>` of a `.../d/<idOrSlug>` drive URL, if it has one. */
export function driveUrlKey(url: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const match = /\/d\/([^/?#]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function publish(): void {
  for (const listener of [...listeners]) listener();
}

export function recordDriveAuthRefusal(url: string): void {
  const key = driveUrlKey(url);
  if (!key || refused.has(key)) return;
  refused.add(key);
  publish();
}

export function clearDriveAuthRefusal(url: string): void {
  const key = driveUrlKey(url);
  if (!key || !refused.delete(key)) return;
  publish();
}

/** Whether discovery of the drive with this id or slug was refused as an auth error. */
export function isDriveAuthRefused(idOrSlug: string): boolean {
  return refused.has(idOrSlug);
}

export function subscribeDriveAuthRefusals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
