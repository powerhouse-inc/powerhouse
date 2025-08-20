import {
  type VetraDocumentModelModule,
  type VetraPackage,
  COMMON_PACKAGE_ID,
} from "@powerhousedao/reactor-browser";
import {
  loadDocumentModelEditor,
  loadGenericDriveExplorerEditorModule,
} from "./editor.js";

async function loadDocumentModelDocumentModelModule(): Promise<VetraDocumentModelModule> {
  const { documentModelDocumentModelModule } = await import("document-model");
  const documentModel = documentModelDocumentModelModule.documentModel;
  const name = documentModel.name;
  const documentType = documentModel.id;
  const unsafeIdFromDocumentType = documentType;
  const extension = documentModel.extension;
  const specifications = documentModel.specifications;
  const reducer = documentModelDocumentModelModule.reducer;
  const actions = documentModelDocumentModelModule.actions;
  const utils = documentModelDocumentModelModule.utils;
  const vetraDocumentModelModule: VetraDocumentModelModule = {
    id: unsafeIdFromDocumentType,
    name,
    documentType,
    extension,
    specifications,
    reducer,
    actions,
    utils,
    documentModel,
  };
  return vetraDocumentModelModule;
}

async function loadDriveDocumentModelModule(): Promise<VetraDocumentModelModule> {
  const { driveDocumentModelModule } = await import("document-drive");
  const documentModel = driveDocumentModelModule.documentModel;
  const name = documentModel.name;
  const documentType = documentModel.id;
  const unsafeIdFromDocumentType = documentType;
  const extension = documentModel.extension;
  const specifications = documentModel.specifications;
  const reducer = driveDocumentModelModule.reducer;
  const actions = driveDocumentModelModule.actions;
  const utils = driveDocumentModelModule.utils;
  const vetraDocumentModelModule: VetraDocumentModelModule = {
    id: unsafeIdFromDocumentType,
    name,
    documentType,
    extension,
    specifications,
    reducer,
    actions,
    utils,
    documentModel,
  };
  return vetraDocumentModelModule;
}

export async function loadCommonPackage(): Promise<VetraPackage> {
  const documentModelDocumentModelModule =
    await loadDocumentModelDocumentModelModule();
  const driveDocumentModelModule = await loadDriveDocumentModelModule();
  const documentModelEditorModule = await loadDocumentModelEditor();
  const genericDriveExplorerEditorModule =
    await loadGenericDriveExplorerEditorModule();
  const vetraPackage: VetraPackage = {
    id: COMMON_PACKAGE_ID,
    name: "Common",
    description: "Common",
    category: "Common",
    author: {
      name: "Powerhouse",
      website: "https://powerhousedao.com",
    },
    modules: {
      documentModelModules: [
        documentModelDocumentModelModule,
        driveDocumentModelModule,
      ],
      editorModules: [
        documentModelEditorModule,
        genericDriveExplorerEditorModule,
      ],
    },
  };
  return vetraPackage;
}
