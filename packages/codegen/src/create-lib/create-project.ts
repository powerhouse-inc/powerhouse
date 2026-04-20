import { runCmd, writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import chalk from "chalk";
import fs from "node:fs";
import path from "path";
import { gitIgnoreTemplate } from "templates";
import { runPrettier } from "utils";
import {
  writeAllGeneratedProjectFiles,
  writeProjectRootFiles,
} from "file-builders";
type CreateProjectArgs = {
  name: string;
  packageManager: string;
  tag?: string;
  version?: string;
  remoteDrive?: string;
  skipGitInit?: boolean;
  skipInstall?: boolean;
};
export async function createProject({
  name,
  packageManager,
  tag,
  version,
  remoteDrive,
  skipGitInit,
  skipInstall,
}: CreateProjectArgs) {
  const appPath = path.join(process.cwd(), name);

  try {
    fs.mkdirSync(appPath);
  } catch (err) {
    if ((err as { code: string }).code === "EEXIST") {
      console.error(
        `⛔ The folder "${name}" already exists in the current directory, please give it another name.`,
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  }

  try {
    // Create a new directory for the project
    console.log(chalk.blue(`▶️ Creating directory for project "${name}"...\n`));
    const appPath = path.join(process.cwd(), name);
    process.chdir(appPath);
    console.log(chalk.green(`✅ Project directory created\n`));

    await writeFileEnsuringDir(".gitignore", gitIgnoreTemplate);
    if (!skipGitInit) {
      // Create a .gitignore file, then initialize the git repository
      console.log(chalk.blue(`▶️ Initializing git repository...\n`));
      runCmd(`git init`);
      console.log(chalk.green(`\n✅ Git repository initialized\n`));
    }

    // Write the boilerplate files for the project
    console.log(chalk.blue(`▶️ Creating project boilerplate files...\n`));
    await writeProjectRootFiles({ name, tag, version, remoteDrive });
    await writeAllGeneratedProjectFiles();
    console.log(chalk.green(`✅ Project boilerplate files created\n`));

    if (!skipInstall) {
      // Install the project dependencies with the specified package manager
      console.log(
        chalk.blue(
          `▶️ Installing project dependencies with ${packageManager}...\n`,
        ),
      );
      runCmd(`${packageManager} install`);
      console.log(chalk.green(`\n✅ Project dependencies installed\n`));
    }

    // Use the installed version of `prettier` to format the generated code
    console.log(chalk.blue(`▶️ Formatting boilerplate project files...\n`));
    await runPrettier();
    console.log(chalk.green(`✅ Boilerplate files formatted\n`));

    // Project creation complete
    console.log(chalk.bold(`🎉 Successfully created project "${name}" 🎉\n`));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
