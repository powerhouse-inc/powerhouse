import { kebabCase } from "change-case";
import { realPathThroughExistingParent } from "@powerhousedao/shared/clis/real-paths";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { firstBy, isTruthy, prop, uniqueBy } from "remeda";
import type { Project } from "ts-morph";
import { codeFirstDeclarationFiles } from "document-model/tooling";
import { getEditorDirNames, getEditorMetadata, projectPath } from "utils";
import { generateCodeFirstDocumentEditor } from "../file-builders/code-first-editor.js";
import {
  assertDocumentModelAggregatesWritable,
  writeDocumentModelAggregates,
} from "../file-builders/document-model/aggregates.js";
import {
  loadDocumentModelInventory,
  type DocumentModelInventory,
} from "../file-builders/document-model/document-model-inventory.js";
import {
  codeFirstDocumentModelTemplateArgs,
  generateCodeFirstDocumentModel,
} from "../file-builders/document-model/code-first-model.js";
import {
  createOrUpdateManifest,
  pruneManifestSection,
} from "../file-builders/manifest.js";
import { syncProjectAiToolsExport } from "../file-builders/project-index.js";
import {
  generateAllApps,
  generateAllPieces,
  generateAllProcessors,
} from "./generate.js";
import { generateAllSubgraphs } from "./subgraph-generation.js";
import type {
  ModelGenerationSource,
  PlannedDocumentModel,
  PlannedModelExport,
} from "./model-generation-source.js";
import type {
  GenerateEditorRequest,
  GeneratedDocumentModels,
  GeneratedEditors,
  ModelGeneration,
} from "./model-generation.js";
import { schemaFirstModelSource } from "./schema-first/model-generation.js";

async function inventoryOf(project: Project) {
  const projectDir = projectPath(project, ".");
  const inventory = await loadDocumentModelInventory(projectDir);
  assertDocumentModelAggregatesWritable(project, projectDir);
  return inventory;
}

async function finalizeModels(
  project: Project,
  inventory: DocumentModelInventory,
) {
  await writeDocumentModelAggregates(project, inventory);
  const documentModels = uniqueBy(
    inventory.documentModels.map(({ documentType, name }) => ({
      id: documentType,
      name,
    })),
    prop("id"),
  );
  if (documentModels.length > 0) {
    await createOrUpdateManifest({ documentModels }, inventory.projectDir);
  }
}

/** What the discovered code-first sources own, each mapped to one source. */
type CodeFirstOwnership = {
  readonly projectDir: string;
  readonly documentTypes: ReadonlyMap<string, string>;
  readonly exportNames: ReadonlyMap<string, string>;
  readonly files: ReadonlyMap<string, string>;
};

function ownershipOf(inventory: DocumentModelInventory): CodeFirstOwnership {
  const { projectDir, documentModels, upgradeManifests } = inventory;
  return {
    projectDir,
    documentTypes: new Map(
      [...documentModels, ...upgradeManifests].map(
        ({ documentType, source }) => [documentType, source.specifier],
      ),
    ),
    exportNames: new Map(
      documentModels.map(({ aggregateExportName, source }) => [
        aggregateExportName,
        source.specifier,
      ]),
    ),
    files: new Map(
      [...inventory.sourceFiles].map(([file, specifier]) => [
        realPathThroughExistingParent(file),
        specifier,
      ]),
    ),
  };
}

function sourceInside(directory: string, owner: CodeFirstOwnership) {
  const root = `${realPathThroughExistingParent(directory)}${sep}`;
  for (const [file, specifier] of owner.files) {
    if (file.startsWith(root))
      return {
        file: relative(
          realPathThroughExistingParent(owner.projectDir),
          file,
        ).replaceAll("\\", "/"),
        source: specifier,
      };
  }
  return undefined;
}

function conflictsOf(
  { label, id, directory, exportNames }: PlannedDocumentModel,
  owner: CodeFirstOwnership,
): string[] {
  const sameType = owner.documentTypes.get(id);
  const inside = sourceInside(directory, owner);
  const shown = relative(owner.projectDir, directory).replaceAll("\\", "/");
  // A stored file wins discovery, so a code-first model beside it is never loaded.
  const declared =
    inside === undefined && existsSync(directory)
      ? codeFirstDeclarationFiles(owner.projectDir, directory).at(0)
      : undefined;
  return [
    ...(sameType === undefined
      ? []
      : [`${label} and ${sameType} both declare document type ${id}.`]),
    ...(inside === undefined
      ? []
      : [
          `${label} would overwrite ${inside.file}, loaded from ${inside.source}, while writing ${shown}. Move shared runtime values outside generated model directories.`,
        ]),
    ...(declared === undefined
      ? []
      : [
          `${label} would overwrite ${declared.slice(2)}, which declares a code-first document model, while writing ${shown}. Move the code-first model to a directory of its own.`,
        ]),
    ...exportNames.flatMap((name) => {
      const other = owner.exportNames.get(name);
      return other === undefined
        ? []
        : [
            `${label} and ${other} both export ${name} from document-models/index.ts.`,
          ];
    }),
  ];
}

