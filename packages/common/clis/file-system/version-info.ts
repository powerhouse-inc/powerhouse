import path from "node:path";
import { readPackage } from "read-pkg";
import { fileExists } from "./file-exists.js";
import { getPowerhouseProjectInfo } from "./projects.js";

export async function getPhCmdVersionInfo(phCmdVersion: string) {
  const phCliVersionInfo = await getPhCliVersionInfo();

  return `
-------------------------------------
PH CMD version: ${phCmdVersion}
${phCliVersionInfo}
-------------------------------------
`.trim();
}

export async function getPhCliVersionInfo() {
  const noProjectWarningMessage = `
  No Powerhouse project directory found.
  To create a local project, run \`ph init\`.
  To create a global project, run \`ph setup-globals\`.
`.trim();
  const { projectPath, packageManager, isGlobal } =
    await getPowerhouseProjectInfo();
  if (!projectPath) {
    return noProjectWarningMessage;
  }
  const projectPackageJsonPath = path.join(projectPath, "package.json");
  const projectPackageJsonExists = await fileExists(projectPackageJsonPath);
  if (!projectPackageJsonExists) {
    return noProjectWarningMessage;
  }
  const projectPackageJson = await readPackage({ cwd: projectPath });
  const phCliVersion =
    projectPackageJson.dependencies?.["@powerhousedao/ph-cli"] ??
    projectPackageJson.devDependencies?.["@powerhousedao/ph-cli"];
  if (!phCliVersion) {
    return `
  \`ph-cli\` is not installed.
  For a local project, run \`${packageManager} install @powerhousedao/ph-cli\`. 
  For a global project, run \`ph setup-globals\`.
  `.trim();
  }
  return `
PH CLI version: ${phCliVersion}
PH CLI path: ${projectPath}
PH CLI is global project: ${isGlobal}
PH CLI package manager: ${packageManager}
  `.trim();
}
