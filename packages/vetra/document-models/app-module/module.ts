import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { AppModulePHState } from "@powerhousedao/vetra/document-models/app-module";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/app-module";

/** Document model module for the Todo List document type */
export const AppModule: DocumentModelModule<AppModulePHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
