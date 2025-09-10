import type {
  DocumentModelLib,
  DocumentModelModule,
  EditorModule,
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
      editorModules: legacyLib.editors.map(
        convertLegacyEditorModuleToVetraEditorModule,
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
): VetraEditorModule {
  const config = legacyEditorModule.config;
  const unsafeNameFromConfig = config.id;
  const unsafeIdFromConfig = unsafeNameFromConfig;
  const documentTypes = legacyEditorModule.documentTypes;
  const Component = legacyEditorModule.Component;
  const vetraEditorModule: VetraEditorModule = {
    id: unsafeIdFromConfig,
    name: unsafeNameFromConfig,
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
