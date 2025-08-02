import {
  generateId,
  type DocumentModelLib,
  type DocumentModelModule,
  type EditorModule,
} from "document-model";
import {
  type VetraDocumentModelModule,
  type VetraEditorModule,
  type VetraMeta,
  type VetraModules,
  type VetraPackage,
  type VetraPackageManifest,
} from "../types.js";

export function convertLegacyLibToVetraPackage(
  legacyLib: DocumentModelLib,
): VetraPackage {
  const vetraPackage: VetraPackage = {
    id: generateId(),
    name: "Legacy lib",
    description: "Legacy lib",
    category: "Legacy lib",
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
  const vetraDocumentModelModule: VetraDocumentModelModule = {
    id: documentModel.id,
    name: documentModel.name,
    documentModel: {
      author: {
        name: "Powerhouse",
        website: "https://powerhousedao.com",
      },
      description: "No description",
      extension: documentModel.extension,
      id: documentModel.id,
      name: documentModel.name,
      specifications: documentModel.specifications,
    },
    reducer: legacyDocumentModelModule.reducer,
    actions: legacyDocumentModelModule.actions,
    utils: legacyDocumentModelModule.utils,
  };
  return vetraDocumentModelModule;
}

export function convertLegacyEditorModuleToVetraEditorModule(
  legacyEditorModule: EditorModule,
): VetraEditorModule {
  const vetraEditorModule: VetraEditorModule = {
    id: legacyEditorModule.config.id,
    name: "Legacy editor",
    documentTypes: legacyEditorModule.documentTypes,
    Component: legacyEditorModule.Component,
    config: legacyEditorModule.config,
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
