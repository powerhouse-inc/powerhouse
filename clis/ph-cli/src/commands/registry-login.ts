import {
  getPowerhouseProjectInfo,
  registryLoginArgs,
} from "@powerhousedao/shared/clis";
import {
  resolveRegistryUrl,
  writeRegistryAuthToken,
} from "@powerhousedao/shared/registry";
import { command } from "cmd-ts";
import { mintRegistryAuthToken } from "../services/registry-auth.js";

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
  ph registry-login --registry https://registry.dev.vetra.io
  ph registry-login --expiry 7d
  `,
  args: registryLoginArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const projectInfo = await getPowerhouseProjectInfo().catch(() => null);
    const projectPath = projectInfo?.projectPath ?? process.cwd();

    const registryUrl = resolveRegistryUrl({
      registry: args.registry,
      projectPath,
    });

    const { parseExpiry, formatExpiry } = await import("@renown/sdk/node");
    const expiresIn = parseExpiry(args.expiry);

    const token = await mintRegistryAuthToken(registryUrl, expiresIn);
    const npmrcPath = await writeRegistryAuthToken(registryUrl, token);

    console.log(`Logged in to ${registryUrl}`);
    console.log(`  Token expires in: ${formatExpiry(expiresIn)}`);
    console.log(`  Wrote: ${npmrcPath}`);
    process.exit(0);
  },
});
