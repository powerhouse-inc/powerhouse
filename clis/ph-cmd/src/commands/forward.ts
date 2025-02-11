import {
  forwardPHCommand,
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "../utils.js";

type ForwardPHCommandOptions = {
  debug?: boolean;
  isPackageScript?: boolean;
};

type FSError = {
  code: string;
};

export const forwardCommand = (
  args: string,
  options: ForwardPHCommandOptions,
) => {
  if (options.debug) {
    console.log(">>> command arguments:", { options });
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo:", projectInfo);
  }

  const packageManager = getPackageManagerFromLockfile(projectInfo.path);

  if (options.debug) {
    console.log("\n>>> forwardCommand arguments:");
    console.log(">>> packageManager:", packageManager);
    console.log(">>> projectPath:", projectInfo.path);
    console.log(">>> args:", args);
    console.log(">>> isPackageScript:", options.isPackageScript ?? false);
  }

  try {
    forwardPHCommand(
      packageManager,
      projectInfo.path,
      args,
      options.isPackageScript ?? false,
      options.debug,
    );
  } catch (error) {
    console.error("❌ Failed to forward command");
    if ((error as FSError).code === "ENOENT") {
      console.error("Have you run `ph setup-globals` or `ph init`?");
    }

    throw error;
  }
};
