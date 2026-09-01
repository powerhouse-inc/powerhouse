import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { existsSync } from "node:fs";
import {
  buildBoilerplatePackageJson,
  createOrUpdateManifest,
} from "file-builders";
import { loadJsonFile } from "load-json-file";
import { join } from "path";
import { writeJsonFile } from "write-json-file";
import {
  agentsTemplate,
  buildCursorMcpTemplate,
  buildMcpTemplate,
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
  factoryBuildersTemplate,
  geminiSettingsTemplate,
  indexHtmlTemplate,
  indexTsTemplate,
  licenseTemplate,
  mainTsxTemplate,
  mcpTemplate,
  nginxConfTemplate,
  npmrcTemplate,
  oxfmtConfigTemplate,
  oxlintConfigTemplate,
  pnpmWorkspaceTemplate,
  processorsFactoryTemplate,
  processorsIndexTemplate,
  reactorTsTemplate,
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
    join(projectDir, ".oxlintrc.json"),
    await formatSafe(oxlintConfigTemplate, "json"),
  );
  await writeFileEnsuringDir(
    join(projectDir, ".oxfmtrc.json"),
    await formatSafe(oxfmtConfigTemplate, "json"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "index.ts"),
    await formatSafe(indexTsTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "reactor/index.ts"),
    await formatSafe(reactorTsTemplate),
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
  // Unused. Every write below is a relative path, so this function has always
  // written to `process.cwd()`; the parameter was only ever read by the
  // `applyProjectCustomizations` call that now runs in the caller. Kept in
  // position because this is exported API — dropping a positional parameter
  // would silently change the published signature.
  _projectDir = process.cwd(),
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
  const powerhouseConfig = await buildPowerhouseConfigTemplate({
    name,
    tag,
    version,
    remoteDrive,
  });
  await writeFileEnsuringDir("powerhouse.config.json", powerhouseConfig);
  await writeFileEnsuringDir("package.json", packageJson);
  // `applyProjectCustomizations` is deliberately NOT called here: it rewrites
  // `.mcp.json` / `.cursor/mcp.json`, which `writeAllGeneratedProjectFiles`
  // has not written yet. The caller runs it after both.
}

/**
 * Per-project customizations applied to a project directory — the parts
 * `ph init` derives from the project name. Shared by the fresh-scaffold path
 * ({@link writeProjectRootFiles}) and the `--template` clone path, so future
 * per-project customizations only need to be added here once.
 *
 * Assumes `package.json` already exists in `projectDir`.
 */
export async function applyProjectCustomizations(args: {
  name: string;
  projectDir: string;
  remoteDrive?: string;
}) {
  const { name, projectDir, remoteDrive } = args;
  // package.json: set the project name (deps and everything else preserved).
  const pkgPath = join(projectDir, "package.json");
  const pkg = (await loadJsonFile(pkgPath)) as Record<string, unknown>;
  pkg.name = name;
  await writeJsonFile(pkgPath, pkg, { indent: 2 });
  // powerhouse.manifest.json: set the project name.
  await createOrUpdateManifest({ name }, projectDir);
  // powerhouse.config.json: assign this project's dev-server ports, plus the
  // vetra remote-drive field. Written here as well as in
  // buildPowerhouseConfigTemplate because the `--clone` path inherits the
  // *source* project's config, and its ports would otherwise collide with it.
  const ports = deriveProjectPorts(name);
  const configPath = join(projectDir, "powerhouse.config.json");
  const config = (await loadJsonFile(configPath)) as Record<string, unknown>;
  config.studio = { ...(config.studio as object), port: ports.studioPort };
  config.reactor = {
    ...(config.reactor as object),
    port: ports.switchboardPort,
  };
  const vetra: Record<string, unknown> = {
    ...(config.vetra as object),
    connectPort: ports.vetraConnectPort,
  };
  if (remoteDrive) {
    vetra.driveId = remoteDrive.split("/").pop() ?? "";
    vetra.driveUrl = remoteDrive;
  }
  config.vetra = vetra;
  await writeJsonFile(configPath, config, { indent: 2 });

  // The MCP configs carry the switchboard port as a literal, because an MCP
  // client resolves them at session start and cannot read the project config.
  // Keep them in step with the port just assigned.
  const mcpFiles: [string, string][] = [
    [".mcp.json", buildMcpTemplate(ports.switchboardPort)],
    [
      join(".cursor", "mcp.json"),
      buildCursorMcpTemplate(ports.switchboardPort),
    ],
  ];
  for (const [rel, contents] of mcpFiles) {
    const target = join(projectDir, rel);
    if (!existsSync(target)) continue;
    await writeFileEnsuringDir(target, contents.trimStart());
  }
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
