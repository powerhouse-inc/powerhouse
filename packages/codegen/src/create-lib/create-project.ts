import type arg from "arg";
import enquirer from "enquirer";
import fs from "node:fs";
import path from "path";
import { runPrettier } from "../file-builders/boilerplate/utils.js";
import { buildBoilerplatePackageJson } from "../file-builders/index.js";
import { agentsTemplate } from "../templates/boilerplate/AGENTS.md.js";
import { claudeTemplate } from "../templates/boilerplate/CLAUDE.md.js";
import { claudeSettingsLocalTemplate } from "../templates/boilerplate/claude/settings.local.json.js";
import { cursorMcpTemplate } from "../templates/boilerplate/cursor/mcp.json.js";
import { documentModelsIndexTemplate } from "../templates/boilerplate/document-models/index.js";
import { editorsIndexTemplate } from "../templates/boilerplate/editors/index.js";
import { eslintConfigTemplate } from "../templates/boilerplate/eslint.config.js.js";
import { geminiSettingsTemplate } from "../templates/boilerplate/gemini/settings.json.js";
import { gitIgnoreTemplate } from "../templates/boilerplate/gitignore.js";
import { licenseTemplate } from "../templates/boilerplate/LICENSE.js";
import { mcpTemplate } from "../templates/boilerplate/mcp.json.js";
import { buildPowerhouseConfigTemplate } from "../templates/boilerplate/powerhouse.config.json.js";
import { powerhouseManifestTemplate } from "../templates/boilerplate/powerhouse.manifest.json.js";
import { processorsIndexTemplate } from "../templates/boilerplate/processors/index.js";
import { readmeTemplate } from "../templates/boilerplate/README.md.js";
import { styleTemplate } from "../templates/boilerplate/style.css.js";
import { subgraphsIndexTemplate } from "../templates/boilerplate/subgraphs/index.js";
import { viteConfigTemplate } from "../templates/boilerplate/vite.config.ts.js";
import { vitestConfigTemplate } from "../templates/boilerplate/vitest.config.ts.js";
import {
  documentModelsTemplate,
  editorsTemplate,
  indexTsTemplate,
  legacyIndexHtmlTemplate,
  tsConfigTemplate,
} from "../templates/index.js";
import { parseArgs } from "../utils/cli.js";
import { envPackageManager, runCmd, writeFileEnsuringDir } from "./utils.js";

const POWERHOUSE_ORG = "@powerhousedao";

// Special packages that don't use the @powerhousedao organization
const SPECIAL_PACKAGES = ["document-model", "document-drive", "@renown/sdk"];

// Packages to exclude from version resolution (external dependencies)
const EXCLUDED_PACKAGES = [
  "@powerhousedao/document-engineering",
  "@powerhousedao/scalars",
  "@powerhousedao/diff-analyzer",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-knex",
];

// Version tags that should be resolved to actual versions
const VERSION_TAGS = ["dev", "staging", "latest"];

/**
 * Checks if a version string is a tag that should be resolved
 */
function isVersionTag(version: string): boolean {
  return VERSION_TAGS.includes(version);
}

/**
 * Gets the installed version of a package from node_modules
 */
function getInstalledVersion(
  appPath: string,
  packageName: string,
): string | null {
  try {
    const packageJsonPath = path.join(
      appPath,
      "node_modules",
      packageName,
      "package.json",
    );
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
        version?: string;
      };
      return pkg.version ?? null;
    }
  } catch {
    // Ignore errors reading package.json
  }
  return null;
}

/**
 * Resolves version tags (dev, staging, latest) to actual installed versions in package.json
 */
