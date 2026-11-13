import fs from "node:fs";
import path from "node:path";
import type { AppJsonUpdates } from "./app-json.js";

/**
 * What a build of an app with updates leaves for its release (app.json
 * `updates`): under `<shell>/target/release/bundle/release/`, every installer
 * it made, under a name no host rewrites, and the feed file that tells the
 * running apps of this system about them. Attach every file in that folder to
 * the release and the apps find it.
 *
 * One feed file per system and processor (`latest-linux-x86_64.json`), not one
 * for the whole release: each system builds in its own job, and a job that
 * fails then costs its own users the update and nobody else's. The app asks
 * for its own file by name (FEED_FILE_TEMPLATE).
 */

/** Under the bundle folder: this build's release files. */
export const RELEASE_DIR = "release";

/** The feed file a build writes for its system and processor. */
export function feedFileName(os: string, arch: string): string {
  return `latest-${os}-${arch}.json`;
}

/** That name in a feed address: the updater fills in the running app's own
 * system (linux, darwin, windows) and processor (x86_64, aarch64, …). */
export const FEED_FILE_TEMPLATE = "latest-{{target}}-{{arch}}.json";

/** The updater's names for the systems and processors Node reports. */
const UPDATER_OS: Partial<Record<NodeJS.Platform, string>> = {
  linux: "linux",
  darwin: "darwin",
  win32: "windows",
};
const UPDATER_ARCH: Partial<Record<string, string>> = {
  x64: "x86_64",
  arm64: "aarch64",
  ia32: "i686",
  arm: "armv7",
};

/** A file a build makes: where tauri puts it, and, when a running app can
 * install it, the updater's name for that way of installing. */
type Artifact = { dir: string; suffix: string; installer?: string };
const ARTIFACTS: Partial<Record<NodeJS.Platform, Artifact[]>> = {
  linux: [
    { dir: "deb", suffix: ".deb", installer: "deb" },
    { dir: "rpm", suffix: ".rpm", installer: "rpm" },
    { dir: "appimage", suffix: ".AppImage", installer: "appimage" },
  ],
  win32: [{ dir: "nsis", suffix: "-setup.exe", installer: "nsis" }],
  darwin: [
    // The disk image is what a person downloads; a running app takes the
    // archive of the bundle.
    { dir: "dmg", suffix: ".dmg" },
    { dir: "macos", suffix: ".app.tar.gz", installer: "app" },
  ],
};

/** A file name every host keeps as it is: GitHub rewrites a space (and most
 * punctuation) in a release file's name to a dot, and a feed that names the
 * file as it was built would then point at nothing. */
export function releaseFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, ".");
}

/**
 * Where a release's files are downloaded from: PH_DESKTOP_RELEASE_URL when
 * set, else the GitHub release of app.json's `updates.github` under this
 * build's tag (the tag a workflow runs for, else `v<version>`). null when
 * neither says: the build then writes no feed file.
 */
export function releaseBaseUrl(
  updates: AppJsonUpdates,
  version: string | undefined,
  env: Record<string, string | undefined>,
): string | null {
  const given = env.PH_DESKTOP_RELEASE_URL?.trim();
  if (given) {
    let url: URL | null = null;
    try {
      url = new URL(given);
    } catch {
      // reported below
    }
    if (url?.protocol !== "https:") {
      throw new Error(
        `PH_DESKTOP_RELEASE_URL must be the https address the release's files are downloaded from, not "${given}".`,
      );
    }
    return given.replace(/\/+$/, "");
  }
  if (!updates.github) return null;
  const tag =
    env.GITHUB_REF_TYPE === "tag" && env.GITHUB_REF_NAME
      ? env.GITHUB_REF_NAME
      : `v${version ?? "0.1.0"}`;
  return `https://github.com/${updates.github}/releases/download/${encodeURIComponent(tag)}`;
}

export interface CollectReleaseInput {
  /** `<shell>/target/release/bundle`. */
  bundleDir: string;
  productName: string;
  /** The version the installers carry, which is the one that was signed. */
  version: string;
  /** Where the files will be downloaded from; null writes no feed file. */
  baseUrl: string | null;
  /** Only what was written from this time on (ms): an earlier build's files
   * are no part of this release. */
  since?: number;
  platform?: NodeJS.Platform;
  arch?: string;
  now?: Date;
}

