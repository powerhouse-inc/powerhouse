import { execSync } from "node:child_process";

export const installPackages = async (packages: string[]) => {
  for (const packageName of packages) {
    execSync(`ph install ${packageName}`);
  }
};

export const readManifest = () => {
  const manifest = execSync(`ph manifest`).toString();
  return manifest;
};

export async function loadDependency(
  packageName: string,
  subPath: string,
): Promise<unknown> {
  try {
    const fullPath = `${packageName}/${subPath}`;
    return await import(fullPath);
  } catch (e) {
    console.error("Error loading dependency", packageName, subPath, e);
    return null;
  }
}
