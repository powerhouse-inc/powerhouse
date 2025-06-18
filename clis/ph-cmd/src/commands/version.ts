import { type Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "../utils/index.js";
import { version } from "../version.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Custom version handler
export const customVersionHandler = async () => {
  const projectInfo = await getProjectInfo(undefined, false);

  console.log("PH CMD version: ", version);

  if (projectInfo.available) {
    const packageManager = getPackageManagerFromLockfile(projectInfo.path);

    try {
      const packageJsonPath = path.join(projectInfo.path, "package.json");
      const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent) as PackageJson;

      const phCliVersion =
        packageJson.dependencies?.["@powerhousedao/ph-cli"] ||
        packageJson.devDependencies?.["@powerhousedao/ph-cli"];

      if (phCliVersion) {
        console.log("PH CLI version: ", phCliVersion);
      }
    } catch (err) {
      console.log(
        "Error reading PH CLI version from package.json:",
        (err as Error).message,
      );
    }

    console.log("-------------------------------------");
    console.log("PH CLI path: ", projectInfo.path);
    console.log("PH CLI isGlobalProject: ", projectInfo.isGlobal);
    console.log("PH CLI packageManager: ", packageManager);
  } else {
    console.log("-------------------------------------");
    console.log(
      "PH CLI is not available, please run `ph setup-globals` to generate the default global project",
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

export function versionArgument(program: Command): Command {
  return program.argument(
    "version",
    "Display version information",
    customVersionHandler,
  );
}
