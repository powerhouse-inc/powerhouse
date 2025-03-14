const packageManagers = ["npm", "yarn", "pnpm", "bun"] as const;
const defaultPackageManager = "npm";

export type PackageManager = (typeof packageManagers)[number];

export function getPackageManager(userAgent?: string): PackageManager {
  if (!userAgent) {
    return defaultPackageManager;
  }

  const pkgSpec = userAgent.split(" ")[0];
  const pkgSpecArr = pkgSpec.split("/");
  const name = pkgSpecArr[0];

  if (packageManagers.includes(name as PackageManager)) {
    return name as PackageManager;
  } else {
    return defaultPackageManager;
  }
}
