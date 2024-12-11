import arg from "arg";
import { execSync } from "child_process";
import enquirer from "enquirer";
import fs from "node:fs";
import path from "path";
import { configSpec, parseArgs, promptDirectories } from "../utils/cli";
import { getPackageManager } from "./command";
// eslint-disable-next-line
// @ts-ignore-error
import { DEFAULT_CONFIG } from "@powerhousedao/config/powerhouse";

const BOILERPLATE_REPO =
  "https://github.com/powerhouse-inc/document-model-boilerplate.git";

const packageManager = getPackageManager(process.env.npm_config_user_agent);
const isNpm = packageManager === "npm";

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
    `import * as documentModelsExports from '${documentModelsDir}';
        import * as editorsExports from '${editorsDir}';

        export const documentModels = Object.values(documentModelsExports);
        export const editors = Object.values(editorsExports);`,
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

export async function init(_args?: arg.Result<typeof configSpec>) {
  const args = _args || parseArgs(process.argv.slice(2), configSpec);

  // checks if a project name was provided
  let projectName = args._.shift();
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { documentModelsDir, editorsDir } = args["--interactive"]
    ? await promptDirectories()
    : DEFAULT_CONFIG;

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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  createProject(projectName, documentModelsDir, editorsDir);
}

function createProject(
  projectName: string,
  documentModelsDir: string,
  editorsDir: string,
) {
  try {
    console.log("\x1b[33m", "Downloading the project structure...", "\x1b[0m");
    runCmd(`git clone --depth 1 ${BOILERPLATE_REPO} ${projectName}`);

    const appPath = path.join(process.cwd(), projectName);
    process.chdir(appPath);

    console.log("\x1b[34m", "Installing dependencies...", "\x1b[0m");
    runCmd(`${packageManager} install`);

    fs.rmSync(path.join(appPath, "./.git"), { recursive: true });
    runCmd("git init");

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

    console.log("\x1b[34m", "You can start by typing:");
    console.log(`    cd ${projectName}`);
    console.log(
      isNpm ? "    npm run generate" : `    ${packageManager} generate`,
      "\x1b[0m",
    );
  } catch (error) {
    console.log(error);
  }
}
