import {
  fetchNpmVersionFromRegistryForTag,
  handleMutuallyExclusiveOptions,
  initArgs,
  parsePackageManager,
  parseTag,
} from "@powerhousedao/shared/clis";
import { command } from "cmd-ts";
import { execSync } from "node:child_process";
import { resolveCommand } from "package-manager-detector";
import { coerce } from "semver";

const PH_CLI_PACKAGE = "@powerhousedao/ph-cli";
// `init` was added to ph-cli in the 6.x rewrite. Older versions (still on
// the `latest` tag at time of writing) shell out via commander and bail with
// a confusing "unknown command 'init'" error after a 90-second dlx install.
// This floor lets us fail fast with an actionable message instead.
const MIN_PH_CLI_MAJOR = 6;

/**
 * Delegates `ph init` to the appropriate version of `@powerhousedao/ph-cli`.
 * This ensures the init logic (boilerplate, codegen) always matches the
 * ph-cli version being installed in the new project.
 */
export const init = command({
  name: "init",
  description: "Initialize a new project",
  args: initArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log({ args });
    }

    handleMutuallyExclusiveOptions(
      {
        tag: args.tag,
        version: args.version,
        dev: args.dev,
        staging: args.staging,
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
    const forwardedArgs = process.argv.slice(3);

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

    const { command: cmd, args: cmdArgs } = resolved;
    const fullCmd = `${cmd} ${cmdArgs.join(" ")}`;

    if (args.debug) {
      console.log(">>> Delegating to ph-cli:", fullCmd);
    }

    execSync(fullCmd, { stdio: "inherit" });
    process.exit(0);
  },
});
