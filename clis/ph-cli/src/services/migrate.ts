import {
  fetchPackageVersionFromNpmRegistry,
  injectPnpmAllowBuilds,
  spawnAsync,
} from "@powerhousedao/shared/clis";
import { ALL_POWERHOUSE_DEPENDENCIES } from "@powerhousedao/shared/constants";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { detect, resolveCommand } from "package-manager-detector";
import { compare, minVersion, prerelease, rcompare, valid } from "semver";
import type { MigrateArgs } from "../types.js";
import { findNodeProjectRoot, isPowerhouseProject } from "../utils.js";
import { unifiedDiff } from "./migrate-subgraphs.js";

// Dist-tags a prerelease version can name its channel by.
const PRERELEASE_TAGS = ["dev", "staging", "rc"];

// Set on the re-executed migrate, so the version check runs once.
const VERSION_CHECKED_ENV = "PH_MIGRATE_VERSION_CHECKED";

type ProjectPackageJson = Partial<
  Record<
    "dependencies" | "devDependencies" | "peerDependencies",
    Record<string, string>
  >
>;

function readProjectPackageJson(projectDir: string): ProjectPackageJson {
  try {
    return JSON.parse(
      readFileSync(join(projectDir, "package.json"), "utf8"),
    ) as ProjectPackageJson;
  } catch {
    return {};
  }
}

/** The newest Powerhouse package version the project's package.json pins */
export function newestPowerhouseVersion(packageJson: ProjectPackageJson) {
  const pinned = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
  ].flatMap((deps) =>
    Object.entries(deps ?? {}).flatMap(([name, range]) => {
      if (!ALL_POWERHOUSE_DEPENDENCIES.includes(name)) return [];
      try {
        const version = minVersion(range)?.version;
        return version ? [{ name, version }] : [];
      } catch {
        // workspace:, catalog: and other non-semver specifiers
        return [];
      }
    }),
  );
  return pinned.sort((a, b) => rcompare(a.version, b.version)).at(0);
}

/** The dist-tag of the channel the project is on, and why */
export function inferReleaseTag(packageJson: ProjectPackageJson): {
  tag: string;
  reason: string;
} {
  const newest = newestPowerhouseVersion(packageJson);
  if (!newest) {
    return { tag: "latest", reason: "no Powerhouse package version is pinned" };
  }
  const channel = prerelease(newest.version)?.[0];
  const pinned = `${newest.name}@${newest.version}`;
  if (typeof channel === "string" && PRERELEASE_TAGS.includes(channel)) {
    return { tag: channel, reason: `the project is on ${pinned}` };
  }
  return {
    tag: "latest",
    reason: `the project is on ${pinned}, ${channel === undefined ? "a stable release" : "not on a dev, staging or rc channel"}`,
  };
}

/** Whether `target` is an older release than `installed`: lower by semver, or
 * published earlier (6.2.3 ranks above 6.2.3-dev.49 but can predate it). */
export function isOlderRelease(
  installed: string,
  target: string,
  publishTimes: Partial<Record<string, string>> = {},
): boolean {
  if (!valid(installed) || !valid(target)) return false;
  if (compare(target, installed) < 0) return true;
  const installedAt = publishTimes[installed];
  const targetAt = publishTimes[target];
  if (!installedAt || !targetAt) return false;
  return Date.parse(targetAt) < Date.parse(installedAt);
}

async function fetchPublishTimes(
  packageName: string,
): Promise<Partial<Record<string, string>>> {
  try {
    return JSON.parse(
      await spawnAsync("npm", ["view", packageName, "time", "--json"]),
    ) as Partial<Record<string, string>>;
  } catch {
    return {};
  }
}

async function warnIfOlderRelease(
  packageJson: ProjectPackageJson,
  targetVersion: string,
) {
  const newest = newestPowerhouseVersion(packageJson);
  if (!newest) return;
  const publishTimes = await fetchPublishTimes("@powerhousedao/ph-cli");
  if (!isOlderRelease(newest.version, targetVersion, publishTimes)) return;
  console.warn(
    `⚠ ${targetVersion} is an older release than the installed ${newest.name}@${newest.version}; migrating moves the project back. Pass a version or tag (e.g. \`ph migrate dev\`) to stay on yours.`,
  );
}

function getBundledPhCliVersion(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8"),
      ) as { name?: string; version?: string };
      if (pkg.name === "@powerhousedao/ph-cli") return pkg.version;
    } catch {
      // keep walking
    }
    dir = dirname(dir);
  }
}

export function resolveCodegenVersion(
  codegenMod: Record<string, unknown>,
): string | undefined {
  const getter = codegenMod.getCodegenVersion;
  if (typeof getter === "function") {
    const v = (getter as () => unknown)();
    if (typeof v === "string") return v;
  }
  return undefined;
}

export function assertCodegenMatchesBundled(args: {
  codegenVersion: string | undefined;
  bundledVersion: string | undefined;
  force: boolean;
}): void {
  const { codegenVersion, bundledVersion, force } = args;
  if (force) return;
  if (!codegenVersion) {
    throw new Error(
      `@powerhousedao/codegen is older than this ph-cli expects (no version export). ` +
        `Reinstall ph-cli to bring a matching codegen, or re-run with --force.`,
    );
  }
  if (bundledVersion && codegenVersion !== bundledVersion) {
    throw new Error(
      `@powerhousedao/codegen@${codegenVersion} does not match ph-cli@${bundledVersion}. ` +
        `Reinstall to align versions, or re-run with --force.`,
    );
  }
}

