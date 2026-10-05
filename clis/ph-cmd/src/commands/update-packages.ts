import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { createInterface } from "node:readline/promises";

export interface ConfigPackage {
  packageName: string;
  version: string;
  provider?: "registry" | "local";
  [key: string]: unknown;
}

export interface OutdatedPackage {
  name: string;
  currentVersion: string;
  newVersion: string;
  provider: "registry" | "local";
}

export type ResolveLatest = (
  name: string,
  currentVersion: string,
) => Promise<string | null>;

/**
 * The slice of `semver` this module uses. It is injected (rather than
 * statically imported) because the CLI cold-path rule forbids static imports
 * of heavy modules in command files — the caller lazy-loads `semver` and
 * passes it in.
 */
export interface SemverFns {
  valid: (v: string | null) => unknown;
  clean: (v: string) => string | null;
  major: (v: string) => number;
  gt: (a: string, b: string) => boolean;
  compare: (a: string, b: string) => number;
}

/**
 * True when the stored value is a dist-tag (dev/staging/rc/latest) rather than
 * a concrete semver version. Dist-tags are re-resolved against the registry at
 * load time, so they self-update and must not be bumped.
 */
export function isDistTag(version: string, semver: SemverFns): boolean {
  return !semver.valid(semver.clean(version));
}

/**
 * Pure: decide which pinned packages have a newer release. Dist-tags are
 * skipped (they self-update via the tag). `resolveLatest` is injected so this
 * decision logic is testable without a network; `semver` is lazy-loaded.
 */
export async function findOutdatedPackages(
  packages: ConfigPackage[],
  resolveLatest: ResolveLatest,
): Promise<OutdatedPackage[]> {
  const semver = await import("semver");
  const outdated: OutdatedPackage[] = [];
  for (const pkg of packages) {
    if (!pkg.version || isDistTag(pkg.version, semver)) continue;
    const newVersion = await resolveLatest(pkg.packageName, pkg.version);
    if (newVersion && newVersion !== pkg.version) {
      outdated.push({
        name: pkg.packageName,
        currentVersion: pkg.version,
        newVersion,
        provider: pkg.provider === "local" ? "local" : "registry",
      });
    }
  }
  return outdated;
}

/**
 * Pure: bump the given packages' versions in place, preserving each entry's
 * provider and any other fields. Only the listed packages are touched.
 */
export function applyVersionBumps(
  config: { packages?: ConfigPackage[] },
  updates: Pick<OutdatedPackage, "name" | "newVersion">[],
): void {
  const byName = new Map(updates.map((u) => [u.name, u.newVersion]));
  for (const pkg of config.packages ?? []) {
    const next = byName.get(pkg.packageName);
    if (next !== undefined) pkg.version = next;
  }
}

