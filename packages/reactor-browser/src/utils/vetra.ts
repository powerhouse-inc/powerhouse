import type {
  VetraDocumentModelModule,
  VetraEditorModule,
  VetraMeta,
  VetraModules,
  VetraPackage,
  VetraPackageManifest,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentModelLib,
  DocumentModelModule,
  EditorModule,
  Manifest,
} from "document-model";
import { createState } from "document-model";
import { defaultBaseState, generateId } from "document-model/core";

export function convertLegacyLibToVetraPackage(
  legacyLib: DocumentModelLib,
): VetraPackage {
  const id = generateId();

  const publisher =
    "publisher" in legacyLib.manifest
      ? legacyLib.manifest.publisher
      : undefined;

  const vetraPackage: VetraPackage = {
    id,
    name: legacyLib.manifest.name,
    description: legacyLib.manifest.description,
    category: legacyLib.manifest.category,
    author: {
      name: publisher?.name || "",
      website: publisher?.url || "",
    },
    modules: {
      documentModelModules: legacyLib.documentModels.map(
        convertLegacyDocumentModelModuleToVetraDocumentModelModule,
      ),
      editorModules: legacyLib.editors.map((editor) =>
        convertLegacyEditorModuleToVetraEditorModule(
          editor,
          legacyLib.manifest,
        ),
      ),
    },
    upgradeManifests: legacyLib.upgradeManifests,
    processorFactory: legacyLib.processorFactory,
  };
  return vetraPackage;
}

export function convertLegacyDocumentModelModuleToVetraDocumentModelModule(
  legacyDocumentModelModule: DocumentModelModule,
) {
  const global = legacyDocumentModelModule.documentModel.global;
  const name = global.name;
  const documentType = global.id;
  const unsafeIdFromDocumentType = documentType;
  const extension = global.extension;
  const specifications = global.specifications;
  const reducer = legacyDocumentModelModule.reducer;
  const actions = legacyDocumentModelModule.actions;
  const utils = legacyDocumentModelModule.utils;
  const vetraDocumentModelModule: VetraDocumentModelModule = {
    id: unsafeIdFromDocumentType,
    name,
    documentType,
    extension,
    documentModel: createState(defaultBaseState(), global),
    specifications,
    reducer,
    actions,
    utils,
    version: legacyDocumentModelModule.version,
  };
  return vetraDocumentModelModule;
}

export function convertLegacyEditorModuleToVetraEditorModule(
  legacyEditorModule: EditorModule,
  manifest?: Manifest,
): VetraEditorModule {
  // check for app using this drive editor and use its name
  const appName = manifest?.apps?.find(
    (app) => app.driveEditor === legacyEditorModule.config.id,
  )?.name;
  const id = legacyEditorModule.config.id;
  // if no app found and editor has no name defined then build the name from the id
  const nameFromId = id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const name = appName || legacyEditorModule.config.name || nameFromId;

  const documentTypes = legacyEditorModule.documentTypes;
  const Component = legacyEditorModule.Component;
  const vetraEditorModule: VetraEditorModule = {
    id,
    name,
    documentTypes,
    Component,
  };
  return vetraEditorModule;
}

export function makeVetraPackageManifest(
  vetraPackage: VetraPackage,
): VetraPackageManifest {
  const { id, name, description, category, author, modules } = vetraPackage;
  return {
    id,
    name,
    description,
    category,
    author,
    modules: makeVetraPackageManifestModulesEntry(modules),
  };
}

function makeVetraPackageManifestModulesEntry(
  modules: VetraModules,
): Record<keyof VetraModules, VetraMeta[]> {
  return Object.entries(modules).reduce(
    (acc, [moduleType, module]) => {
      acc[moduleType as keyof VetraModules] = module.map((m) => ({
        id: m.id,
        name: m.name,
      }));
      return acc;
    },
    {} as Record<keyof VetraModules, VetraMeta[]>,
  );
}
