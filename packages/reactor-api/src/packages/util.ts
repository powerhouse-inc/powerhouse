import { childLogger } from "document-drive";
import { execSync } from "node:child_process";

const logger = childLogger(["reactor-api", "packages/util"]);

export const installPackages = async (packages: string[]) => {
  for (const packageName of packages) {
    execSync(`ph install ${packageName}`);
  }
};

export const readManifest = () => {
  const manifest = execSync(`ph manifest`).toString();
  return manifest;
};

/**
 * Tries to import a dependency from a package. This function cannot throw.
 */
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
    if (
      e instanceof Error &&
      "code" in e &&
      !["ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_MODULE_NOT_FOUND"].includes(
        e.code as string,
      )
    ) {
      logger.debug(e);
    }
    return null;
  }
}
