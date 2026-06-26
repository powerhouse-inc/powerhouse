import type { Agent } from "package-manager-detector";
import { execSync } from "node:child_process";

const PH_CLI_PACKAGE = "@powerhousedao/ph-cli";
// `init` was added to ph-cli in the 6.x rewrite. Older versions (still on
// the `latest` tag at time of writing) shell out via commander and bail with
// a confusing "unknown command 'init'" error after a 90-second dlx install.
// This floor lets us fail fast with an actionable message instead.
const MIN_PH_CLI_MAJOR = 6;

/**
 * Subset of `initArgs` the delegator actually inspects. Keeping this loose
 * lets `setup-globals` reuse the helper without an extra type import dance.
 */
export interface DelegateInitArgs {
  packageManager?: Agent;
  npm?: boolean;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
  tag?: string;
  version?: string;
  dev?: boolean;
  staging?: boolean;
  rc?: boolean;
  debug?: boolean;
}

/**
 * Resolves a concrete `@powerhousedao/ph-cli` version, verifies it's >= 6.x,
 * and shells out via the user's package manager (npx / pnpm dlx / etc.) to
 * run `ph-cli init`. Used by both `ph init` (forwards verbatim) and
 * `ph setup-globals` (forwards with `--name .ph` injected after chdir to ~).
 *
 * Does NOT call `process.exit`: callers are responsible for any post-init
 * fix-up + exit.
 */
export async function delegateInit(
  args: DelegateInitArgs,
  extraForwardedArgs: string[] = [],
): Promise<void> {
  const {
    fetchNpmVersionFromRegistryForTag,
    handleMutuallyExclusiveOptions,
    parsePackageManager,
    parseTag,
  } = await import("@powerhousedao/shared/clis");

  handleMutuallyExclusiveOptions(
    {
      tag: args.tag,
      version: args.version,
      dev: args.dev,
      staging: args.staging,
      rc: args.rc,
    },
    "versioning strategy",
  );

  handleMutuallyExclusiveOptions(
    {
      npm: args.npm,
      pnpm: args.pnpm,
      yarn: args.yarn,
      bun: args.bun,
      packageManager: args.packageManager,
    },
    "package manager",
  );

  const tag = parseTag(args);
  const phCliVersionOrTag = args.version ?? tag;
  const pm = parsePackageManager(args) ?? "npm";
  // `process.argv` here is `[node, ph-cmd-bin, <subcommand>, ...userArgs]`.
  // Forward everything from the user, prepending caller-supplied flags.
  const forwardedArgs = [...extraForwardedArgs, ...process.argv.slice(3)];

  // Resolve the tag to a concrete version up front and verify it's >= 6.x.
  // `--version` is user-supplied so we trust it and only resolve when a tag
  // (latest/staging/dev) is in play.
  let resolvedVersion = args.version;
  try {
    if (!resolvedVersion) {
      resolvedVersion = await fetchNpmVersionFromRegistryForTag(
        PH_CLI_PACKAGE,
        tag,
      );
    }
  } catch (err) {
    // Network/registry hiccup — fall through to the dlx so a flaky
    // connection doesn't block the user. The dlx will surface its own
    // error if the version genuinely can't be installed.
    if (args.debug) {
      console.error(">>> ph-cli version resolution skipped:", err);
    }
  }
  const { coerce } = await import("semver");
  const parsed = resolvedVersion ? coerce(resolvedVersion) : null;
  if (parsed && parsed.major < MIN_PH_CLI_MAJOR) {
    // Print + exit (rather than throw) to avoid the cli.ts catch handler
    // shipping this expected user-input error to Sentry.
    console.error(
      `${PH_CLI_PACKAGE}@${phCliVersionOrTag} resolves to ${resolvedVersion}, ` +
        `which doesn't support 'init' (requires >= ${MIN_PH_CLI_MAJOR}.0.0).\n` +
        `Try:  ph init --dev <args>   or   ph init --version <${MIN_PH_CLI_MAJOR}.x.x> <args>`,
    );
    process.exit(1);
  }

  const phCliPackage = `${PH_CLI_PACKAGE}@${resolvedVersion ?? phCliVersionOrTag}`;
  const { resolveCommand } = await import("package-manager-detector");
  const resolved = resolveCommand(pm, "execute", [
    phCliPackage,
    "init",
    ...forwardedArgs,
  ]);

  if (!resolved) {
    throw new Error(
      `Could not resolve execute command for package manager "${pm}".`,
    );
  }

  const { injectPnpmAllowBuilds } = await import("@powerhousedao/shared/clis");
  injectPnpmAllowBuilds(pm, resolved);

  const { command: cmd, args: cmdArgs } = resolved;
  const fullCmd = `${cmd} ${cmdArgs.join(" ")}`;

  if (args.debug) {
    console.log(">>> Delegating to ph-cli:", fullCmd);
  }

  try {
    execSync(fullCmd, { stdio: "inherit" });
  } catch (err) {
    // Propagate normal non-zero exits but throw on abnormal exits to ensure
    // the error is reported.
    const e = err as {
      status?: number | null;
      signal?: NodeJS.Signals | null;
    };
    if (typeof e.status === "number" && !e.signal) {
      process.exit(e.status);
    }
    throw err;
  }
}
