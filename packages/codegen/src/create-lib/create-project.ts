import type arg from "arg";
import enquirer from "enquirer";
import fs from "node:fs";
import path from "path";
import { buildBoilerplatePackageJson } from "../file-builders/index.js";
import { parseArgs } from "../utils/cli.js";
import { envPackageManager, runCmd } from "./utils.js";

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

function buildPowerhouseConfig(
  appPath: string,
  documentModelsDir: string,
  editorsDir: string,
  vetraDriveUrl?: string,
) {
  const filePath = path.join(appPath, "powerhouse.config.json");
  const packageJson = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    any
  >;
  const newPackage: Record<string, any> = {
    ...packageJson,
    documentModelsDir,
    editorsDir,
  };

  // Add vetra configuration if vetraDriveUrl is provided
  if (vetraDriveUrl) {
    const driveId = vetraDriveUrl.split("/").pop();
    newPackage.vetra = {
      driveId: driveId ?? "",
      driveUrl: vetraDriveUrl,
    };
  }

  fs.writeFileSync(filePath, JSON.stringify(newPackage, null, 2), "utf8");
}

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
    return "main";
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
      console.log("\x1b[31m", "You have to provide name to your app.");
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
        "\x1b[31m",
        `The folder ${projectName} already exists in the current directory, please give it another name.`,
        "\x1b[0m",
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
    console.log("\x1b[33m", "Downloading the project structure...", "\x1b[0m");
    runCmd(
      `git clone --depth 1 -b ${branch} ${BOILERPLATE_REPO} ${projectName}`,
    );

    const appPath = path.join(process.cwd(), projectName);
    process.chdir(appPath);

    fs.rmSync(path.join(appPath, "./.git"), { recursive: true });
    runCmd(`git init -b ${branch}`);

    fs.rmSync("package.json");
    const packageJson = await buildBoilerplatePackageJson({
      projectName,
      tag,
    });

    fs.writeFileSync("package.json", packageJson, { encoding: "utf-8" });

    console.log(
      "\x1b[34m",
      `Installing dependencies with ${packageManager}...`,
      "\x1b[0m",
    );
    runCmd(`${packageManager} install --loglevel error`);

    buildPowerhouseConfig(
      appPath,
      documentModelsDir,
      editorsDir,
      vetraDriveUrl,
    );

    console.log("\x1b[32m", "The installation is done!", "\x1b[0m");
    console.log();
  } catch (error) {
    console.log(error);
  }
}
