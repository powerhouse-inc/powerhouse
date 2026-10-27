import { installAddedDependencies as install } from "@powerhousedao/codegen";
import { boolean, flag, optional } from "cmd-ts";

export const skipInstallArgs = {
  skipInstall: flag({
    type: optional(boolean),
    long: "skip-install",
    description:
      "Don't install the dependencies the command adds to package.json",
  }),
};

// Installs what a generate command just added to package.json. A failed
// install doesn't fail the command: the files are written, so say what to run.
export async function installAddedDependencies(
  added: readonly string[],
  projectDir: string,
  skipInstall?: boolean,
) {
  await install(added, projectDir, { skipInstall });
}
