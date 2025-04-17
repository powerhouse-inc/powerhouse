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

    // vite does not support this, but that's okay as we have provided the
    // vite-loader for this purpose
    return await import(/* @vite-ignore */ fullPath);
  } catch (e) {
    return null;
  }
}
