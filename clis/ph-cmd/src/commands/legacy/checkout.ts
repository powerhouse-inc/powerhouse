import { cloneRepository, installDependencies } from "@powerhousedao/codegen";
import type { Command } from "commander";
import { checkoutHelp } from "../../help.js";
import type { CommandActionType } from "../../types.js";
import { withCustomHelp } from "../../utils/help.js";
import { getPackageManagerFromLockfile } from "../../utils/package-manager.js";
import { getPackageDocument } from "../../utils/validate-remote-drive-checkout.js";

export type CheckoutOptions = {
  remoteDrive: string;
  packageManager?: string;
};

export const checkout: CommandActionType<[CheckoutOptions]> = async (
  options,
) => {
  console.log("Checking out project from remote drive...");

  try {
    // Validate remote drive and get GitHub URL
    const packageDocument = await getPackageDocument(options.remoteDrive);

    if (!packageDocument.isValid) {
      console.error(packageDocument.error);
      process.exit(1);
    }

    // Clone repository
    const projectPath = cloneRepository(packageDocument.githubUrl!);

    // Detect package manager from lock files or use user-provided one
    const detectedPackageManager = getPackageManagerFromLockfile(projectPath);
    const packageManager = options.packageManager ?? detectedPackageManager;

    // Install dependencies
    installDependencies(projectPath, packageManager);

    console.log("\x1b[32m", "Checkout completed successfully!", "\x1b[0m");
  } catch (error) {
    console.error(
      "Failed to checkout the project",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
};

export function checkoutCommand(program: Command): Command {
  const checkoutCmd = program
    .command("checkout")
    .description("Checkout an existing project from a remote drive")
    .requiredOption(
      "-r, --remote-drive <remoteDrive>",
      "Remote drive identifier",
    )
    .option("--package-manager <packageManager>", "Package manager to use");

  return withCustomHelp<[CheckoutOptions]>(checkoutCmd, checkout, checkoutHelp);
}
