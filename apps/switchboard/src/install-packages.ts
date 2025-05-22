import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Define interface for package.json
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Get the list of packages to install from the environment variable
const pkgs = process.env.PH_PACKAGES?.split(",") || [];

// Skip if no packages to install
if (pkgs.length === 0 || (pkgs.length === 1 && pkgs[0] === "")) {
  process.exit(0);
}

try {
  // Read the package.json file to check existing dependencies
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(packageJsonContent) as PackageJson;

  // Get all installed dependencies
  const installedDependencies: Record<string, string> = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  for (const pkg of pkgs) {
    if (pkg === "") continue;

    // Check if the package is already installed
    if (installedDependencies[pkg]) {
      console.log(`> Package ${pkg} is already installed, skipping`);
      continue;
    }

    console.log(`> Installing ${pkg}`);
    execSync(`pnpm add ${pkg}@latest`, { stdio: "inherit" });
  }
} catch (error) {
  console.error("Error in package installation:", error);
  process.exit(1);
}
