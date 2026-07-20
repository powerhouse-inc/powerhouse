import { registryLoginArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const registryLogin = command({
  name: "registry-login",
  description: `
Log in to a Powerhouse registry using your Renown identity. Mints a longer-lived
bearer token (default 30 days) bound to the registry's audience and writes the
token into ~/.npmrc so raw 'npm publish' / 'npm install' work without further
setup.

Prerequisites:
  Run 'ph login' first to establish a Renown identity.

Usage:
  ph registry-login                          # uses powerhouse.config.json / PH_REGISTRY_URL
  ph registry-login --registry https://registry.vetra.io
  ph registry-login --expiry 7d
  `,
  args: registryLoginArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { getPowerhouseProjectInfo } =
      await import("@powerhousedao/shared/clis");
    const projectInfo = await getPowerhouseProjectInfo().catch(() => null);
    const projectPath = projectInfo?.projectPath ?? process.cwd();

    const [
      { resolveRegistryUrl, writeRegistryAuthToken },
      { mintRegistryAuthToken },
      { parseExpiry, formatExpiry },
    ] = await Promise.all([
      import("@powerhousedao/shared/registry"),
      import("../services/registry-auth.js"),
      import("@renown/sdk/node"),
    ]);

    const registryUrl = resolveRegistryUrl({
      registry: args.registry,
      projectPath,
    });

    const expiresIn = parseExpiry(args.expiry);

    const token = await mintRegistryAuthToken(registryUrl, expiresIn);
    const npmrcPath = await writeRegistryAuthToken(registryUrl, token);

    console.log(`Logged in to ${registryUrl}`);
    console.log(`  Token expires in: ${formatExpiry(expiresIn)}`);
    console.log(`  Wrote: ${npmrcPath}`);
    process.exit(0);
  },
});
