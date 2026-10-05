import type {
  CodeFirstDocumentModelTemplateArgs,
  CodeFirstGenerationResult,
  GenerateCodeFirstDocumentModelArgs,
} from "file-builders";
import { getCodeFirstDocumentModelVariableNames } from "name-builders";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  codeFirstDefinitionTemplate,
  codeFirstDocumentModelTestTemplate,
  codeFirstIndexTemplate,
  codeFirstItemsTestTemplate,
  codeFirstModulesTemplate,
  codeFirstUpgradeManifestTemplate,
  codeFirstUpgradesIndexTemplate,
  codeFirstVersionsTemplate,
  codeFirstVersionTemplate,
} from "templates";
import type { Project } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";
import { planDefinitionSourceRegistration } from "../definition-sources.js";
import { refreshDocumentModelAggregates } from "./document-model.js";

/**
 * Writes a code-first model's files, then registers it in
 * `definitionSources`, so a failed write leaves the config untouched. Rebuilds
 * the aggregates that export it in the project for the caller to save.
 * Refuses to overwrite any of the files.
 */
export async function tsMorphGenerateCodeFirstDocumentModel(
  args: GenerateCodeFirstDocumentModelArgs,
  project: Project,
): Promise<CodeFirstGenerationResult> {
  const v: CodeFirstDocumentModelTemplateArgs = {
    ...getCodeFirstDocumentModelVariableNames(args.name),
    ...args,
  };
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const projectDir = documentModelsDir.getParentOrThrow().getPath();
  const modelDir = `document-models/${v.kebabCaseDocumentType}`;
  const files = [
    [`${modelDir}/v1/definition.ts`, codeFirstDefinitionTemplate(v)],
    [`${modelDir}/v1/modules/items.ts`, codeFirstModulesTemplate(v)],
    [`${modelDir}/v1/index.ts`, codeFirstVersionTemplate(v)],
    [
      `${modelDir}/v1/tests/document-model.test.ts`,
      codeFirstDocumentModelTestTemplate(v),
    ],
    [`${modelDir}/v1/tests/items.test.ts`, codeFirstItemsTestTemplate(v)],
    [`${modelDir}/upgrades/versions.ts`, codeFirstVersionsTemplate()],
    [
      `${modelDir}/upgrades/upgrade-manifest.ts`,
      codeFirstUpgradeManifestTemplate(v),
    ],
    [`${modelDir}/upgrades/index.ts`, codeFirstUpgradesIndexTemplate(v)],
    [`${modelDir}/index.ts`, codeFirstIndexTemplate(v)],
  ] as const;

  const clashes = files
    .map(([path]) => path)
    .filter((path) => existsSync(join(projectDir, path)));
  if (clashes.length > 0) {
    throw new Error(
      `Refusing to overwrite ${clashes.join(", ")}. Delete the model directory, or choose another name.`,
    );
  }

  const { registration, commit } = await planDefinitionSourceRegistration(
    projectDir,
    { specifier: `./${modelDir}/index.ts` },
  );
  for (const [path, text] of files) {
    const { sourceFile } = getOrCreateSourceFile(
      project,
      join(projectDir, path),
    );
    sourceFile.replaceWithText(text);
    await formatSourceFileWithPrettier(sourceFile);
    await sourceFile.save();
  }
  await commit();
  await refreshDocumentModelAggregates(project);

  return { written: files.map(([path]) => path), registration };
}
