import { readPackage } from "read-pkg";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "./utils/package-manager.js";

export async function getVersionInfo() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore build time version file
  const { version } = (await import("./version.js")) as { version: string };

  const phCliInfo = await getPhCliInfo();

  return `
-------------------------------------
PH CMD version: ${version}
${phCliInfo}
-------------------------------------
`.trim();
}

async function getPhCliInfo() {
  const projectInfo = await getProjectInfo(undefined, false);

  if (!projectInfo.available)
    return "PH CLI is not available, please run `ph setup-globals` to generate the default global project";

  const packageManager = getPackageManagerFromLockfile(projectInfo.path);

  const packageJson = await readPackage({ cwd: projectInfo.path });

  const phCliVersion =
    packageJson.dependencies?.["@powerhousedao/ph-cli"] ??
    packageJson.devDependencies?.["@powerhousedao/ph-cli"] ??
    "Not found";

  return `
PH CLI version: ${phCliVersion}
PH CLI path: ${projectInfo.path}
PH CLI is global project: ${projectInfo.isGlobal}
PH CLI package manager: ${packageManager}
`.trim();
}
