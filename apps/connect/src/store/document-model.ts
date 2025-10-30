import { loadDocumentModelEditor, loadGenericDriveExplorerEditorModule } from "@powerhousedao/connect/store/editor";
import type {
  VetraDocumentModelModule,
  VetraPackage,
} from "@powerhousedao/reactor-browser";
import { COMMON_PACKAGE_ID } from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "document-drive";
import { createState, documentModelDocumentModelModule } from "document-model";
import { defaultBaseState } from "document-model/core";

async function loadDocumentModelDocumentModelModule(): Promise<VetraDocumentModelModule> {
  const global = documentModelDocumentModelModule.documentModel.global;
  const name = global.name;
  const documentType = global.id;
  const unsafeIdFromDocumentType = documentType;
  const extension = global.extension;
  const specifications = global.specifications;
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
    documentModel: createState(defaultBaseState(), global),
  };
  return vetraDocumentModelModule;
}

async function loadDriveDocumentModelModule(): Promise<VetraDocumentModelModule> {
  const global = driveDocumentModelModule.documentModel.global;
  const name = global.name;
  const documentType = global.id;
  const unsafeIdFromDocumentType = documentType;
  const extension = global.extension;
  const specifications = global.specifications;
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
    documentModel: createState(defaultBaseState(), global),
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
