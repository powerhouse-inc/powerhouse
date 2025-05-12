import { parseArgs, promptDirectories } from "#utils/cli";
import { getPackageManager } from "#utils/package-manager";
import type arg from "arg";
import { execSync } from "child_process";
import enquirer from "enquirer";
import fs from "node:fs";
import path from "path";

const BOILERPLATE_REPO =
  "https://github.com/powerhouse-inc/document-model-boilerplate.git";

const envPackageManager = getPackageManager(process.env.npm_config_user_agent);

const defaultDirectories = {
  documentModelsDir: "./document-models",
  editorsDir: "./editors",
};

export const createCommandSpec = {
  "--name": String,
  "--project-name": "--name",
  "--version": String,
  "--interactive": Boolean,
  "--dev": Boolean,
  "--staging": Boolean,
  "-p": "--name",
  "-v": "--version",
  "--package-manager": String,
} as const;

export interface ICreateProjectOptions {
  name: string | undefined;
  version: string;
  interactive: boolean;
  packageManager?: string;
}

const { prompt } = enquirer;

function buildPackageJson(appPath: string, projectName: string) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(appPath, "package.json"), "utf-8"),
  ) as Record<string, any>;
  const newPackage = {
    ...packageJson,
    name: projectName,
    version: "1.0.0",
    description: "",
  };

  fs.writeFileSync(
    path.join(appPath, "package.json"),
    JSON.stringify(newPackage, null, 2),
    "utf8",
  );
}

function buildPowerhouseConfig(
  appPath: string,
  documentModelsDir: string,
  editorsDir: string,
) {
  const filePath = path.join(appPath, "powerhouse.config.json");
  const packageJson = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    any
  >;
  const newPackage = {
    ...packageJson,
    documentModelsDir,
    editorsDir,
  };

  fs.writeFileSync(filePath, JSON.stringify(newPackage, null, 2), "utf8");
}

function buildIndex(
  appPath: string,
  documentModelsDir: string,
  editorsDir: string,
) {
  fs.writeFileSync(
    path.join(appPath, "index.ts"),
    `import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };
import * as documentModelsExports from '${documentModelsDir}/index.js';
import * as editorsExports from '${editorsDir}/index.js';

export const manifest: Manifest = manifestJson;
export const documentModels = Object.values(documentModelsExports);
export const editors = Object.values(editorsExports);
`,
    "utf8",
  );
}

function runCmd(command: string) {
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.log("\x1b[31m", error, "\x1b[0m");
  }
}

export function parseVersion(args: {
  version?: string;
  dev?: boolean;
  staging?: boolean;
}) {
  if (args.version) {
    return args.version;
  }
  if (args.dev) {
    return "dev";
  } else if (args.staging) {
    return "staging";
  } else {
    return "main";
  }
}

function parseVersionArgs(args: arg.Result<typeof createCommandSpec>) {
  return parseVersion({
    version: args["--version"],
    dev: args["--dev"],
    staging: args["--staging"],
  });
}

export function initCli() {
  const args = parseArgs(process.argv.slice(2), createCommandSpec);
  const options: ICreateProjectOptions = {
    name: args["--name"] ?? args._.shift(),
    interactive: args["--interactive"] ?? false,
    version: parseVersionArgs(args),
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

  const {
    documentModelsDir,
    editorsDir,
  }: { documentModelsDir: string; editorsDir: string } = options.interactive
    ? await promptDirectories(defaultDirectories)
    : defaultDirectories;

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

  handleCreateProject(
    projectName,
    documentModelsDir,
    editorsDir,
    options.version,
    options.packageManager,
  );
}

function handleCreateProject(
  projectName: string,
  documentModelsDir: string,
  editorsDir: string,
  version = "main",
  packageManager?: string,
) {
  packageManager = packageManager ?? envPackageManager;

  try {
    console.log("\x1b[33m", "Downloading the project structure...", "\x1b[0m");
    runCmd(
      `git clone --depth 1 -b ${version} ${BOILERPLATE_REPO} ${projectName}`,
    );

    const appPath = path.join(process.cwd(), projectName);
    process.chdir(appPath);

    console.log(
      "\x1b[34m",
      `Installing dependencies with ${packageManager}...`,
      "\x1b[0m",
    );
    runCmd(`${packageManager} install --loglevel error`);

    fs.rmSync(path.join(appPath, "./.git"), { recursive: true });
    runCmd(`git init -b ${version}`);

    try {
      fs.mkdirSync(path.join(appPath, documentModelsDir));
      fs.writeFileSync(path.join(appPath, documentModelsDir, "index.ts"), "");
      fs.mkdirSync(path.join(appPath, editorsDir));
      fs.writeFileSync(path.join(appPath, editorsDir, "index.ts"), "");
    } catch (error) {
      if (!(error as Error).message.includes("EEXIST")) {
        throw error;
      }
    }
    buildPackageJson(appPath, projectName);
    buildPowerhouseConfig(appPath, documentModelsDir, editorsDir);
    buildIndex(appPath, documentModelsDir, editorsDir);

    console.log("\x1b[32m", "The installation is done!", "\x1b[0m");
    console.log();
  } catch (error) {
    console.log(error);
  }
}
