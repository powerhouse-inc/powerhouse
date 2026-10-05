import { gt, valid } from "semver";

/**
 * Split an install spec (`name`, `name@tag`, or `name@version`) into the
 * stream it points at. A missing `@` — or one that is only the scope marker
 * of a scoped name (`@scope/pkg`) — means `latest`. Otherwise the suffix is
 * a version when it is valid semver, a dist tag otherwise.
 */
export function parseInstallSpec(
  spec?: string,
): { kind: "tag"; value: string } | { kind: "version"; value: string } {
  if (!spec) return { kind: "tag", value: "latest" };
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { kind: "tag", value: "latest" };
  const value = spec.slice(at + 1);
  return valid(value) ? { kind: "version", value } : { kind: "tag", value };
}

/**
 * Resolve the update target for an installed package: the current value of
 * the user's stream (the dist tag named by the install spec, or `latest`
 * for pinned/bare installs). The `latest` stream is reported by every
 * registry as the package's newest version (`latestVersion`), so it falls
 * back to that when the full dist-tag map is absent; any other stream is
 * only known from the dist-tag map and is never guessed.
 *
 * Returns the target only when it and the installed version are valid
 * semver and the target is strictly newer — equal, older, invalid, or
 * missing data all yield `undefined` (no downgrade, no guess).
 */
export function getUpdateTarget(
  installed: { version?: string | null; spec?: string | null },
  info: {
    distTags?: Record<string, string> | null;
    latestVersion?: string | null;
  },
): string | undefined {
  const parsed = parseInstallSpec(installed.spec ?? undefined);
  const stream = parsed.kind === "tag" ? parsed.value : "latest";
  const target =
    stream === "latest"
      ? (info.distTags?.latest ?? info.latestVersion ?? undefined)
      : info.distTags?.[stream];
  if (!target || !valid(target)) return undefined;
  const installedVersion = installed.version;
  if (!installedVersion || !valid(installedVersion)) return undefined;
  return gt(target, installedVersion) ? target : undefined;
}