/** Fetch every published version string for a package from the registry. */
export async function fetchNpmVersions(
  name: string,
  registryUrl?: string,
): Promise<string[]> {
  const { spawnAsync } = await import("@powerhousedao/shared/clis");
  const args = ["view", name, "versions", "--json"];
  if (registryUrl) args.push("--registry", registryUrl);
  try {
    const parsed: unknown = JSON.parse(await spawnAsync("npm", args));
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * The newest published version within the same major as `currentVersion`, or
 * null when the current version is already the newest in that major.
 */
export async function resolveLatestSameMajor(
  name: string,
  currentVersion: string,
  registryUrl?: string,
): Promise<string | null> {
  const semver = await import("semver");
  const current = semver.clean(currentVersion);
  if (!current || !semver.valid(current)) return null;
  const currentMajor = semver.major(current);
  const candidates = (await fetchNpmVersions(name, registryUrl))
    .map((v) => semver.clean(v))
    .filter((v): v is string => v !== null && semver.valid(v) !== null)
    .filter((v) => semver.major(v) === currentMajor && semver.gt(v, current));
  if (candidates.length === 0) return null;
  candidates.sort(semver.compare);
  return candidates[candidates.length - 1];
}

/** Interactive prompt; returns the subset of `outdated` the user accepts. */
export async function promptForUpdates(
  outdated: OutdatedPackage[],
): Promise<OutdatedPackage[]> {
  const chosen: OutdatedPackage[] = [];
  for (const pkg of outdated) {
    const answer = await confirm(
      `${pkg.name} ${pkg.currentVersion} → ${pkg.newVersion} — update? [y/N]`,
    );
    if (answer) chosen.push(pkg);
  }
  return chosen;
}

async function confirm(prompt: string): Promise<boolean> {
  const { default: chalk } = await import("chalk");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(chalk.cyan(prompt))).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export interface UpdateInstalledArgs {
  registryUrl?: string;
  /** true for `--update-packages`: apply automatically, no prompt. */
  auto: boolean;
  skipInstall: boolean;
  packageManager?: { agent: string } | null;
  /** Config file path; defaults to the cwd's powerhouse.config.json. */
  configPath?: string;
  /** Command runner; defaults to the shared `runCmd`. */
  runCommand?: (command: string) => void;
  /** Version resolver; defaults to `resolveLatestSameMajor`. */
  resolveLatest?: ResolveLatest;
  /** Interactive prompt; defaults to `promptForUpdates`. */
  prompt?: (outdated: OutdatedPackage[]) => Promise<OutdatedPackage[]>;
}

/**
 * The `ph update` step that keeps installed (powerhouse.config.json) packages
 * current. Bumps each outdated pinned package's version, writes the config,
 * and, for `local`-provider packages, runs the package manager's update.
 * Returns the names of the local packages it bumped.
 *
 * `chalk` and the shared CLI helpers are lazy-imported (CLI cold-path rule).
 * `runCommand`, `resolveLatest` and `prompt` are injectable for tests; they
 * default to the shared module's behavior.
 */
export async function updateInstalledPackages(
  args: UpdateInstalledArgs,
): Promise<string[]> {
  const [chalkMod, { runCmd, POWERHOUSE_CONFIG_FILE }] = await Promise.all([
    import("chalk"),
    import("@powerhousedao/shared/clis"),
  ]);
  const chalk = chalkMod.default;
  const {
    registryUrl,
    auto,
    skipInstall,
    packageManager,
    resolveLatest,
    prompt,
  } = args;
  const run = args.runCommand ?? runCmd;
  const configPath = args.configPath ?? join(cwd(), POWERHOUSE_CONFIG_FILE);

  if (!existsSync(configPath)) return [];
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
    packages?: ConfigPackage[];
  };
  if (!config.packages?.length) return [];

  const resolve =
    resolveLatest ??
    ((name, version) => resolveLatestSameMajor(name, version, registryUrl));
  const outdated = await findOutdatedPackages(config.packages, resolve);
  if (outdated.length === 0) {
    console.log(chalk.dim("\nInstalled packages are up to date."));
    return [];
  }

  const toUpdate = auto
    ? outdated
    : await (prompt ?? promptForUpdates)(outdated);
  if (toUpdate.length === 0) {
    console.log(chalk.dim("No packages updated."));
    return [];
  }

  for (const pkg of toUpdate) {
    console.log(
      chalk.green(`  ↻ ${pkg.name} ${pkg.currentVersion} → ${pkg.newVersion}`),
    );
  }

  applyVersionBumps(config, toUpdate);
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const localBumped = toUpdate
    .filter((pkg) => pkg.provider === "local")
    .map((pkg) => pkg.name);
  if (localBumped.length > 0 && !skipInstall && packageManager) {
    console.log(
      chalk.cyan(
        `\nUpdating local package(s) with \`${packageManager.agent}\`...`,
      ),
    );
    run(`${packageManager.agent} update ${localBumped.join(" ")}`);
  }

  return localBumped;
}
