import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "node:child_process";
import path from "path";
import { packageManagers } from "./constants.js";
import type { PackageJson, PackageManager } from "./types.js";

function parseDependencyString(dependency: string): {
  name: string;
  version: string;
} {
  // Handle scoped packages (e.g. @org/package@version)
  const lastAtIndex = dependency.lastIndexOf("@");
  if (lastAtIndex === 0) {
    // This is a scoped package without version
    return { name: dependency, version: "latest" };
  }

  const name = dependency.slice(0, lastAtIndex);
  const version = dependency.slice(lastAtIndex + 1);

  return {
    name,
    version: version || "latest",
  };
}

export function updateDependencyVersionString(
  packageManager: PackageManager,
  dependencies: string[],
  projectPath: string,
) {
  const manager = packageManagers[packageManager];

  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  ) as PackageJson;

  // Initialize dependencies and devDependencies if they don't exist
  packageJson.dependencies = packageJson.dependencies || {};
  packageJson.devDependencies = packageJson.devDependencies || {};

  // Process each dependency string
  for (const dependency of dependencies) {
    const { name, version } = parseDependencyString(dependency);

    // Check if the package exists in either dependencies or devDependencies
    if (name in packageJson.dependencies) {
      packageJson.dependencies[name] = version;
    } else if (name in packageJson.devDependencies) {
      packageJson.devDependencies[name] = version;
    }
  }

  // Write the updated package.json back to the file
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), "utf8");

  const installDepsCommand = manager.installDepsCommand;
  const commandOptions = { cwd: projectPath };

  execSync(installDepsCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
}

export function installDependency(
  packageManager: PackageManager,
  dependencies: string[],
  projectPath: string,
  workspace?: boolean,
) {
  if (!existsSync(projectPath)) {
    throw new Error(`Project path not found: ${projectPath}`);
  }

  const manager = packageManagers[packageManager];

  let installCommand = manager.installCommand.replace(
    "{{dependency}}",
    dependencies.join(" "),
  );

  if (workspace) {
    installCommand += ` ${manager.workspaceOption}`;
  }

  const commandOptions = { cwd: projectPath };

  execSync(installCommand, {
    stdio: "inherit",
    ...commandOptions,
  });
}