/** Throws before any write when a planned model overlaps a code-first one. */
function assertSingleOwner(
  models: readonly PlannedDocumentModel[],
  owner: CodeFirstOwnership,
  existingExports: readonly PlannedModelExport[],
) {
  const conflicts = [
    ...models.flatMap((model) => conflictsOf(model, owner)),
    ...existingExports.flatMap(({ name, file }) => {
      const other = owner.exportNames.get(name);
      return other === undefined
        ? []
        : [
            `${file} and ${other} both export ${name} from document-models/index.ts.`,
          ];
    }),
  ];
  if (conflicts.length === 0) return;
  throw new Error(
    [
      "Document model generation has conflicting sources, so nothing was generated:",
      ...conflicts.map((conflict) => `- ${conflict}`),
      "Rename or remove one side of each conflict, then generate again.",
    ].join("\n"),
  );
}

function unknownEditorDocumentType(
  documentType: string,
  inventory: DocumentModelInventory,
  existingEditorDir: string | undefined,
): Error {
  const declared = [
    ...new Set(inventory.documentModels.map(prop("documentType"))),
  ];
  const moduleFile = `editors/${existingEditorDir}/module.ts`;
  return new Error(
    [
      existingEditorDir === undefined
        ? `No code-first or schema-first document model in this package declares document type ${documentType}.`
        : `${moduleFile} edits document type ${documentType}, which no code-first or schema-first document model in this package declares.`,
      `Code-first models declare: ${declared.length === 0 ? "none" : declared.join(", ")}.`,
      existingEditorDir === undefined
        ? "Pass --document-type with a document type a model declares."
        : `If the model's document type changed, set documentTypes in ${moduleFile} to the new type, then generate the editor again.`,
    ].join("\n"),
  );
}

/**
 * @experimental Generation for every model discovery finds: `source` plans
 * and writes the stored specifications, and the inventory supplies the
 * code-first models. Tests pass their own source.
 */
