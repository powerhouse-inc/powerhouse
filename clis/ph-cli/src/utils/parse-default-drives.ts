/**
 * Comma-separated URL string → array of `{url, name: null, icon: null}`
 * entries suitable for `connect.drives.defaultDrives`. Used by ph-cli's
 * CLI-override builders and by `ph vetra` when forwarding the local
 * switchboard's drive URLs into the runtime config.
 */
export const parseDefaultDrivesUrl = (
  v: string,
): Array<{ url: string; name: null; icon: null }> =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url, name: null, icon: null }));
