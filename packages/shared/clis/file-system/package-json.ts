import { readPackage } from "read-pkg";

export async function getPackageNameFromPackageJson() {
  const packageJson = await readPackage();
  return packageJson.name;
}