function resolveVersionTags(appPath: string) {
  const packageJsonPath = path.join(appPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  let hasChanges = false;

  const processSection = (deps: Record<string, string> | undefined) => {
    if (!deps) return;

    for (const [pkg, version] of Object.entries(deps)) {
      // Check if this is a Powerhouse package
      const isPowerhouseOrg = pkg.startsWith(POWERHOUSE_ORG + "/");
      const isSpecialPackage = SPECIAL_PACKAGES.includes(pkg);
      const isExcluded = EXCLUDED_PACKAGES.includes(pkg);

      if ((isPowerhouseOrg || isSpecialPackage) && !isExcluded) {
        // Check if the version is a tag that should be resolved
        if (isVersionTag(version)) {
          const installedVersion = getInstalledVersion(appPath, pkg);
          if (installedVersion) {
            // Add ^ prefix to allow semver range updates with ph update
            deps[pkg] = `^${installedVersion}`;
            hasChanges = true;
            console.log(`  ${pkg}: ${version} → ^${installedVersion}`);
          }
        }
      }
    }
  };

  console.log("\x1b[34m", "Resolving version tags...", "\x1b[0m");
  processSection(packageJson.dependencies);
  processSection(packageJson.devDependencies);

  if (hasChanges) {
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
      "utf8",
    );
    console.log("\x1b[32m", "Version tags resolved successfully!", "\x1b[0m");
  } else {
    console.log("  No version tags to resolve");
  }
}

const BOILERPLATE_REPO =
  "https://github.com/powerhouse-inc/document-model-boilerplate.git";

const defaultDirectories = {
  documentModelsDir: "./document-models",
  editorsDir: "./editors",
};

export const createCommandSpec = {
  "--name": String,
  "--project-name": "--name",
  "--branch": String,
  "--tag": String,
  "--interactive": Boolean,
  "--dev": Boolean,
  "--staging": Boolean,
  "-p": "--name",
  "-b": "--branch",
  "-t": "--tag",
  "--package-manager": String,
} as const;

export interface ICreateProjectOptions {
  name: string | undefined;
  tag?: string;
  branch?: string;
  packageManager?: string;
  vetraDriveUrl?: string;
}

const { prompt } = enquirer;

export function parseTag(args: {
  tag?: string;
  dev?: boolean;
  staging?: boolean;
}) {
  if (args.tag) {
    return args.tag;
  }
  if (args.dev) {
    return "dev";
  } else if (args.staging) {
    return "staging";
  } else {
    return "";
  }
}

function parseTagArgs(args: arg.Result<typeof createCommandSpec>) {
  return parseTag({
    tag: args["--tag"],
    dev: args["--dev"],
    staging: args["--staging"],
  });
}

export function initCli() {
  const args = parseArgs(process.argv.slice(2), createCommandSpec);
  const options: ICreateProjectOptions = {
    name: args["--name"] ?? args._.shift(),
    tag: parseTagArgs(args),
    branch: args["--branch"],
  };
  return createProject(options);
}

export async function createProject(options: ICreateProjectOptions) {
  // checks if a project name was provided
  let projectName = options.name;
  if (!projectName) {
    const result = await prompt<{ projectName: string }>([
      {
        type: "input",
        name: "projectName",
        message: "What is the project name?",
        required: true,
        result: (value) => value.toLowerCase().trim().replace(/\s+/g, "-"),
      },
    ]);
    if (!result.projectName) {
      console.log("\x1b[31mYou must provide a name for your project.\x1b[0m");
      process.exit(1);
    }
    projectName = result.projectName;
  }

  const appPath = path.join(process.cwd(), projectName);

  try {
    fs.mkdirSync(appPath);
  } catch (err) {
    if ((err as { code: string }).code === "EEXIST") {
      console.log(
        `\x1b[31mThe folder "${projectName}" already exists in the current directory, please give it another name.\x1b[0m`,
      );
    } else {
      console.log(err);
    }
    process.exit(1);
  }

  await handleCreateProject(
    projectName,
    "document-models",
    "editors",
    options.tag,
    options.branch,
    options.packageManager,
    options.vetraDriveUrl,
  );
}

