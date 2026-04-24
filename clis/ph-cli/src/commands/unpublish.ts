import {
  getPowerhouseProjectInfo,
  unpublishArgs,
} from "@powerhousedao/shared/clis";
import {
  checkNpmAuth,
  npmUnpublish,
  resolveRegistryUrl,
} from "@powerhousedao/shared/registry";
import { command } from "cmd-ts";
import { createInterface } from "node:readline/promises";
import { readPackageSync } from "read-pkg";

export const unpublish = command({
  name: "unpublish",
  description: `
Unpublish a package from the Powerhouse registry. This is a thin wrapper around
npm unpublish that automatically targets the Powerhouse registry and never
reaches npmjs.org.

Forms:
  ph unpublish                     # unpublish <name>@<version> from cwd's package.json
  ph unpublish <name>              # unpublish the whole package (all versions)
  ph unpublish <name>@<version>    # unpublish a single version

Flags:
  --registry <url>                 # override registry URL
  --yes, -y                        # skip the confirmation prompt
  `,
  args: unpublishArgs,
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

    const spec = resolveSpec(args.spec, projectPath);
    if (!spec) {
      console.error(
        "No package spec provided and could not read name/version from package.json.",
      );
      process.exit(1);
    }

    if (args.debug) {
      console.log(">>> registryUrl", registryUrl);
      console.log(">>> spec", spec);
    }

    try {
      await checkNpmAuth(registryUrl);
    } catch {
      console.error(`Not authenticated with registry: ${registryUrl}`);
      console.error(`Run: npm adduser --registry ${registryUrl}`);
      process.exit(1);
    }

    if (!args.yes) {
      const confirmed = await confirm(
        `Unpublish ${spec} from ${registryUrl}? [y/N] `,
      );
      if (!confirmed) {
        console.log("Aborted.");
        process.exit(0);
      }
    }

    if (args.debug) {
      console.log(
        ">>> command",
        `npm unpublish ${spec} --registry ${registryUrl} --force ${args.forwardedArgs.join(" ")}`,
      );
    }

    console.log(`Unpublishing ${spec} from ${registryUrl}...`);
    try {
      const result = await npmUnpublish({
        registryUrl,
        cwd: projectPath,
        spec,
        args: args.forwardedArgs,
      });
      if (result.stdout) {
        console.log(result.stdout);
      }
      process.exit(0);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  },
});

function resolveSpec(
  explicit: string | undefined,
  projectPath: string,
): string | null {
  if (explicit) return explicit;
  try {
    const pkg = readPackageSync({ cwd: projectPath });
    if (!pkg.name) return null;
    return pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
  } catch {
    return null;
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(prompt);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
