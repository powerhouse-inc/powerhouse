import { spawn as spawnChild } from "cross-spawn";
import { readFile as readFileAsync } from "node:fs/promises";

import { getStream } from "./version-check.js";

export type GlobalPackageManager = "npm" | "pnpm" | "bun" | "yarn";

export type InstallDetection =
  | { pm: GlobalPackageManager; pkgRoot: string }
  | { pm: null; reason: "source-checkout" | "unknown" };

const PACKAGE_NAME = "ph-cmd";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Which package manager owns the running global install, resolved from the
 * real path of the running bundle (the bin entry is a symlink; the ESM
 * loader resolves it). Path signatures:
 *   pnpm:  <global>/node_modules/.pnpm/ph-cmd@<v>/node_modules/ph-cmd/...
 *   bun:   <home>/.bun/install/global/node_modules/ph-cmd/...
 *   yarn:  <global>/yarn/global/node_modules/ph-cmd/...  (yarn classic)
 *   npm:   <prefix>/lib/node_modules/ph-cmd/... (any plain node_modules)
 * A source checkout (<repo>/clis/ph-cmd/dist/cli.mjs) and any unrecognized
 * layout are refused with a reason instead of guessing.
 */
export function detectGlobalInstall(rawPath: string): InstallDetection {
  const real = normalizePath(rawPath);
  if (real.includes("/clis/ph-cmd/")) {
    return { pm: null, reason: "source-checkout" };
  }
  const pkgDir = real.endsWith(`/dist/cli.mjs`)
    ? real.slice(0, -"/dist/cli.mjs".length)
    : null;
  if (!pkgDir || !pkgDir.endsWith(`/${PACKAGE_NAME}`)) {
    return { pm: null, reason: "unknown" };
  }
  if (real.includes(`/node_modules/.pnpm/${PACKAGE_NAME}@`)) {
    return { pm: "pnpm", pkgRoot: pkgDir };
  }
  if (real.includes("/.bun/install/global/node_modules/")) {
    return { pm: "bun", pkgRoot: pkgDir };
  }
  if (real.includes("/yarn/global/node_modules/")) {
    return { pm: "yarn", pkgRoot: pkgDir };
  }
  if (real.includes("/node_modules/")) {
    return { pm: "npm", pkgRoot: pkgDir };
  }
  return { pm: null, reason: "unknown" };
}

const UPDATE_COMMANDS: Record<
  GlobalPackageManager,
  { command: (spec: string) => string; argv: (spec: string) => string[] }
> = {
  npm: {
    command: (spec) => `npm install -g ${spec}`,
    argv: (spec) => ["npm", "install", "-g", spec],
  },
  pnpm: {
    command: (spec) => `pnpm add -g ${spec}`,
    argv: (spec) => ["pnpm", "add", "-g", spec],
  },
  bun: {
    command: (spec) => `bun add -g ${spec}`,
    argv: (spec) => ["bun", "add", "-g", spec],
  },
  yarn: {
    command: (spec) => `yarn global add ${spec}`,
    argv: (spec) => ["yarn", "global", "add", spec],
  },
};

/** Human-readable update command (for error hints). */
export function updateCommand(pm: GlobalPackageManager, tag: string): string {
  return UPDATE_COMMANDS[pm].command(`${PACKAGE_NAME}@${tag}`);
}

/** Exact argv used to spawn the package manager. */
export function updateArgv(pm: GlobalPackageManager, tag: string): string[] {
  return UPDATE_COMMANDS[pm].argv(`${PACKAGE_NAME}@${tag}`);
}

export type SelfUpdateDeps = {
  /** Runs a full argv (program first); rejects on non-zero exit. */
  spawner?: (argv: string[], opts: { stdio: "inherit" }) => Promise<void>;
  readFile?: (path: string) => Promise<string>;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** called with the new version after a successful update (clears the notice). */
  refreshCache?: (newVersion: string) => Promise<void>;
};

export type SelfUpdateResult =
  | { ok: true; from: string; to: string }
  | { ok: false; message: string };

function defaultSpawner(
  argv: string[],
  opts: { stdio: "inherit" },
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const child = spawnChild(argv[0], argv.slice(1), opts);
  child.on("close", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`${argv[0]} exited with code ${code}`)),
  );
  child.on("error", reject);
  return promise;
}

/**
 * Upgrade the global ph-cmd install to `tag` (default: the running build's
 * stream) using the owning package manager, then report the new version.
 * Never throws: refusals and failures come back as `{ ok: false }` so the
 * command layer owns the exit code.
 */
export async function runSelfUpdate(opts: {
  currentVersion: string;
  tag?: string;
  realPath: string;
  deps?: SelfUpdateDeps;
}): Promise<SelfUpdateResult> {
  const {
    spawner = defaultSpawner,
    readFile = (p: string) => readFileAsync(p, "utf-8"),
    stdout = (line: string) => console.log(line),
    stderr = (line: string) => console.error(line),
    refreshCache,
  } = opts.deps ?? {};

  const detection = detectGlobalInstall(opts.realPath);
  if (detection.pm === null) {
    if (detection.reason === "source-checkout") {
      const message =
        "ph is running from a source checkout; self-update only applies to global installs.";
      stderr(message);
      return { ok: false, message };
    }
    const manual = (Object.keys(UPDATE_COMMANDS) as GlobalPackageManager[])
      .map((pm) => `  ${updateCommand(pm, "latest")}`)
      .join("\n");
    const message = `Couldn't determine how ph was installed (${opts.realPath}). Update manually:\n${manual}`;
    stderr(message);
    return { ok: false, message };
  }

  const tag = opts.tag ?? getStream(opts.currentVersion);
  stdout(
    `Updating ph-cmd via ${detection.pm} (${updateCommand(detection.pm, tag)})...`,
  );
  try {
    await spawner(updateArgv(detection.pm, tag), { stdio: "inherit" });
  } catch (error: unknown) {
    const message = `ph-cmd update failed via ${detection.pm}. Try manually: ${updateCommand(detection.pm, tag)}`;
    stderr(message);
    if (error instanceof Error) stderr(error.message);
    return { ok: false, message };
  }

  let to = "unknown";
  try {
    const pkg = JSON.parse(
      await readFile(`${detection.pkgRoot}/package.json`),
    ) as { version?: unknown };
    if (typeof pkg.version === "string") to = pkg.version;
  } catch {
    // leave "unknown" — the PM already printed its own result
  }
  stdout(
    `Updated ph-cmd from ${opts.currentVersion} to ${to}. The new version takes effect on your next 'ph' run.`,
  );
  await refreshCache?.(to).catch(() => {});
  return { ok: true, from: opts.currentVersion, to };
}
