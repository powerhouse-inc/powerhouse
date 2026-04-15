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

    if (args.debug) {
      console.log(
        ">>> command",
        `npm publish --registry ${registryUrl} ${args.forwardedArgs.join(" ")}`,
      );
    }

    console.log(`Publishing to ${registryUrl}...`);
    const result = await npmPublish({
      registryUrl,
      cwd: projectPath,
      args: args.forwardedArgs,
    });
    if (result.stdout) {
      console.log(result.stdout);
    }

    process.exit(0);
  },
});
