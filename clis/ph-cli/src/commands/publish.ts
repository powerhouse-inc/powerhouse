import { publishArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

function hasTagFlag(args: string[]): boolean {
  return args.some((a) => a === "--tag" || a.startsWith("--tag="));
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

async function readPrereleaseTag(projectPath: string): Promise<{
  version: string;
  tag: string;
} | null> {
  try {
    const [{ readPackageSync }, { prerelease }] = await Promise.all([
      import("read-pkg"),
      import("semver"),
    ]);
    const pkg = readPackageSync({ cwd: projectPath });
    if (!pkg.version) return null;
    const parts = prerelease(pkg.version);
    if (!parts || parts.length === 0) return null;
    const label = String(parts[0]);
    // semver may surface numeric-only prerelease ids (e.g. `1.0.0-0`);
    // npm requires an alphanumeric dist-tag, so skip those.
    if (!/^[a-z][a-z0-9-]*$/i.test(label)) return null;
    return { version: pkg.version, tag: label };
  } catch {
    return null;
  }
}

export const publish = command({
  name: "publish",
  description: `
Publish a package to the Powerhouse registry. This is a thin wrapper around npm publish
that automatically sets the registry URL.

This command:
0. With a release approval from ph build --release (experimental), checks that it matches
   the package and warns when it does not. --require-approval exits 1 instead; it forwards
   only --tag, --access, --otp, --dry-run, --provenance, --json and --loglevel to npm,
   refuses npm configuration in the environment that selects another package
   (npm_config_workspace, npm_config_workspaces, npm_config_include_workspace_root),
   and publishes with --ignore-scripts, so lifecycle scripts cannot change the checked files
1. Resolves the registry URL (--registry flag > PH_REGISTRY_URL env > powerhouse.config.json > default)
2. Checks authentication with the registry via npm whoami
3. Forwards all additional arguments to npm publish
  `,
  args: publishArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { getPowerhouseProjectInfo } =
      await import("@powerhousedao/shared/clis");
    const { projectPath } = await getPowerhouseProjectInfo();

    if (!projectPath) {
      throw new Error("Could not find project path.");
    }

    const { checkApprovalBeforePublish } =
      await import("../services/release/verify.js");
    if (args.requireApproval) {
      const {
        ALLOWED_NPM_ARGUMENTS,
        refusedNpmArguments,
        targetSelectingNpmEnvironment,
      } = await import("../services/release/npm-args.js");
      const refused = refusedNpmArguments(args.forwardedArgs);
      if (refused.length > 0) {
        console.error(
          `✘ ph publish --require-approval publishes only the package it checked, so it forwards only these npm arguments: ${ALLOWED_NPM_ARGUMENTS}. Not allowed: ${refused.join(" ")}`,
        );
        process.exit(1);
      }
      const selecting = targetSelectingNpmEnvironment(process.env);
      if (selecting.length > 0) {
        console.error(
          `✘ ph publish --require-approval publishes only the package it checked, but the environment sets npm configuration that selects another package: ${selecting.join(", ")}. Unset it and publish again.`,
        );
        process.exit(1);
      }
    }
    if (!checkApprovalBeforePublish(projectPath, args.requireApproval)) {
      process.exit(1);
    }

    const { checkNpmAuth, npmPublish, resolveRegistryUrl } =
      await import("@powerhousedao/shared/registry");
    const { mintRegistryAuthToken } =
      await import("../services/registry-auth.js");

    const registryUrl = resolveRegistryUrl({
      registry: args.registry,
      projectPath,
    });

    if (args.debug) {
      console.log(">>> registryUrl", registryUrl);
    }

    // Try Renown auth first: if the user is logged in via `ph login`, mint a
    // short-lived registry-bound bearer token. Falling back to the legacy
    // `npm adduser` (htpasswd) path keeps existing flows working until the
    // grace period ends.
    let authToken: string | undefined;
    try {
      authToken = await mintRegistryAuthToken(registryUrl, 5 * 60);
      if (args.debug) {
        console.error(`>>> minted renown token for ${registryUrl} (5m TTL)`);
      }
    } catch (err) {
      if (args.debug) {
        console.error(
          `>>> renown token mint skipped: ${(err as Error).message}`,
        );
      }
      try {
        await checkNpmAuth(registryUrl);
      } catch {
        console.error(`Not authenticated with registry: ${registryUrl}`);
        console.error(
          `Run: ph login (recommended) or npm adduser --registry ${registryUrl}`,
        );
        process.exit(1);
      }
    }

    let forwardedArgs = args.forwardedArgs;

    if (!hasTagFlag(forwardedArgs)) {
      const prereleaseInfo = await readPrereleaseTag(projectPath);
      if (prereleaseInfo) {
        const { version, tag } = prereleaseInfo;
        if (!isInteractive()) {
          console.error(
            `Detected prerelease version ${version}. npm requires an explicit dist-tag for prerelease publishes.`,
          );
          console.error(
            `Re-run with --tag <label> (e.g. --tag ${tag}) to proceed.`,
          );
          process.exit(1);
        }

        const enquirer = await import("enquirer");

        let confirmed: boolean;
        try {
          const answer = await enquirer.default.prompt<{ confirmed: boolean }>({
            type: "confirm",
            name: "confirmed",
            message: `Detected prerelease version ${version}. Publish with --tag ${tag}?`,
            initial: true,
          });
          confirmed = answer.confirmed;
        } catch {
          // user aborted the prompt (Ctrl-C); treat as decline
          confirmed = false;
        }

        if (!confirmed) {
          console.error(
            `Aborted. To publish manually: npm publish --registry ${registryUrl} --tag <label>`,
          );
          process.exit(1);
        }

        forwardedArgs = ["--tag", tag, ...forwardedArgs];
      }
    }

    if (args.debug) {
      console.log(
        ">>> command",
        `npm publish --registry ${registryUrl} ${forwardedArgs.join(" ")}`,
      );
    }

    if (args.requireApproval) {
      // The approval checked this package's files as they are: a prepack,
      // prepare or prepublishOnly script would change them after that check,
      // and an .npmrc `workspace` would publish another package, which npm
      // refuses alongside --workspaces=false.
      forwardedArgs = [
        ...forwardedArgs,
        "--ignore-scripts",
        "--workspaces=false",
      ];
      console.log(
        "Lifecycle scripts are skipped (--ignore-scripts) and workspaces are off (--workspaces=false), so npm publishes the files the approval matched.",
      );
    }

    console.log(`Publishing to ${registryUrl}...`);
    const result = await npmPublish({
      registryUrl,
      cwd: projectPath,
      args: forwardedArgs,
      authToken,
    });
    if (result.stdout) {
      console.log(result.stdout);
    }

    process.exit(0);
  },
});
