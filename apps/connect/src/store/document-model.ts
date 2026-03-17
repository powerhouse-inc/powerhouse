import type { VetraDocumentModelModule } from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "document-drive";
import {
  createState,
  defaultBaseState,
  documentModelDocumentModelModule,
} from "document-model";

export function loadDocumentModelDocumentModelModule() {
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

export function loadDriveDocumentModelModule() {
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
