import { checkoutProject } from "@powerhousedao/codegen";
import type { Command } from "commander";
import { checkoutHelp } from "../help.js";
import type { CommandActionType } from "../types.js";
import { withCustomHelp } from "../utils/index.js";
import { getPackageDocument } from "../utils/validate-remote-drive-checkout.js";

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

    // Clone repository and install dependencies
    checkoutProject({
      repositoryUrl: packageDocument.githubUrl!,
      packageManager: options.packageManager,
    });
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
