import { kebabCase } from "change-case";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { firstBy, isTruthy, prop, uniqueBy } from "remeda";
import type { Project } from "ts-morph";
import { getEditorDirNames, getEditorMetadata, projectPath } from "utils";
import { generateCodeFirstDocumentEditor } from "../file-builders/code-first-editor.js";
import { writeCodeFirstAggregates } from "../file-builders/document-model/code-first-aggregates.js";
import {
  loadCodeFirstInventory,
  type CodeFirstInventory,
} from "../file-builders/document-model/code-first-inventory.js";
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
  generateAllSubgraphs,
} from "./generate.js";
import type {
  ModelGenerationSource,
  PlannedDocumentModel,
  PlannedModelExport,
} from "./model-generation-source.js";
import type {
  CodeFirstModelGeneration,
  GenerateEditorRequest,
  GeneratedDocumentModels,
  GeneratedEditors,
} from "./model-generation.js";

const needsModelSource = (): never => {
  throw new Error(
    "Generating a stored specification requires a model source adapter.",
  );
};

const noStoredModels: ModelGenerationSource = {
  planDocumentModel: needsModelSource,
  planAllDocumentModels: () => ({ models: [], unreadableDirs: [] }),
  planExportNames: () => [],
  generateDocumentModel: needsModelSource,
  generateEditor({ documentTypes }) {
    throw new Error(`No model source declares ${documentTypes[0]}.`);
  },
};

const inventoryOf = (project: Project) =>
  loadCodeFirstInventory(projectPath(project, "."));

/** The path with symlinks and, where the filesystem ignores it, case resolved. */
function canonicalPath(path: string): string {
  if (existsSync(path)) return realpathSync.native(path);
  const parent = dirname(path);
  return parent === path ? path : join(canonicalPath(parent), basename(path));
}

/** What the selected code-first sources own, each mapped to one source. */
type CodeFirstOwnership = {
  readonly projectDir: string;
  readonly documentTypes: ReadonlyMap<string, string>;
  readonly exportNames: ReadonlyMap<string, string>;
  readonly files: ReadonlyMap<string, string>;
};

function ownershipOf(inventory: CodeFirstInventory): CodeFirstOwnership {
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
        canonicalPath(file),
        specifier,
      ]),
    ),
  };
}

function sourceInside(directory: string, owner: CodeFirstOwnership) {
  const root = `${canonicalPath(directory)}${sep}`;
  for (const [file, specifier] of owner.files) {
    if (file.startsWith(root))
      return {
        file: relative(canonicalPath(owner.projectDir), file).replaceAll(
          "\\",
          "/",
        ),
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
  return [
    ...(sameType === undefined
      ? []
      : [`${label} and ${sameType} both declare document type ${id}.`]),
    ...(inside === undefined
      ? []
      : [
          `${label} would overwrite ${inside.file}, loaded from ${inside.source}, while writing ${shown}. Move shared runtime values outside generated model directories.`,
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

export function codeFirstModelGeneration(
  source: ModelGenerationSource = noStoredModels,
): CodeFirstModelGeneration {
  async function documentModels(
    project: Project,
    inventory: CodeFirstInventory,
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
    const unreadableDirs = plan.unreadableDirs.filter(
      (dirName) =>
        sourceInside(join(projectDir, "document-models", dirName), owner) ===
        undefined,
    );
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
    await writeCodeFirstAggregates(project, inventory);
    return {
      documentModels: plan.models.map(prop("state")),
      unreadableDirs,
      codeFirstDocumentModels,
    };
  }

  async function editor(
    request: GenerateEditorRequest,
    project: Project,
    inventory: CodeFirstInventory,
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
    inventory: CodeFirstInventory,
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
    mode: "code-first",
    async scaffoldDocumentModel(args, project) {
      const planned = source.planAllDocumentModels(project).models;
      const stored = planned.find(({ id }) => id === args.documentType);
      if (stored !== undefined) {
        throw new Error(
          `Document type ${args.documentType} is already registered by ${stored.label}.`,
        );
      }
      const names = codeFirstDocumentModelTemplateArgs(args);
      const directory = canonicalPath(
        projectPath(project, `document-models/${names.kebabName}`),
      );
      const exportName = `${names.pascalName}V1`;
      const conflicts = [
        ...planned.flatMap((model) => [
          ...(canonicalPath(model.directory) === directory
            ? [
                `${model.label} already owns the scaffold directory document-models/${names.kebabName}.`,
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
      return await generateCodeFirstDocumentModel(args, project);
    },
    async generateDocumentModel(state, project) {
      const inventory = await inventoryOf(project);
      const incoming = source.planDocumentModel(state, project);
      const others = source
        .planAllDocumentModels(project)
        .models.filter(
          (model) =>
            canonicalPath(model.directory) !==
            canonicalPath(incoming.directory),
        );
      const models = [...others, incoming];
      assertSingleOwner(
        models,
        ownershipOf(inventory),
        source.planExportNames(project, [incoming]),
      );
      await source.generateDocumentModel(state, project);
      await writeCodeFirstAggregates(project, inventory);
    },
    async generateAllDocumentModels(project) {
      return await documentModels(project, await inventoryOf(project));
    },
    async generateEditor(request, project) {
      await editor(request, project, await inventoryOf(project));
    },
    async generateAllEditors(project) {
      return await editors(project, await inventoryOf(project));
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
