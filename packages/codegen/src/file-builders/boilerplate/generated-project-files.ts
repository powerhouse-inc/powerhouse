import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { existsSync, readFileSync } from "node:fs";
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

/** True when a file carries nothing beyond comments and whitespace — i.e. it
 * is still the bare "auto-generated" banner a module aggregate is seeded with,
 * before codegen (or a hand) added any export to it. */
function hasOnlyComments(filePath: string): boolean {
  const contents = readFileSync(filePath, "utf-8");
  return (
    contents
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .trim() === ""
  );
}

/** Seeds a module aggregate file ("auto-generated and updated by codegen").
 *
 * These files accumulate content after scaffolding — the ts-morph generators
 * append module exports to them, and users occasionally add entries by hand.
 * Writing the pristine template over an existing one therefore destroys
 * registrations: `ph migrate` used to reset `subgraphs/index.ts` to the bare
 * banner, which silently unregistered every subgraph until (and unless) the
 * `generateAll` later in the migration happened to rediscover them, and
 * dropped hand-written entries outright. So the template is written only when
 * the file is missing or still contains nothing but the banner.
 */
async function seedModuleAggregateFile(filePath: string, contents: string) {
  if (existsSync(filePath) && !hasOnlyComments(filePath)) return;
  await writeFileEnsuringDir(filePath, contents);
}

export async function writeGeneratedDocumentModelsFiles(projectDir: string) {
  await seedModuleAggregateFile(
    join(projectDir, "document-models/document-models.ts"),
    await formatSafe(documentModelsTemplate),
  );
  await seedModuleAggregateFile(
    join(projectDir, "document-models/index.ts"),
    await formatSafe(documentModelsIndexTemplate),
  );
  await seedModuleAggregateFile(
    join(projectDir, "document-models/upgrade-manifests.ts"),
    await formatSafe(upgradeManifestsTemplate),
  );
}

export async function writeGeneratedEditorsFiles(projectDir: string) {
  await seedModuleAggregateFile(
    join(projectDir, "editors/editors.ts"),
    await formatSafe(editorsTemplate),
  );
  await seedModuleAggregateFile(
    join(projectDir, "editors/index.ts"),
    await formatSafe(editorsIndexTemplate),
  );
}

export async function writeGeneratedProcessorsFiles(projectDir: string) {
  // factory.ts and index.ts are static, fully codegen-owned templates: they
  // accumulate nothing, so overwriting refreshes them to the current shape.
  await writeFileEnsuringDir(
    join(projectDir, "processors/factory.ts"),
    await formatSafe(processorsFactoryTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "processors/index.ts"),
    await formatSafe(processorsIndexTemplate),
  );
  // connect.ts and switchboard.ts accumulate processor factory builders.
  await seedModuleAggregateFile(
    join(projectDir, "processors/connect.ts"),
    await formatSafe(factoryBuildersTemplate),
  );
  await seedModuleAggregateFile(
    join(projectDir, "processors/switchboard.ts"),
    await formatSafe(factoryBuildersTemplate),
  );
}

export async function writeGeneratedSubgraphsFiles(projectDir: string) {
  await seedModuleAggregateFile(
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

/** Seeds an AI-assistant / editor config file only when it does not exist.
 *
 * Deliberately stricter than {@link seedModuleAggregateFile}: a module
 * aggregate's content is codegen-owned and a pristine one is detectably
 * banner-only, but an AI config is the user's the moment it exists — there is
 * no content that marks it "still ours". So no content sniffing: existence
 * alone preserves the file. `ph init` writes into a directory it just created
 * (createProject refuses an existing one), so on a fresh scaffold this seeds
 * every file; on `ph migrate` it writes only the ones the project lacks.
 */
async function seedUserOwnedFile(filePath: string, contents: string) {
  if (existsSync(filePath)) return;
  await writeFileEnsuringDir(filePath, contents);
}

export async function writeAiConfigFiles(projectDir = process.cwd()) {
  // All six files are preserve-on-migrate; none is refresh. Per-file rationale:
  //
  // CLAUDE.md / AGENTS.md: project instructions for coding agents — prose the
  // user extends by hand; nothing in the toolchain regenerates them.
  await seedUserOwnedFile(
    join(projectDir, "CLAUDE.md"),
    claudeTemplate.trimStart(),
  );
  await seedUserOwnedFile(
    join(projectDir, "AGENTS.md"),
    agentsTemplate.trimStart(),
  );
  // .mcp.json / .cursor/mcp.json: committed files carrying the project's
  // name-derived switchboard port as a literal (applyProjectCustomizations
  // bakes it in at init; the static templates here carry only the default
  // port, so overwriting on migrate also reset that port). The one tool that
  // does manage them afterwards — `ph vetra` via syncMcpPort — patches the
  // port in place precisely so hand-added servers and keys survive.
  await seedUserOwnedFile(
    join(projectDir, ".mcp.json"),
    mcpTemplate.trimStart(),
  );
  await seedUserOwnedFile(
    join(projectDir, ".cursor/mcp.json"),
    cursorMcpTemplate.trimStart(),
  );
  // .gemini/settings.json: the user's Gemini CLI settings; nothing in the
  // toolchain writes it after scaffolding.
  await seedUserOwnedFile(
    join(projectDir, ".gemini/settings.json"),
    geminiSettingsTemplate.trimStart(),
  );
  // .claude/settings.local.json: per-machine state — Claude Code itself
  // appends the permission grants the user approves during sessions, so an
  // existing one holds accumulated approvals no template can reproduce.
  await seedUserOwnedFile(
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
