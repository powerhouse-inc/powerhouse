import {
  handleMutuallyExclusiveOptions,
  initArgs,
  parsePackageManager,
  parseTag,
} from "@powerhousedao/shared/clis";
import { command } from "cmd-ts";
import { execSync } from "node:child_process";
import { resolveCommand } from "package-manager-detector";

/**
 * Delegates `ph init` to the appropriate version of `@powerhousedao/ph-cli`.
 * This ensures the init logic (boilerplate, codegen) always matches the
 * ph-cli version being installed in the new project.
 */
export const init = command({
  name: "init",
  description: "Initialize a new project",
  args: initArgs,
  handler: (args) => {
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

    const phCliVersion = args.version ?? parseTag(args);
    const pm = parsePackageManager(args) ?? "npm";

    // Forward original args as-is to ph-cli
    const forwardedArgs = process.argv.slice(3);
    const phCliPackage = `@powerhousedao/ph-cli@${phCliVersion}`;
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
