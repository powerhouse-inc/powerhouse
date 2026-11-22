import { nextBranchVersion } from "./next-version";
import { listPublishableManifests } from "./npm-propagation";

const REGISTRY = "https://registry.npmjs.org";

/**
 * The one version every non-private package under the release globs has on
 * disk. Throws when they differ: the tree is mid-bump or mid-merge, and a
 * release from it would pin stale sibling versions.
 */
export async function readLockstepVersion(
  globs: string[],
  cwd = process.cwd(),
): Promise<string> {
  const manifests = await listPublishableManifests(globs, cwd);
  if (manifests.length === 0) {
    throw new Error(
      `No publishable package found under ${globs.join(", ")} in ${cwd}.`,
    );
  }
  const byVersion = new Map<string, string[]>();
  for (const { name, version } of manifests) {
    const key = version ?? "(no version)";
    byVersion.set(key, [...(byVersion.get(key) ?? []), name]);
  }
  if (byVersion.size > 1) {
    const lines = [...byVersion.entries()].map(
      ([version, names]) => `  ${version}: ${names.join(", ")}`,
    );
    throw new Error(
      `The package.json versions are not in lockstep; the tree is mid-bump or mid-merge. Make them equal before releasing:\n${lines.join("\n")}`,
    );
  }
  const version = manifests[0]?.version;
  if (!version) {
    throw new Error("The publishable packages have no version on disk.");
  }
  return version;
}

/**
 * Every version npm holds for `name`. A package that was never published
 * (404) has none; any other failure throws, because a silent empty answer
 * would let a branch release reuse a taken counter.
 */
async function fetchPublishedVersions(name: string): Promise<string[]> {
  const url = `${REGISTRY}/${name.replace("/", "%2F")}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/vnd.npm.install-v1+json",
      "cache-control": "no-cache",
    },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      `npm answered ${res.status} for ${name}; cannot tell which versions are taken.`,
    );
  }
  let doc: { versions?: Record<string, unknown> };
  try {
    doc = (await res.json()) as { versions?: Record<string, unknown> };
  } catch (error) {
    throw new Error(
      `npm answered ${name} with a body that is not JSON; cannot tell which versions are taken.`,
      { cause: error },
    );
  }
  return Object.keys(doc.versions ?? {});
}

/** The union of the npm versions of every given package. */
export async function fetchTakenVersions(names: string[]): Promise<string[]> {
  const perPackage = await Promise.all(names.map(fetchPublishedVersions));
  return [...new Set(perPackage.flat())];
}

/** Git tags of earlier branch releases, as they are in this checkout. */
export function listNextTags(cwd = process.cwd()): string[] {
  const result = Bun.spawnSync({
    cmd: ["git", "tag", "--list", "v*-next.*"],
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to list git tags: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Versions a branch release must not reuse: npm, all packages, plus git tags. */
export async function listTakenVersions(
  globs: string[],
  cwd = process.cwd(),
): Promise<string[]> {
  const manifests = await listPublishableManifests(globs, cwd);
  const published = await fetchTakenVersions(
    manifests.map((manifest) => manifest.name),
  );
  return [...published, ...listNextTags(cwd)];
}

/** The version a branch release with this `version_prefix` publishes. */
export async function resolveBranchVersion(
  prefix: string,
  globs: string[],
  cwd = process.cwd(),
): Promise<{ version: string; diskVersion: string }> {
  const diskVersion = await readLockstepVersion(globs, cwd);
  const taken = await listTakenVersions(globs, cwd);
  return {
    version: nextBranchVersion({ prefix, diskVersion, taken }),
    diskVersion,
  };
}

/**
 * Throws when `version` has been taken since it was computed. nx does not
 * fail on an existing version: it moves the dist-tag to it and reports
 * success, so the check has to happen here, right before publish.
 */
export async function assertVersionNotTaken(
  version: string,
  globs: string[],
  cwd = process.cwd(),
): Promise<void> {
  const taken = await listTakenVersions(globs, cwd);
  if (taken.some((entry) => entry.replace(/^v/, "") === version)) {
    throw new Error(
      `${version} was taken on npm or as a git tag while this release was running. Nothing was published; run the release again to get the next counter.`,
    );
  }
}
