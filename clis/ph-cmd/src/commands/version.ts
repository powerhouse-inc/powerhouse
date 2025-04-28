import { type Command } from "commander";
import {
  forwardPHCommand,
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "../utils/index.js";
import { version } from "../version.js";
// Custom version handler
export const customVersionHandler = async () => {
  const projectInfo = await getProjectInfo(undefined, false);

  console.log("PH CMD version: ", version);

  if (projectInfo.available) {
    const packageManager = getPackageManagerFromLockfile(projectInfo.path);

    const versionOutput = forwardPHCommand(
      packageManager,
      projectInfo.path,
      "--version",
      false,
      true,
    );

    const cleanedOutput = versionOutput.replace(/\n/g, "");

    console.log("PH CLI version: ", cleanedOutput);
    console.log("-------------------------------------");
    console.log("PH CLI path: ", projectInfo.path);
    console.log("PH CLI isGlobalProject: ", projectInfo.isGlobal);
    console.log("PH CLI packageManager: ", packageManager);
  } else {
    console.log("-------------------------------------");
    console.log(
      "PH CLI is not available, please run `ph init` to generate the default global project",
    );
  }
};

export function versionOption(program: Command): Command {
  return program.option(
    "-v, --version",
    "Display version information",
    customVersionHandler,
  );
}