async function handleCreateProject(
  projectName: string,
  documentModelsDir: string,
  editorsDir: string,
  tag?: string,
  branch?: string,
  packageManager?: string,
  vetraDriveUrl?: string,
) {
  branch = branch ?? "main";
  packageManager = packageManager ?? envPackageManager;

  try {
    // Create a new directory for the project
    console.log(
      `\n\x1b[34mCreating directory for project "${projectName}"...\x1b[0m\n`,
    );
    const appPath = path.join(process.cwd(), projectName);
    process.chdir(appPath);
    console.log(`\x1b[32mProject directory created\x1b[0m\n`);

    // Create a .gitignore file, then initialize the git repository
    console.log(
      `\x1b[34mInitializing git repository with branch "${branch}"...\x1b[0m\n`,
    );
    await writeFileEnsuringDir(".gitignore", gitIgnoreTemplate);
    runCmd(`git init -b ${branch}`);
    console.log(`\n\x1b[32mGit repository initialized\x1b[0m\n`);

    // Write the boilerplate files for the project
    console.log(`\x1b[34mCreating project boilerplate files...\x1b[0m\n`);
    await writeProjectRootFiles(projectName, tag, vetraDriveUrl);
    await writeModuleFiles();
    await writeAiConfigFiles();
    console.log(`\x1b[32mProject boilerplate files created\x1b[0m\n`);

    // Install the project dependencies with the specified package manager
    console.log(
      `\x1b[34mInstalling project dependencies with ${packageManager}...\x1b[0m\n`,
    );
    runCmd(`${packageManager} install`);
    console.log(`\n\x1b[32mProject dependencies installed\x1b[0m\n`);

    // Use the installed version of `prettier` to format the generated code
    console.log(`\x1b[34mFormatting boilerplate project files...\x1b[0m\n`);
    await runPrettier();
    console.log(`\x1b[32mBoilerplate files formatted\x1b[0m\n`);

    // Project creation complete
    console.log(
      `\x1b[32m🎉 Successfully created project "${projectName}" 🎉\x1b[0m\n`,
    );
  } catch (error) {
    console.log(error);
  }
}

async function writeProjectRootFiles(
  projectName: string,
  tag: string | undefined,
  vetraDriveUrl: string | undefined,
) {
  await writeFileEnsuringDir("LICENSE", licenseTemplate);
  await writeFileEnsuringDir("README.md", readmeTemplate);
  const packageJson = await buildBoilerplatePackageJson({
    projectName,
    tag,
  });
  const powerhouseManifest = powerhouseManifestTemplate(projectName);
  await writeFileEnsuringDir("powerhouse.manifest.json", powerhouseManifest);
  const powerhouseConfig = await buildPowerhouseConfigTemplate(
    tag,
    vetraDriveUrl,
  );
  await writeFileEnsuringDir("powerhouse.config.json", powerhouseConfig);
  await writeFileEnsuringDir("package.json", packageJson);
  await writeFileEnsuringDir("tsconfig.json", tsConfigTemplate);
  await writeFileEnsuringDir("index.html", legacyIndexHtmlTemplate);
  await writeFileEnsuringDir("eslint.config.js", eslintConfigTemplate);
  await writeFileEnsuringDir("index.ts", indexTsTemplate);
  await writeFileEnsuringDir("style.css", styleTemplate);
  await writeFileEnsuringDir("vite.config.ts", viteConfigTemplate);
  await writeFileEnsuringDir("vitest.config.ts", vitestConfigTemplate);
}

async function writeModuleFiles() {
  await writeFileEnsuringDir(
    "document-models/document-models.ts",
    documentModelsTemplate,
  );
  await writeFileEnsuringDir(
    "document-models/index.ts",
    documentModelsIndexTemplate,
  );
  await writeFileEnsuringDir("editors/editors.ts", editorsTemplate);
  await writeFileEnsuringDir("editors/index.ts", editorsIndexTemplate);
  await writeFileEnsuringDir("processors/index.ts", processorsIndexTemplate);
  await writeFileEnsuringDir("subgraphs/index.ts", subgraphsIndexTemplate);
}

async function writeAiConfigFiles() {
  await writeFileEnsuringDir("CLAUDE.md", claudeTemplate);
  await writeFileEnsuringDir("AGENTS.md", agentsTemplate);
  await writeFileEnsuringDir(".mcp.json", mcpTemplate);
  await writeFileEnsuringDir(".gemini/settings.json", geminiSettingsTemplate);
  await writeFileEnsuringDir(".cursor/mcp.json", cursorMcpTemplate);
  await writeFileEnsuringDir(
    ".claude/settings.local.json",
    claudeSettingsLocalTemplate,
  );
}
