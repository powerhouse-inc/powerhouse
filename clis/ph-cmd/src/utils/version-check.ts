import semver from "semver";
import {
  mkdir,
  readFile as readFileAsync,
  writeFile as writeFileAsync,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The release streams `ph self-update` knows about. The running build's
 * stream is derived from its own version (see `getStream`); users can
 * override it with `--tag`.
 */
export const PH_CMD_STREAMS = ["latest", "dev"] as const;
export type PhCmdStream = (typeof PH_CMD_STREAMS)[number];

/**
 * Which release stream a version belongs to: stable versions (no semver
 * prerelease tag) live on `latest`, everything else (dev, staging, rc,
 * test builds) on `dev` — the active development stream. A dev build must
 * not be nagged toward an older stable release. Unparseable versions fall
 * back to `latest` so a broken version string can never trigger a dev
 * target.
 */
export function getStream(version: string): PhCmdStream {
  const parsed = semver.parse(version);
  if (!parsed) return "latest";
  return parsed.prerelease.length > 0 ? "dev" : "latest";
}

/**
 * Whether the user should be nudged: true only when both versions parse
 * AND the stream target sorts strictly above the running version (semver
 * ordering, so a dev build correctly compares below its own release and
 * below newer dev builds). Never nags on broken data or downgrades.
 */
export function isOutdated(current: string, target: string): boolean {
  const currentParsed = semver.parse(current);
  const targetParsed = semver.parse(target);
  if (!currentParsed || !targetParsed) return false;
  return semver.gt(targetParsed, currentParsed);
}

const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const PACKAGE_NAME = "ph-cmd";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

/**
 * Injected for tests; the defaults below use the real registry, clock and
 * `~/.ph` cache file.
 */
export type VersionCheckDeps = {
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  now: () => number;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, contents: string) => Promise<void>;
  cachePath: string;
};

export type VersionCheckResult = {
  stream: PhCmdStream;
  target: string;
  checkedAt: string;
};

function parseCache(raw: unknown): VersionCheckResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(obj.checkedAt))
  )
    return null;
  if (typeof obj.target !== "string" || !semver.valid(obj.target)) return null;
  if (obj.stream !== "latest" && obj.stream !== "dev") return null;
  return { checkedAt: obj.checkedAt, stream: obj.stream, target: obj.target };
}

async function readCache(
  deps: VersionCheckDeps,
): Promise<VersionCheckResult | null> {
  let raw: string;
  try {
    raw = await deps.readFile(deps.cachePath);
  } catch {
    return null;
  }
  try {
    return parseCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Resolve the newest published version on the running build's release
 * stream, using a 24 h on-disk cache. Never throws: a missing/corrupt
 * cache or a failed fetch degrades to the stale value (or no result), so
 * the check can never break the wrapped command.
 */
export async function checkForNewerVersion(opts: {
  currentVersion: string;
  deps: VersionCheckDeps;
}): Promise<VersionCheckResult | null> {
  const { deps } = opts;
  const stream = getStream(opts.currentVersion);
  const cached = await readCache(deps);
  if (
    cached &&
    cached.stream === stream &&
    deps.now() - Date.parse(cached.checkedAt) < CACHE_TTL_MS
  ) {
    return cached;
  }
  let target: string | null = null;
  try {
    const res = await deps.fetch(
      `${NPM_REGISTRY_URL}/${PACKAGE_NAME}/${stream}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (res.ok) {
      const body = (await res.json()) as { version?: unknown };
      if (typeof body.version === "string" && semver.valid(body.version)) {
        target = body.version;
      }
    }
  } catch {
    // offline / timeout — keep whatever we had
  }
  if (target) {
    const checkedAt = new Date(deps.now()).toISOString();
    try {
      await deps.writeFile(
        deps.cachePath,
        JSON.stringify({ checkedAt, stream, target }, null, 2),
      );
    } catch {
      // a failed cache write must not fail the check
    }
    return { stream, target, checkedAt };
  }
  return cached && cached.stream === stream ? cached : null;
}

/** The exact one-line notice printed to stderr when the CLI is outdated. */
export function formatOutdatedNotice(
  current: string,
  target: string,
  stream: PhCmdStream,
): string {
  return `A new version of ${PACKAGE_NAME} is available: ${target} (you have ${current} — ${stream} stream). Run 'ph self-update' to update.`;
}

/**
 * Default deps for the bundled CLI: real registry fetch, wall clock, and
 * the `~/.ph` cache file (the same directory telemetry bootstraps). Tests
 * inject everything in `VersionCheckDeps` instead.
 */
function defaultDeps(): VersionCheckDeps {
  return {
    fetch: (url, init) => globalThis.fetch(url, init),
    now: () => Date.now(),
    readFile: (p) => readFileAsync(p, "utf-8"),
    writeFile: async (p, contents) => {
      await mkdir(dirname(p), { recursive: true });
      await writeFileAsync(p, contents, "utf-8");
    },
    cachePath: join(homedir(), ".ph", "ph-cmd-self-update.json"),
  };
}

export type MaybeNotifyOptions = {
  /** process argv without the node + script entries. */
  args: string[];
  /** the running build's version (getVersion()). */
  currentVersion: string;
  /** true when stderr is interactive; non-TTY runs refresh but stay silent. */
  stderrIsTty?: boolean;
  /** injected for tests; defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** partial deps for tests; defaults to the real registry + `~/.ph`. */
  deps?: Partial<VersionCheckDeps>;
  /** stderr sink for tests; defaults to process.stderr. */
  writeStderr?: (line: string) => void;
};

/**
 * The single entry point `cli.ts` calls on every invocation, before
 * dispatch. Skips help/version/self-update invocations, CI, and an
 * explicit `PH_NO_UPDATE_CHECK=1` opt-out; refreshes the 24 h cache when
 * stale; and prints the one-line notice to stderr only when the running
 * build is outdated AND stderr is a TTY. Never throws and never blocks
 * the wrapped command for more than the bounded fetch timeout.
 */
export async function maybeNotifyOutdated(
  opts: MaybeNotifyOptions,
): Promise<void> {
  const env = opts.env ?? process.env;
  const first = opts.args[0];
  if (opts.args.length === 0) return;
  if (
    first === "--help" ||
    first === "-h" ||
    first === "--version" ||
    first === "-v"
  )
    return;
  if (first === "self-update") return;
  if (env.CI === "1" || env.PH_NO_UPDATE_CHECK === "1") return;

  const deps: VersionCheckDeps = { ...defaultDeps(), ...opts.deps };
  const result = await checkForNewerVersion({
    currentVersion: opts.currentVersion,
    deps,
  }).catch(() => null);
  if (!result || !isOutdated(opts.currentVersion, result.target)) return;
  if (opts.stderrIsTty !== true) return;
  const writeStderr =
    opts.writeStderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  writeStderr(
    formatOutdatedNotice(opts.currentVersion, result.target, result.stream),
  );
}

/**
 * Record a version as current so the next run's check is quiet (used by
 * `ph self-update` right after a successful update: target == new current,
 * so the outdated notice stops).
 */
export async function setCacheCurrent(
  version: string,
  deps?: Partial<VersionCheckDeps>,
): Promise<void> {
  const full: VersionCheckDeps = { ...defaultDeps(), ...deps };
  try {
    await full.writeFile(
      full.cachePath,
      JSON.stringify(
        {
          checkedAt: new Date(full.now()).toISOString(),
          stream: getStream(version),
          target: version,
        },
        null,
        2,
      ),
    );
  } catch {
    // best effort — the notice logic tolerates a missing cache
  }
}
