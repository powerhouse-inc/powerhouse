import path from "node:path";
import { envPackageManager, runCmd } from "./utils.js";

export interface ICheckoutProjectOptions {
  repositoryUrl: string;
  packageManager?: string;
}

export function checkoutProject(options: ICheckoutProjectOptions): void {
  const { repositoryUrl, packageManager: userPackageManager } = options;
  const packageManager = userPackageManager ?? envPackageManager;

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
    process.chdir(projectPath);

    console.log(
      "\x1b[34m",
      `Installing dependencies with ${packageManager}...`,
      "\x1b[0m",
    );
    runCmd(`${packageManager} install --loglevel error`);

    console.log("\x1b[32m", "Checkout completed successfully!", "\x1b[0m");
    console.log();
  } catch (error) {
    console.log(error);
    throw error;
  }
}
