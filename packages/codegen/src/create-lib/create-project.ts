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

// Install recipes for `--clone`. Only managers with a cache-miss-fails
// offline mode are listed; yarn needs an opt-in offline mirror and bun has
// no real offline mode (https://github.com/oven-sh/bun/issues/7956).
type CloneRecipe = { lockfile: string; install: string };
const CLONE_RECIPES: Record<string, CloneRecipe | undefined> = {
  pnpm: {
    lockfile: "pnpm-lock.yaml",
    install: "pnpm install --frozen-lockfile --offline",
  },
  npm: {
    lockfile: "package-lock.json",
    install: "npm ci --offline",
  },
};

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
   * resolving deps from scratch. The clone's source + pnpm-lock.yaml are
   * copied (node_modules is not — it's rebuilt from the lockfile via the warm
   * pnpm store with `pnpm install --frozen-lockfile --offline`). Requires
   * packageManager === "pnpm".
   */
  clone?: string;
};
export async function createProject({
  name,
  packageManager,
  tag,
  version,
  remoteDrive,
  skipGitInit,
  skipInstall,
  clone,
}: CreateProjectArgs) {
  const appPath = path.join(process.cwd(), name);

  if (fs.existsSync(appPath)) {
    throw new Error(
      `⛔ The folder "${name}" already exists in the current directory, please give it another name.`,
    );
  }

  if (clone) {
    await createProjectFromClone({
      name,
      appPath,
      clone,
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
}

/**
 * Fast path for `ph init --clone <path>`: copy an already-scaffolded project's
 * source + lockfile (NOT node_modules), re-apply the per-project
 * customizations, then rebuild node_modules with
 * `pnpm install --frozen-lockfile --offline`. pnpm materializes the tree from
 * the warm store via clone/hardlink — far faster and ~0 extra disk vs a fresh
 * resolve+install, and the lockfile guarantees an identical dependency set.
 * Requires the cloned project's packages to be present in the local pnpm
 * store (which is the case in an image where the source was scaffolded at
 * build).
 */
async function createProjectFromClone(args: {
  name: string;
  appPath: string;
  clone: string;
  packageManager: string;
  skipGitInit?: boolean;
  skipInstall?: boolean;
  remoteDrive?: string;
}) {
  const {
    name,
    appPath,
    clone,
    packageManager,
    skipGitInit,
    skipInstall,
    remoteDrive,
  } = args;
  // --clone needs a package manager with a hard-offline install mode that
  // refuses to hit the network on a cache miss. pnpm and npm qualify; yarn
  // and bun do not (bun has no offline flag at all — cache misses silently
  // re-fetch).
  const recipe = CLONE_RECIPES[packageManager];
  if (!recipe) {
    throw new Error(
      `⛔ --clone is only compatible with --pnpm or --npm (got "${packageManager}").`,
    );
  }
  const clonePath = path.resolve(process.cwd(), clone);
  if (!fs.existsSync(clonePath) || !fs.statSync(clonePath).isDirectory()) {
    throw new Error(
      `⛔ Clone source "${clone}" not found (resolved to "${clonePath}"). Pass a path to an existing scaffolded project.`,
    );
  }
  if (!fs.existsSync(path.join(clonePath, recipe.lockfile))) {
    throw new Error(
      `⛔ Clone source "${clone}" has no ${recipe.lockfile}. --clone with --${packageManager} requires a committed lockfile.`,
    );
  }

  // Copy source + lockfile only; node_modules is rebuilt from the store below,
  // and the source's .git is irrelevant (we re-init fresh).
  console.log(chalk.blue(`▶️ Cloning project from "${clone}"...\n`));
  fs.cpSync(clonePath, appPath, {
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
  console.log(chalk.green(`✅ Project files cloned\n`));

  if (!skipGitInit) {
    console.log(chalk.blue(`▶️ Initializing git repository...\n`));
    runCmd(`git init`, { cwd: appPath });
    console.log(chalk.green(`\n✅ Git repository initialized\n`));
  }

  console.log(chalk.blue(`▶️ Applying project customizations...\n`));
  await applyProjectCustomizations({ name, projectDir: appPath, remoteDrive });
  console.log(chalk.green(`✅ Project customizations applied\n`));

  if (!skipInstall) {
    // Rebuild node_modules from the lockfile, offline, via the warm cache.
    console.log(
      chalk.blue(`▶️ Installing dependencies from lockfile (offline)...\n`),
    );
    runCmd(recipe.install, { cwd: appPath });
    console.log(chalk.green(`\n✅ Dependencies installed from lockfile\n`));
  }

  console.log(
    chalk.bold(`🎉 Successfully cloned project "${name}" from "${clone}" 🎉\n`),
  );
}
