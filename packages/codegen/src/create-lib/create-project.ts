import { buildBoilerplatePackageJson } from "@powerhousedao/codegen/file-builders";
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
  npmrcTemplate,
  powerhouseManifestTemplate,
  processorsIndexTemplate,
  readmeTemplate,
  styleTemplate,
  subgraphsIndexTemplate,
  tsConfigTemplate,
  viteConfigTemplate,
  vitestConfigTemplate,
} from "@powerhousedao/codegen/templates";
import { runPrettier } from "@powerhousedao/codegen/utils";
import chalk from "chalk";
import fs from "node:fs";
import path from "path";
import { runCmd, writeFileEnsuringDir } from "./utils.js";
type CreateProjectArgs = {
  name: string;
  packageManager: string;
  tag?: string;
  version?: string;
  remoteDrive?: string;
};
export async function createProject({
  name,
  packageManager,
  tag,
  version,
  remoteDrive,
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

    // Create a .gitignore file, then initialize the git repository
    console.log(chalk.blue(`▶️ Initializing git repository...\n`));
    await writeFileEnsuringDir(".gitignore", gitIgnoreTemplate);
    runCmd(`git init`);
    console.log(chalk.green(`\n✅ Git repository initialized\n`));

    // Write the boilerplate files for the project
    console.log(chalk.blue(`▶️ Creating project boilerplate files...\n`));
    await writeProjectRootFiles({ name, tag, version, remoteDrive });
    await writeModuleFiles();
    await writeAiConfigFiles();
    console.log(chalk.green(`✅ Project boilerplate files created\n`));

    // Install the project dependencies with the specified package manager
    console.log(
      chalk.blue(
        `▶️ Installing project dependencies with ${packageManager}...\n`,
      ),
    );
    runCmd(`${packageManager} install`);
    console.log(chalk.green(`\n✅ Project dependencies installed\n`));

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

async function writeProjectRootFiles(args: {
  name: string;
  tag?: string;
  version?: string;
  remoteDrive?: string;
}) {
  const { name, tag, version, remoteDrive } = args;
  await writeFileEnsuringDir("LICENSE", licenseTemplate);
  await writeFileEnsuringDir("README.md", readmeTemplate);
  await writeFileEnsuringDir(".npmrc", npmrcTemplate);
  const packageJson = await buildBoilerplatePackageJson({
    name,
    tag,
    version,
  });
  const powerhouseManifest = powerhouseManifestTemplate(name);
  await writeFileEnsuringDir("powerhouse.manifest.json", powerhouseManifest);
  const powerhouseConfig = await buildPowerhouseConfigTemplate({
    tag,
    version,
    remoteDrive,
  });
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
