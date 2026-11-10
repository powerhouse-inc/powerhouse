import { camelCase, capitalCase, kebabCase, pascalCase } from "change-case";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  rmdirSync,
  readdirSync,
} from "node:fs";
import { ManifestSchema } from "@powerhousedao/shared/document-model";
import { join, relative, dirname } from "node:path";
import { uniqueBy } from "remeda";
import type { Project } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
  projectPath,
} from "utils";
import {
  codeFirstDefinitionTemplate,
  codeFirstDocumentModelTestTemplate,
  codeFirstIndexTemplate,
  codeFirstItemsModuleTemplate,
  codeFirstItemsTestTemplate,
  codeFirstUpgradesTemplate,
  codeFirstVersionTemplate,
  type CodeFirstDocumentModelTemplateArgs,
} from "../../templates/code-first/document-model.js";
import { createOrUpdateManifest } from "../manifest.js";
import { writeDocumentModelAggregates } from "./aggregates.js";
import { loadDocumentModelInventory } from "./document-model-inventory.js";

/** @experimental */
export type GenerateCodeFirstDocumentModelArgs = {
  readonly name: string;

  readonly documentType: string;
  readonly author: { readonly name: string; readonly website: string | null };
};

/** @experimental */
export type CodeFirstGenerationResult = {
  readonly written: readonly string[];
};

export function codeFirstDocumentModelTemplateArgs({
  name,
  documentType,
  author,
}: GenerateCodeFirstDocumentModelArgs): CodeFirstDocumentModelTemplateArgs {
  const pascalName = pascalCase(name);
  if (!/^[A-Za-z]\w*$/.test(pascalName)) {
    throw new Error(
      `"${name}" cannot name a document model: it must start with a letter.`,
    );
  }
  return {
    displayName: capitalCase(name),
    pascalName,
    camelName: camelCase(name),
    kebabName: kebabCase(name),
    documentType,
    author,
  };
}

/**
 * Writes a code-first model into `documentModelsDir`, where discovery finds
 * it, then rebuilds the barrels and adds it to the manifest. Every file is
 * restored when a step fails.
 */
export async function generateCodeFirstDocumentModel(
  args: GenerateCodeFirstDocumentModelArgs,
  project: Project,
  documentModelsDir: string,
): Promise<CodeFirstGenerationResult> {
  const v = codeFirstDocumentModelTemplateArgs(args);
  const projectDir = projectPath(project, ".");
  const modelDir = `${relative(projectDir, documentModelsDir).replaceAll("\\", "/")}/${v.kebabName}`;
  const files = [
    [`${modelDir}/v1/definition.ts`, codeFirstDefinitionTemplate(v)],
    [`${modelDir}/v1/modules/items.ts`, codeFirstItemsModuleTemplate(v)],
    [`${modelDir}/v1/index.ts`, codeFirstVersionTemplate(v)],
    [
      `${modelDir}/v1/tests/document-model.test.ts`,
      codeFirstDocumentModelTestTemplate(v),
    ],
    [`${modelDir}/v1/tests/items.test.ts`, codeFirstItemsTestTemplate(v)],
    [`${modelDir}/upgrades/index.ts`, codeFirstUpgradesTemplate(v)],
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
  const manifestPath = join(projectDir, "powerhouse.manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = ManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    if (manifest.documentModels?.some(({ id }) => id === args.documentType)) {
      throw new Error(
        `Document type ${args.documentType} is already registered in ${manifestPath}.`,
      );
    }
  }
  const paths = [
    ...files.map(([path]) => join(projectDir, path)),
    ...["index.ts", "document-models.ts", "upgrade-manifests.ts"].map((name) =>
      join(projectDir, "document-models", name),
    ),
    manifestPath,
  ];
  const snapshots = paths.map((path) => ({
    path,
    disk: existsSync(path) ? readFileSync(path) : undefined,
    memory: project.getSourceFile(path)?.getFullText(),
  }));
  const newDirectories = new Set<string>();
  for (const path of paths) {
    for (
      let dir = dirname(path);
      dir !== projectDir && !existsSync(dir);
      dir = dirname(dir)
    )
      newDirectories.add(dir);
  }
  let aggregates: Awaited<ReturnType<typeof writeDocumentModelAggregates>>;
  try {
    for (const [path, text] of files) {
      const { sourceFile } = getOrCreateSourceFile(
        project,
        join(projectDir, path),
      );
      sourceFile.replaceWithText(text);
      await formatSourceFileWithPrettier(sourceFile);
      await sourceFile.save();
    }
    const inventory = await loadDocumentModelInventory(projectDir);
    aggregates = await writeDocumentModelAggregates(project, inventory);
    for (const sourceFile of aggregates) await sourceFile.save();
    await createOrUpdateManifest(
      {
        documentModels: uniqueBy(
          inventory.documentModels.map(({ documentType, name }) => ({
            id: documentType,
            name,
          })),
          ({ id }) => id,
        ),
      },
      projectDir,
    );
  } catch (cause) {
    for (const { path, disk, memory } of snapshots) {
      project.getSourceFile(path)?.forget();
      if (disk === undefined) rmSync(path, { force: true });
      else writeFileSync(path, disk);
      if (memory !== undefined)
        project.createSourceFile(path, memory, { overwrite: true });
    }
    for (const dir of [...newDirectories].sort((a, b) => b.length - a.length)) {
      if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
    }
    throw cause;
  }

  return {
    written: [
      ...files.map(([path]) => path),
      ...aggregates.map((sourceFile) =>
        relative(projectDir, sourceFile.getFilePath()).replaceAll("\\", "/"),
      ),
      "powerhouse.manifest.json",
    ],
  };
}