type FileChange = {
  path: string;
  before: string | undefined;
  after: string | undefined;
};

/** What a dry run prints: one unified diff per file, paths relative to the
 * project, a deleted file against /dev/null. */
export function dryRunReport(
  projectDir: string,
  result: { changes: readonly FileChange[]; notRun: readonly string[] },
): string {
  const diffs = result.changes.map(({ path, before, after }) => {
    const file = relative(projectDir, path).replaceAll("\\", "/");
    if (after === undefined) {
      const removed = `--- a/${file}\n+++ /dev/null\n`;
      const diff = unifiedDiff({ path: file, before: before ?? "", after: "" });
      // An empty file has no lines to show.
      return diff === ""
        ? removed
        : diff.replace(`--- a/${file}\n+++ b/${file}\n`, removed);
    }
    // An added empty file has no lines either.
    return (
      unifiedDiff({ path: file, before: before ?? null, after }) ||
      `--- /dev/null\n+++ b/${file}\n`
    );
  });
  const notRun =
    result.notRun.length > 0
      ? `Not previewed; a real run would also:\n${result.notRun.map((step) => `  - ${step}\n`).join("")}`
      : "";
  if (diffs.length === 0) {
    return `ph migrate would change no file.\n${notRun}`;
  }
  return `${diffs.join("")}ph migrate would write ${diffs.length} file(s); nothing was written.\n${notRun}`;
}

export async function startMigrate({
  versionPositional,
  version,
  force,
  debug,
  dryRun,
}: MigrateArgs) {
  // The project is where powerhouse.config.json is: the command also runs
  // from a sub-folder, and from a package of a monorepo.
  const projectDir =
    findNodeProjectRoot(process.cwd(), isPowerhouseProject) ?? process.cwd();
  if (debug) console.log(`[migrate] project directory: ${projectDir}`);
  const packageJson = readProjectPackageJson(projectDir);
  let requested = versionPositional ?? version;
  if (requested === undefined) {
    const inferred = inferReleaseTag(packageJson);
    requested = inferred.tag;
    console.log(
      `No version given; migrating to "${inferred.tag}" because ${inferred.reason}.`,
    );
  }
  if (debug) console.log(`[migrate] requested version: ${requested}`);

  let targetVersion: string | undefined;
  try {
    targetVersion = await fetchPackageVersionFromNpmRegistry(
      `@powerhousedao/ph-cli@${requested}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!force) {
      throw new Error(
        `Failed to resolve "${requested}" from the npm registry: ${reason}\nRe-run with --force to migrate using the installed version.`,
        { cause: error },
      );
    }
    if (debug) {
      console.log(
        `[migrate] failed to resolve target version, --force is set, falling back to bundled codegen: ${reason}`,
      );
    }
  }

  if (targetVersion && !process.env[VERSION_CHECKED_ENV]) {
    await warnIfOlderRelease(packageJson, targetVersion);
  }

  const bundledVersion = getBundledPhCliVersion();
  if (debug) {
    console.log(
      `[migrate] resolved target version: ${targetVersion ?? "(unknown)"}`,
    );
    console.log(
      `[migrate] current ph-cli version: ${bundledVersion ?? "(unknown)"}`,
    );
  }

  if (!targetVersion || force || targetVersion === bundledVersion) {
    if (debug) console.log(`[migrate] running migrate from bundled codegen`);
    const codegenMod = await import("@powerhousedao/codegen");
    const codegenVersion = resolveCodegenVersion(
      codegenMod as unknown as Record<string, unknown>,
    );
    assertCodegenMatchesBundled({
      codegenVersion,
      bundledVersion,
      force: Boolean(force),
    });
    console.log(
      `Running migrate with @powerhousedao/codegen@${codegenVersion ?? "unknown"}`,
    );
    const result = await codegenMod.migrate(
      targetVersion ?? requested,
      projectDir,
      { dryRun: Boolean(dryRun) },
    );
    if (dryRun) process.stdout.write(dryRunReport(projectDir, result));
    return;
  }

  const agent = (await detect({ cwd: projectDir }))?.agent ?? "npm";
  const resolved = resolveCommand(agent, "execute", [
    `@powerhousedao/ph-cli@${targetVersion}`,
    "migrate",
    "--version",
    targetVersion,
    ...(dryRun ? ["--dry-run"] : []),
    ...(debug ? ["--debug"] : []),
  ]);
  if (!resolved) {
    throw new Error(
      `Failed to resolve execute command for package manager "${agent}".`,
    );
  }

  injectPnpmAllowBuilds(agent, resolved);

  const command = `${resolved.command} ${resolved.args.join(" ")}`;
  if (debug) {
    console.log(`[migrate] detected package manager: ${agent}`);
    console.log(`[migrate] re-executing: ${command}`);
  }
  execSync(command, {
    cwd: projectDir,
    stdio: "inherit",
    env: { ...process.env, [VERSION_CHECKED_ENV]: "1" },
  });
}
