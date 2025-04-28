import {
  forwardPHCommand,
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "../utils/index.js";

type ForwardPHCommandOptions = {
  debug?: boolean;
  logOutput?: boolean;
};

type FSError = {
  code: string;
};

export const forwardCommand = async (
  args: string,
  options: ForwardPHCommandOptions,
) => {
  const isHelpCommand =
    args.includes("help") || args.includes("--help") || args.includes("-h");

  if (options.debug) {
    console.log(">>> command arguments:", { options });
  }

  const projectInfo = await getProjectInfo(options.debug, !isHelpCommand);

  if (options.debug) {
    console.log("\n>>> projectInfo:", projectInfo);
  }

  const packageManager = getPackageManagerFromLockfile(projectInfo.path);

  if (options.debug) {
    console.log("\n>>> forwardCommand arguments:");
    console.log(">>> packageManager:", packageManager);
    console.log(">>> projectPath:", projectInfo.path);
    console.log(">>> args:", args);
  }

  try {
    if (isHelpCommand || options.logOutput) {
      // For help commands, capture the output and print it
      const helpOutput = forwardPHCommand(
        packageManager,
        projectInfo.path,
        args,
        options.debug,
        true,
      );
      console.log(helpOutput);
    } else {
      // For non-help commands, use standard behavior
      forwardPHCommand(packageManager, projectInfo.path, args, options.debug);
    }
  } catch (error) {
    console.error("❌ Failed to forward command");
    if ((error as FSError).code === "ENOENT") {
      console.error("Have you run `ph setup-globals` or `ph init`?");
    }
    if (options.debug) {
      throw error;
    }
  }
};
