import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import {
  getPowerhouseProjectInfo,
  publishArgs,
} from "@powerhousedao/shared/clis";
import { execSync } from "child_process";
import { command } from "cmd-ts";
import { join } from "path";

export const publish = command({
  name: "publish",
  description: `
Publish a package to the Powerhouse registry. This is a thin wrapper around npm publish
that automatically sets the registry URL.

This command:
1. Resolves the registry URL (--registry flag > powerhouse.config.json > PH_REGISTRY_URL env > default)
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

    // Resolve registry URL: flag > config > env > default
    const configPath = join(projectPath, "powerhouse.config.json");
    const config = getConfig(configPath);
    const registryUrl =
      args.registry ??
      config.packageRegistryUrl ??
      process.env.PH_REGISTRY_URL ??
      DEFAULT_REGISTRY_URL;

    if (args.debug) {
      console.log(">>> registryUrl", registryUrl);
    }

    // Check authentication
    try {
      execSync(`npm whoami --registry ${registryUrl}`, { stdio: "pipe" });
    } catch {
      console.error(`Not authenticated with registry: ${registryUrl}`);
      console.error(`Run: npm adduser --registry ${registryUrl}`);
      process.exit(1);
    }

    // Forward remaining args to npm publish
    const forwardedArgs = args.forwardedArgs;
    const cmd =
      `npm publish --registry ${registryUrl} ${forwardedArgs.join(" ")}`.trim();

    if (args.debug) {
      console.log(">>> command", cmd);
    }

    console.log(`Publishing to ${registryUrl}...`);
    execSync(cmd, { stdio: "inherit", cwd: projectPath });

    process.exit(0);
  },
});
