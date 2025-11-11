import path from "node:path";
import { runCmd } from "./utils.js";

/**
 * Clones a git repository and returns the path to the cloned project.
 * @param repositoryUrl - The URL of the git repository to clone
 * @returns The absolute path to the cloned project directory
 */
export function cloneRepository(repositoryUrl: string): string {
  try {
    console.log(
      "\x1b[33m",
      `Cloning repository from ${repositoryUrl}...`,
      "\x1b[0m",
    );
    runCmd(`git clone ${repositoryUrl}`);

    // Extract project name from repository URL
    // e.g., https://github.com/org/repo.git -> repo
    const repoName = repositoryUrl
      .split("/")
      .pop()
      ?.replace(/\.git$/, "");

    if (!repoName) {
      throw new Error("Could not determine project name from repository URL");
    }

    const projectPath = path.join(process.cwd(), repoName);
    return projectPath;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/**
 * Installs dependencies in a project directory using the specified package manager.
 * @param projectPath - The absolute path to the project directory
 * @param packageManager - The package manager to use (npm, pnpm, yarn, bun)
 */
export function installDependencies(
  projectPath: string,
  packageManager: string,
): void {
  try {
    process.chdir(projectPath);

    console.log(
      "\x1b[34m",
      `Installing dependencies with ${packageManager}...`,
      "\x1b[0m",
    );
    runCmd(`${packageManager} install --loglevel error`);

    console.log("\x1b[32m", "Dependencies installed successfully!", "\x1b[0m");
    console.log();
  } catch (error) {
    console.log(error);
    throw error;
  }
}