export function documentModelGeneration(
  source: ModelGenerationSource = schemaFirstModelSource,
): ModelGeneration {
  function assertEditorModelOwnership(
    project: Project,
    inventory: DocumentModelInventory,
  ) {
    assertSingleOwner(
      source.planAllDocumentModels(project).models,
      ownershipOf(inventory),
      source.planExportNames(project, []),
    );
  }

  async function documentModels(
    project: Project,
    inventory: DocumentModelInventory,
  ): Promise<GeneratedDocumentModels> {
    const projectDir = projectPath(project, ".");
    const owner = ownershipOf(inventory);
    const plan = source.planAllDocumentModels(project);
    assertSingleOwner(
      plan.models,
      owner,
      source.planExportNames(project, plan.models),
    );
    for (const { state } of plan.models) {
      await source.generateDocumentModel(state, project);
    }
    const entryPath = (specifier: `./${string}`) =>
      realPathThroughExistingParent(join(projectDir, specifier));
    const codeFirstEntries = new Set(inventory.codeFirstEntries.map(entryPath));
    const directories = new Map(
      inventory.directories.map((directory) => [directory.name, directory]),
    );
    // A directory generation did not read may still hold a model, depending
    // on what discovery found in it.
    const unreadableDirs = plan.unreadableDirs.filter((dirName) => {
      const directory = directories.get(dirName);
      switch (directory?.kind) {
        // Code-first when its entry exports a model. Otherwise it may hide one.
        case "module":
          return !codeFirstEntries.has(entryPath(directory.entry));
        // Helpers, once a code-first model imports from them.
        case "none":
          return sourceInside(directory.path, owner) === undefined;
        // A stored file or generated code is a model's, whoever imports it.
        default:
          return true;
      }
    });
    const codeFirstDocumentModels = uniqueBy(
      inventory.documentModels.map(({ documentType, name }) => ({
        id: documentType,
        name,
      })),
      prop("id"),
    );
    // An unreadable spec may be a document model's, so its manifest entry stays.
    if (unreadableDirs.length === 0) {
      await pruneManifestSection(projectDir, "documentModels", [
        ...plan.models.map(prop("id")),
        ...codeFirstDocumentModels.map(prop("id")),
      ]);
    }
    if (codeFirstDocumentModels.length > 0) {
      await createOrUpdateManifest(
        { documentModels: codeFirstDocumentModels },
        projectDir,
      );
    }
    await writeDocumentModelAggregates(project, inventory);
    return {
      documentModels: plan.models.map(prop("state")),
      unreadableDirs,
      codeFirstDocumentModels,
    };
  }

  async function editor(
    request: GenerateEditorRequest,
    project: Project,
    inventory: DocumentModelInventory,
  ) {
    const { editorName, documentTypes, editorId, editorDirName } = request;
    if (documentTypes.length > 1) {
      throw new Error("Multiple document types are not supported yet");
    }
    const model = firstBy(
      inventory.documentModels.filter(
        ({ documentType }) => documentType === documentTypes[0],
      ),
      [prop("version"), "desc"],
    );
    if (model === undefined) {
      const [documentType] = documentTypes;
      const stored = source
        .planAllDocumentModels(project)
        .models.some(({ id }) => id === documentType);
      if (!stored) {
        throw unknownEditorDocumentType(
          documentType,
          inventory,
          editorDirName !== undefined &&
            existsSync(
              projectPath(project, `editors/${editorDirName}/module.ts`),
            )
            ? editorDirName
            : undefined,
        );
      }
      await source.generateEditor(request, project);
      return;
    }
    await generateCodeFirstDocumentEditor({
      project,
      model,
      editorName,
      editorId: editorId || kebabCase(editorName),
      editorDir: editorDirName || kebabCase(editorName),
    });
  }

  async function editors(
    project: Project,
    inventory: DocumentModelInventory,
  ): Promise<GeneratedEditors> {
    const read = getEditorDirNames(project).map((dirName) => ({
      dirName,
      metadata: getEditorMetadata(project, dirName),
    }));
    const unreadableDirs = read
      .filter(({ metadata }) => metadata === undefined)
      .map(prop("dirName"));
    const found = read
      .map(prop("metadata"))
      .filter(isTruthy)
      .filter(
        ({ documentTypes }) =>
          !documentTypes.includes("powerhouse/document-drive"),
      );
    for (const { name, id, dirName, documentTypes } of found) {
      await editor(
        {
          editorName: name,
          editorId: id,
          editorDirName: dirName,
          documentTypes,
        },
        project,
        inventory,
      );
    }
    if (unreadableDirs.length === 0) {
      await pruneManifestSection(
        projectPath(project, "."),
        "editors",
        found.map(prop("id")),
      );
    }
    return { editors: found, unreadableDirs };
  }

  return {
    async scaffoldDocumentModel(args, project) {
      const inventory = await inventoryOf(project);
      const planned = source.planAllDocumentModels(project).models;
      const stored = planned.find(({ id }) => id === args.documentType);
      if (stored !== undefined) {
        throw new Error(
          `Document type ${args.documentType} is already registered by ${stored.label}.`,
        );
      }
      const declared = inventory.documentModels.find(
        ({ documentType }) => documentType === args.documentType,
      );
      if (declared !== undefined) {
        throw new Error(
          `Document type ${args.documentType} is already declared by ${declared.source.specifier}.`,
        );
      }
      const names = codeFirstDocumentModelTemplateArgs(args);
      const spelled = join(inventory.documentModelsDir, names.kebabName);
      const directory = realPathThroughExistingParent(spelled);
      const exportName = `${names.pascalName}V1`;
      const conflicts = [
        ...planned.flatMap((model) => [
          ...(realPathThroughExistingParent(model.directory) === directory
            ? [
                `${model.label} already owns the scaffold directory ${relative(inventory.projectDir, spelled).replaceAll("\\", "/")}.`,
              ]
            : []),
          ...(model.exportNames.includes(exportName)
            ? [
                `${model.label} already exports ${exportName} from document-models/index.ts.`,
              ]
            : []),
        ]),
      ];
      if (conflicts.length > 0) {
        throw new Error(
          [
            `Cannot scaffold ${args.name}; stored specifications already own its output, so nothing was generated:`,
            ...conflicts.map((conflict) => `- ${conflict}`),
            "Choose another model name or remove the stored specification first.",
          ].join("\n"),
        );
      }
      return await generateCodeFirstDocumentModel(
        args,
        project,
        inventory.documentModelsDir,
      );
    },
    async generateDocumentModel(state, project) {
      const inventory = await inventoryOf(project);
      const incoming = source.planDocumentModel(state, project);
      const others = source
        .planAllDocumentModels(project)
        .models.filter(
          (model) =>
            realPathThroughExistingParent(model.directory) !==
            realPathThroughExistingParent(incoming.directory),
        );
      const models = [...others, incoming];
      assertSingleOwner(
        models,
        ownershipOf(inventory),
        source.planExportNames(project, [incoming]),
      );
      await source.generateDocumentModel(state, project);
      await finalizeModels(project, inventory);
    },
    async generateAllDocumentModels(project) {
      return await documentModels(project, await inventoryOf(project));
    },
    async generateEditor(request, project) {
      const inventory = await inventoryOf(project);
      assertEditorModelOwnership(project, inventory);
      await editor(request, project, inventory);
      await finalizeModels(project, inventory);
    },
    async generateAllEditors(project) {
      const inventory = await inventoryOf(project);
      assertEditorModelOwnership(project, inventory);
      const result = await editors(project, inventory);
      await finalizeModels(project, inventory);
      return result;
    },
    async generateAll(project) {
      const inventory = await inventoryOf(project);
      await documentModels(project, inventory);
      await editors(project, inventory);
      await generateAllApps(project);
      await generateAllSubgraphs(project);
      await generateAllProcessors(project);
      await generateAllPieces(project);
      syncProjectAiToolsExport(project);
    },
  };
}

/** @experimental The generation every command and Vetra's processor use. */
export const modelGeneration: ModelGeneration = documentModelGeneration();
