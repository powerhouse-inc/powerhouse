import {
  getProjectInfo,
  getPackageManagerFromLockfile,
  forwardPHCommand,
} from "../utils.js";

type ForwardPHCommandOptions = {
  debug?: boolean;
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
    console.log("\n>>> forwardScriptCommand arguments:");
    console.log(">>> packageManager:", packageManager);
    console.log(">>> projectPath:", projectInfo.path);
    console.log(">>> args:", args);
    console.log(">>> isPackageScript:", true);
  }

  let packageScriptExecuted = false;

  try {
    forwardPHCommand(
      packageManager,
      projectInfo.path,
      args,
      true,
      options.debug,
    );

    packageScriptExecuted = true;
  } catch (error) {
    if (options.debug) {
      console.log(
        ">>> failed to forward command as package script, trying as ph command...",
        error,
      );
    }
  }

  if (options.debug) {
    console.log("\n>>> forwardCommand arguments:");
    console.log(">>> packageManager:", packageManager);
    console.log(">>> projectPath:", projectInfo.path);
    console.log(">>> args:", args);
    console.log(">>> isPackageScript:", false);
  }

  try {
    if (!packageScriptExecuted) {
      forwardPHCommand(
        packageManager,
        projectInfo.path,
        args,
        false,
        options.debug,
      );
    }
  } catch (error) {
    console.error("❌ Failed to forward command");
    throw error;
  }
};
