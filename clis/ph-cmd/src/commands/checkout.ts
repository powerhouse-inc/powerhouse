import { cloneRepository } from "@powerhousedao/codegen";
import {
  handleMutuallyExclusiveOptions,
  parsePackageManager,
} from "@powerhousedao/codegen/utils";
import { packageManagerArgs } from "@powerhousedao/common/cli-args";
import { command, option, optional, positional, string } from "cmd-ts";
import { getPackageManagerFromLockfile } from "../utils/package-manager.js";
import { runCmd } from "../utils/run-cmd.js";
import { getPackageDocument } from "../utils/validate-remote-drive-checkout.js";

export const checkout = command({
  name: "checkout",
  description: "Checkout an existing project from a remote drive",
  args: {
    remoteDrivePositional: positional({
      type: optional(string),
    }),
    remoteDriveOption: option({
      type: optional(string),
      long: "remote-drive",
      short: "r",
    }),
    ...packageManagerArgs,
  },
  handler: async ({
    remoteDrivePositional,
    remoteDriveOption,
    ...packageManagerArgs
  }) => {
    const remoteDrive = remoteDrivePositional ?? remoteDriveOption;
    if (!remoteDrive) {
      throw new Error("Please specify a remote drive URL to checkout from");
    }
    handleMutuallyExclusiveOptions(packageManagerArgs, "package managers");

    console.log("Checking out project from remote drive...");

    // Validate remote drive and get GitHub URL
    const packageDocument = await getPackageDocument(remoteDrive);

    if (!packageDocument.isValid) {
      console.error(packageDocument.error);
      process.exit(1);
    }

    if (!packageDocument.githubUrl) {
      throw new Error(
        "Project at remote drive URL does not have a GitHub URL.",
      );
    }

    // Clone repository
    const projectPath = cloneRepository(packageDocument.githubUrl);

    const parsedPackageManager = parsePackageManager(packageManagerArgs);

    const packageManager =
      parsedPackageManager ?? getPackageManagerFromLockfile(projectPath);

    process.chdir(projectPath);

    runCmd(`${packageManager} install`);

    console.log("Project checked out successfully");
  },
});
