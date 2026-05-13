import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import {
  buildBoilerplatePackageJson,
  createOrUpdateManifest,
} from "file-builders";
import { join } from "path";
import {
  agentsTemplate,
  buildPowerhouseConfigTemplate,
  claudeSettingsLocalTemplate,
  claudeTemplate,
  connectEntrypointTemplate,
  cursorMcpTemplate,
  dockerfileTemplate,
  documentModelsIndexTemplate,
  documentModelsTemplate,
  editorsIndexTemplate,
  editorsTemplate,
  eslintConfigTemplate,
  factoryBuildersTemplate,
  geminiSettingsTemplate,
  indexHtmlTemplate,
  indexTsTemplate,
  licenseTemplate,
  mainTsxTemplate,
  mcpTemplate,
  nginxConfTemplate,
  npmrcTemplate,
  pnpmWorkspaceTemplate,
  processorsFactoryTemplate,
  processorsIndexTemplate,
  readmeTemplate,
  styleTemplate,
  subgraphsIndexTemplate,
  switchboardEntrypointTemplate,
  syncAndPublishWorkflowTemplate,
  tsConfigTemplate,
  upgradeManifestsTemplate,
  vitestConfigTemplate,
} from "templates";
import { formatSafe } from "utils";

export async function writeGeneratedProjectRootFiles(projectDir: string) {
  await writeFileEnsuringDir(
    join(projectDir, "tsconfig.json"),
    await formatSafe(tsConfigTemplate, "json"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "index.html"),
    await formatSafe(indexHtmlTemplate, "html"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "main.tsx"),
    await formatSafe(mainTsxTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "eslint.config.js"),
    await formatSafe(eslintConfigTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "index.ts"),
    await formatSafe(indexTsTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "style.css"),
    await formatSafe(styleTemplate, "css"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "vitest.config.ts"),
    await formatSafe(vitestConfigTemplate),
  );
}

export async function writeGeneratedDocumentModelsFiles(projectDir: string) {
  await writeFileEnsuringDir(
    join(projectDir, "document-models/document-models.ts"),
    await formatSafe(documentModelsTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "document-models/index.ts"),
    await formatSafe(documentModelsIndexTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "document-models/upgrade-manifests.ts"),
    await formatSafe(upgradeManifestsTemplate),
  );
}

export async function writeGeneratedEditorsFiles(projectDir: string) {
  await writeFileEnsuringDir(
    join(projectDir, "editors/editors.ts"),
    await formatSafe(editorsTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "editors/index.ts"),
    await formatSafe(editorsIndexTemplate),
  );
}

export async function writeGeneratedProcessorsFiles(projectDir: string) {
  await writeFileEnsuringDir(
    join(projectDir, "processors/factory.ts"),
    await formatSafe(processorsFactoryTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "processors/index.ts"),
    await formatSafe(processorsIndexTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "processors/connect.ts"),
    await formatSafe(factoryBuildersTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "processors/switchboard.ts"),
    await formatSafe(factoryBuildersTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "processors/index.ts"),
    await formatSafe(processorsIndexTemplate),
  );
}

export async function writeGeneratedSubgraphsFiles(projectDir: string) {
  await writeFileEnsuringDir(
    join(projectDir, "subgraphs/index.ts"),
    await formatSafe(subgraphsIndexTemplate),
  );
}

export async function writeModuleFiles(projectDir = process.cwd()) {
  await writeGeneratedDocumentModelsFiles(projectDir);
  await writeGeneratedEditorsFiles(projectDir);
  await writeGeneratedProcessorsFiles(projectDir);
  await writeGeneratedSubgraphsFiles(projectDir);
}

export async function writeAiConfigFiles(projectDir = process.cwd()) {
  await writeFileEnsuringDir(
    join(projectDir, "CLAUDE.md"),
    claudeTemplate.trimStart(),
  );
  await writeFileEnsuringDir(
    join(projectDir, "AGENTS.md"),
    agentsTemplate.trimStart(),
  );
  await writeFileEnsuringDir(
    join(projectDir, ".mcp.json"),
    mcpTemplate.trimStart(),
  );
  await writeFileEnsuringDir(
    join(projectDir, ".gemini/settings.json"),
    geminiSettingsTemplate.trimStart(),
  );
  await writeFileEnsuringDir(
    join(projectDir, ".cursor/mcp.json"),
    cursorMcpTemplate.trimStart(),
  );
  await writeFileEnsuringDir(
    join(projectDir, ".claude/settings.local.json"),
    claudeSettingsLocalTemplate.trimStart(),
  );
}

export async function writeProjectRootFiles(
  args: {
    name: string;
    tag?: string;
    version?: string;
    remoteDrive?: string;
    packageManager?: string;
  },
  projectDir = process.cwd(),
) {
  const { name, tag, version, remoteDrive, packageManager } = args;
  await writeFileEnsuringDir("LICENSE", licenseTemplate);
  await writeFileEnsuringDir("README.md", readmeTemplate);
  await writeFileEnsuringDir(".npmrc", npmrcTemplate);
  if (packageManager === "pnpm") {
    await writeFileEnsuringDir("pnpm-workspace.yaml", pnpmWorkspaceTemplate);
  }
  const packageJson = await buildBoilerplatePackageJson({
    name,
    tag,
    version,
  });
  await createOrUpdateManifest({ name }, projectDir);
  const powerhouseConfig = await buildPowerhouseConfigTemplate({
    tag,
    version,
    remoteDrive,
  });
  await writeFileEnsuringDir("powerhouse.config.json", powerhouseConfig);
  await writeFileEnsuringDir("package.json", packageJson);
}

export async function writeCIFiles(projectDir = process.cwd()) {
  await writeFileEnsuringDir(
    join(projectDir, ".github/workflows/sync-and-publish.yml"),
    syncAndPublishWorkflowTemplate,
  );
  await writeFileEnsuringDir(
    join(projectDir, "Dockerfile"),
    dockerfileTemplate,
  );
  await writeFileEnsuringDir(
    join(projectDir, "docker/nginx.conf"),
    nginxConfTemplate,
  );
  await writeFileEnsuringDir(
    join(projectDir, "docker/connect-entrypoint.sh"),
    connectEntrypointTemplate,
  );
  await writeFileEnsuringDir(
    join(projectDir, "docker/switchboard-entrypoint.sh"),
    switchboardEntrypointTemplate,
  );
}

export async function writeAllGeneratedProjectFiles(
  projectDir = process.cwd(),
) {
  await writeGeneratedProjectRootFiles(projectDir);
  await writeModuleFiles(projectDir);
  await writeAiConfigFiles(projectDir);
  await writeCIFiles(projectDir);
}
