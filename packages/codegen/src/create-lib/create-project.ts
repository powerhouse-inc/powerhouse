import { runCmd, writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import chalk from "chalk";
import fs from "node:fs";
import path from "path";
import { gitIgnoreTemplate } from "templates";
import { runPrettier } from "utils";
import {
  applyProjectCustomizations,
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
  /**
   * Path to an existing scaffolded project to clone instead of generating +
   * resolving deps from scratch. The template's source + pnpm-lock.yaml are
   * copied (node_modules is not — it's rebuilt from the lockfile via the warm
   * pnpm store with `pnpm install --frozen-lockfile --offline`). Requires
   * packageManager === "pnpm".
   */
  template?: string;
};
export async function createProject({
  name,
  packageManager,
  tag,
  version,
  remoteDrive,
  skipGitInit,
  skipInstall,
  template,
}: CreateProjectArgs) {
  const appPath = path.join(process.cwd(), name);

  if (fs.existsSync(appPath)) {
    console.error(
      `⛔ The folder "${name}" already exists in the current directory, please give it another name.`,
    );
    process.exit(1);
  }

  try {
    if (template) {
      await createProjectFromTemplate({
        name,
        appPath,
        template,
        packageManager,
        skipGitInit,
        skipInstall,
        remoteDrive,
      });
      return;
    }

    // Create a new directory for the project
    console.log(chalk.blue(`▶️ Creating directory for project "${name}"...\n`));
    fs.mkdirSync(appPath);
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
    await writeProjectRootFiles({
      name,
      tag,
      version,
      remoteDrive,
      packageManager,
    });
    await writeAllGeneratedProjectFiles();
    console.log(chalk.green(`✅ Project boilerplate files created\n`));

    if (!skipInstall) {
      // Install the project dependencies with the specified package manager
      console.log(
        chalk.blue(
          `▶️ Installing project dependencies with ${packageManager}...\n`,
        ),
      );
      const extra =
        packageManager === "pnpm" ? " --config.minimum-release-age=0" : "";
      runCmd(`${packageManager} install${extra}`);
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

/**
 * Fast path for `ph init --template <path>`: copy an already-scaffolded
 * project's source + lockfile (NOT node_modules), re-apply the per-project
 * customizations, then rebuild node_modules with
 * `pnpm install --frozen-lockfile --offline`. pnpm materializes the tree from
 * the warm store via clone/hardlink — far faster and ~0 extra disk vs a fresh
 * resolve+install, and the lockfile guarantees an identical dependency set.
 * Requires the template's packages to be present in the local pnpm store
 * (which is the case in an image where the template was scaffolded at build).
 */
async function createProjectFromTemplate(args: {
  name: string;
  appPath: string;
  template: string;
  packageManager: string;
  skipGitInit?: boolean;
  skipInstall?: boolean;
  remoteDrive?: string;
}) {
  const {
    name,
    appPath,
    template,
    packageManager,
    skipGitInit,
    skipInstall,
    remoteDrive,
  } = args;
  // The template path materializes deps from the template's pnpm-lock.yaml via
  // `pnpm install --frozen-lockfile --offline`. Other package managers have no
  // equivalent offline-from-pnpm-lockfile mode, so require pnpm explicitly
  // instead of silently switching.
  if (packageManager !== "pnpm") {
    console.error(
      `⛔ --template requires --pnpm (got "${packageManager}"). The fast path materializes deps from the template's pnpm-lock.yaml.`,
    );
    process.exit(1);
  }
  const templatePath = path.resolve(process.cwd(), template);
  if (
    !fs.existsSync(templatePath) ||
    !fs.statSync(templatePath).isDirectory()
  ) {
    console.error(
      `⛔ Template "${template}" not found (resolved to "${templatePath}"). Pass a path to an existing scaffolded project.`,
    );
    process.exit(1);
  }
  if (!fs.existsSync(path.join(templatePath, "pnpm-lock.yaml"))) {
    console.error(
      `⛔ Template "${template}" has no pnpm-lock.yaml. --template requires a pnpm project scaffolded with a committed lockfile.`,
    );
    process.exit(1);
  }

  // Copy source + lockfile only; node_modules is rebuilt from the store below,
  // and the template's .git is irrelevant (we re-init fresh).
  console.log(
    chalk.blue(`▶️ Creating project from template "${template}"...\n`),
  );
  fs.cpSync(templatePath, appPath, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      // Skip deps (rebuilt from the lockfile), git history (re-init'd), and
      // build artifacts (regenerated) so the new project starts clean.
      return (
        base !== "node_modules" &&
        base !== ".git" &&
        base !== "dist" &&
        !base.endsWith(".tsbuildinfo")
      );
    },
  });
  console.log(chalk.green(`✅ Template files copied\n`));

  if (!skipGitInit) {
    console.log(chalk.blue(`▶️ Initializing git repository...\n`));
    runCmd(`git init`, { cwd: appPath });
    console.log(chalk.green(`\n✅ Git repository initialized\n`));
  }

  console.log(chalk.blue(`▶️ Applying project customizations...\n`));
  await applyProjectCustomizations({ name, projectDir: appPath, remoteDrive });
  console.log(chalk.green(`✅ Project customizations applied\n`));

  if (!skipInstall) {
    // Rebuild node_modules from the lockfile, offline, via the warm store.
    console.log(
      chalk.blue(`▶️ Installing dependencies from lockfile (offline)...\n`),
    );
    runCmd(`pnpm install --frozen-lockfile --offline`, { cwd: appPath });
    console.log(chalk.green(`\n✅ Dependencies installed from lockfile\n`));
  }

  console.log(
    chalk.bold(`🎉 Successfully created project "${name}" from template 🎉\n`),
  );
}
