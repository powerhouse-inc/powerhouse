import path from "node:path";
import { readPackage } from "read-pkg";
import { fileExists } from "./file-exists.js";
import { getPowerhouseProjectInfo } from "./projects.js";

import { execFileSync } from "node:child_process";
import fs from "node:fs";

function which(bin: string): string | undefined {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(cmd, [bin], { encoding: "utf8" }).trim();
    return out.split(/\r?\n/)[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function findUpPackageJson(start: string): string | undefined {
  console.log({ start });
  let dir =
    fs.existsSync(start) && fs.statSync(start).isDirectory()
      ? start
      : path.dirname(start);

  console.log({ dir });

  while (true) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function getPackageJsonForBin(binName: string) {
  const binPath = which(binName);
  console.log({ binPath });
  if (!binPath) return undefined;

  const realBin = fs.realpathSync.native?.(binPath) ?? fs.realpathSync(binPath);

  const pkgJsonPath = findUpPackageJson(realBin);
  if (!pkgJsonPath) return undefined;

  const result = path.dirname(pkgJsonPath);
  return result;
}

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
  const { projectPath, packageManager, isGlobal } =
    await getPowerhouseProjectInfo();
  const projectPackageJsonPath = path.join(projectPath, "package.json");
  const projectPackageJsonExists = await fileExists(projectPackageJsonPath);
  if (!projectPackageJsonExists) {
    return `
  No Powerhouse project directory found.
  To create a local project, run \`ph init\`.
  To create a global project, run \`ph setup-globals\`.
`.trim();
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
