import type {
  DocumentModelLib,
  DocumentModelModule,
  EditorModule,
  Manifest,
} from "document-model";
import { generateId } from "document-model";
import type {
  VetraDocumentModelModule,
  VetraEditorModule,
  VetraMeta,
  VetraModules,
  VetraPackage,
  VetraPackageManifest,
} from "../types/vetra.js";

export function convertLegacyLibToVetraPackage(
  legacyLib: DocumentModelLib,
): VetraPackage {
  const id = generateId();

  const vetraPackage: VetraPackage = {
    id,
    name: legacyLib.manifest.name,
    description: legacyLib.manifest.description,
    category: legacyLib.manifest.category,
    author: {
      name: "Powerhouse",
      website: "https://powerhousedao.com",
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
  };
  return vetraPackage;
}

export function convertLegacyDocumentModelModuleToVetraDocumentModelModule(
  legacyDocumentModelModule: DocumentModelModule,
) {
  const documentModel = legacyDocumentModelModule.documentModel;
  const name = documentModel.name;
  const documentType = documentModel.id;
  const unsafeIdFromDocumentType = documentType;
  const extension = documentModel.extension;
  const specifications = documentModel.specifications;
  const reducer = legacyDocumentModelModule.reducer;
  const actions = legacyDocumentModelModule.actions;
  const utils = legacyDocumentModelModule.utils;
  const vetraDocumentModelModule: VetraDocumentModelModule = {
    id: unsafeIdFromDocumentType,
    name,
    documentType,
    extension,
    documentModel,
    specifications,
    reducer,
    actions,
    utils,
  };
  return vetraDocumentModelModule;
}

export function convertLegacyEditorModuleToVetraEditorModule(
  legacyEditorModule: EditorModule,
  manifest?: Manifest,
): VetraEditorModule {
  const config = legacyEditorModule.config;
  const unsafeIdFromConfig = config.id;

  // check for app using this drive editor and use its name
  const appName = manifest?.apps?.find(
    (app) => app.driveEditor === config.id,
  )?.name;

  // if no app found and editor has no name defined then build the name from the id
  const nameFromId = unsafeIdFromConfig
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const name = appName || config.name || nameFromId;

  const documentTypes = legacyEditorModule.documentTypes;
  const Component = legacyEditorModule.Component;
  const vetraEditorModule: VetraEditorModule = {
    id: unsafeIdFromConfig,
    name,
    documentTypes,
    Component,
    config,
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
