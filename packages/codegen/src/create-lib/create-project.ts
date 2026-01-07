import {
  buildBoilerplatePackageJson,
  runPrettier,
} from "@powerhousedao/codegen/file-builders";
import {
  agentsTemplate,
  buildPowerhouseConfigTemplate,
  claudeSettingsLocalTemplate,
  claudeTemplate,
  cursorMcpTemplate,
  documentModelsIndexTemplate,
  documentModelsTemplate,
  editorsIndexTemplate,
  editorsTemplate,
  eslintConfigTemplate,
  geminiSettingsTemplate,
  gitIgnoreTemplate,
  indexTsTemplate,
  legacyIndexHtmlTemplate,
  licenseTemplate,
  mcpTemplate,
  powerhouseManifestTemplate,
  processorsIndexTemplate,
  readmeTemplate,
  styleTemplate,
  subgraphsIndexTemplate,
  tsConfigTemplate,
  viteConfigTemplate,
  vitestConfigTemplate,
} from "@powerhousedao/codegen/templates";
import type arg from "arg";
import { paramCase } from "change-case";
import enquirer from "enquirer";
import fs from "node:fs";
import path from "path";
import { parseArgs } from "../utils/cli.js";
import { envPackageManager, runCmd, writeFileEnsuringDir } from "./utils.js";

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
        result: (value) => paramCase(value),
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
    options.tag,
    options.branch,
    options.packageManager,
    options.vetraDriveUrl,
  );
}

async function handleCreateProject(
  projectName: string,
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