export interface CollectedRelease {
  dir: string;
  /** Every file in `dir`, the feed included. */
  files: string[];
  /** The feed file's name, when one was written. */
  feed: string | null;
  /** What the feed offers: `linux-x86_64-deb`, … */
  targets: string[];
  /** Installers a running app could take, had they been signed. */
  unsigned: string[];
}

/** A second's slack: some filesystems keep a file's time to the second. */
const TIME_SLACK_MS = 1000;

/** Gathers this build's release files and writes its feed file. */
export function collectRelease(input: CollectReleaseInput): CollectedRelease {
  const platform = input.platform ?? process.platform;
  const os = UPDATER_OS[platform];
  const arch = UPDATER_ARCH[input.arch ?? process.arch];
  const dir = path.join(input.bundleDir, RELEASE_DIR);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const result: CollectedRelease = {
    dir,
    files: [],
    feed: null,
    targets: [],
    unsigned: [],
  };
  if (!os || !arch) return result;

  const fresh = (file: string): boolean =>
    fs.existsSync(file) &&
    (input.since === undefined ||
      fs.statSync(file).mtimeMs >= input.since - TIME_SLACK_MS);
  const platforms: Record<string, { signature: string; url: string }> = {};
  for (const artifact of ARTIFACTS[platform] ?? []) {
    const from = path.join(input.bundleDir, artifact.dir);
    if (!fs.existsSync(from)) continue;
    const built = fs
      .readdirSync(from)
      .filter((name) => name.endsWith(artifact.suffix))
      .map((name) => path.join(from, name))
      .filter((file) => fs.statSync(file).isFile() && fresh(file))
      // The newest last, so it is the one the feed offers.
      .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
    for (const file of built) {
      // tauri names the bundle's archive after the app alone: the release
      // holds one per processor, so it gets the version and processor too.
      const name = releaseFileName(
        artifact.installer === "app"
          ? `${input.productName}_${input.version}_${arch}${artifact.suffix}`
          : path.basename(file),
      );
      fs.copyFileSync(
        file,
        path.join(dir, name),
        fs.constants.COPYFILE_FICLONE,
      );
      result.files.push(name);
      if (!artifact.installer) continue;
      const signatureFile = `${file}.sig`;
      if (!fresh(signatureFile)) {
        result.unsigned.push(name);
        continue;
      }
      if (input.baseUrl === null) continue;
      platforms[`${os}-${arch}-${artifact.installer}`] = {
        signature: fs.readFileSync(signatureFile, "utf8").trim(),
        url: `${input.baseUrl}/${name}`,
      };
    }
  }

  result.targets = Object.keys(platforms).sort();
  if (result.targets.length > 0) {
    const feed = feedFileName(os, arch);
    fs.writeFileSync(
      path.join(dir, feed),
      JSON.stringify(
        {
          version: input.version,
          pub_date: (input.now ?? new Date()).toISOString(),
          platforms,
        },
        null,
        2,
      ) + "\n",
    );
    result.feed = feed;
    result.files.push(feed);
  }
  return result;
}

/** What a build says about the release files it gathered. */
export function releaseReport(
  release: CollectedRelease,
  releaseUrl: string | null,
): string[] {
  if (release.files.length === 0) {
    return ["no release files: the build made no installer."];
  }
  const lines = [`release files in ${release.dir}:`];
  for (const file of release.files) lines.push(`  ${file}`);
  for (const file of release.unsigned) {
    lines.push(`${file} has no signature, so the feed does not offer it.`);
  }
  if (release.feed) {
    lines.push(
      `${release.feed} offers ${release.targets.join(", ")} from ${releaseUrl}: ` +
        `attach every file in that folder to the release there.`,
    );
  } else if (releaseUrl === null) {
    lines.push(
      "no feed file: set PH_DESKTOP_RELEASE_URL to the address the release's " +
        "files are downloaded from (app.json names its own feed, not a GitHub repository).",
    );
  }
  return lines;
}
