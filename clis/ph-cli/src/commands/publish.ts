import {
  getPowerhouseProjectInfo,
  publishArgs,
} from "@powerhousedao/shared/clis";
import {
  checkNpmAuth,
  npmPublish,
  resolveRegistryUrl,
} from "@powerhousedao/shared/registry";
import { command } from "cmd-ts";
import { readPackageSync } from "read-pkg";
import { prerelease } from "semver";

function hasTagFlag(args: string[]): boolean {
  return args.some((a) => a === "--tag" || a.startsWith("--tag="));
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

function readPrereleaseTag(projectPath: string): {
  version: string;
  tag: string;
} | null {
  try {
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
1. Resolves the registry URL (--registry flag > PH_REGISTRY_URL env > powerhouse.config.json > default)
2. Checks authentication with the registry via npm whoami
3. Forwards all additional arguments to npm publish
  `,
  args: publishArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { projectPath } = await getPowerhouseProjectInfo();

    if (!projectPath) {
      throw new Error("Could not find project path.");
    }

    const registryUrl = resolveRegistryUrl({
      registry: args.registry,
      projectPath,
    });

    if (args.debug) {
      console.log(">>> registryUrl", registryUrl);
    }

    try {
      await checkNpmAuth(registryUrl);
    } catch {
      console.error(`Not authenticated with registry: ${registryUrl}`);
      console.error(`Run: npm adduser --registry ${registryUrl}`);
      process.exit(1);
    }

    let forwardedArgs = args.forwardedArgs;

    if (!hasTagFlag(forwardedArgs)) {
      const prereleaseInfo = readPrereleaseTag(projectPath);
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
        let confirmed = false;
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

    console.log(`Publishing to ${registryUrl}...`);
    const result = await npmPublish({
      registryUrl,
      cwd: projectPath,
      args: forwardedArgs,
    });
    if (result.stdout) {
      console.log(result.stdout);
    }

    process.exit(0);
  },
});
