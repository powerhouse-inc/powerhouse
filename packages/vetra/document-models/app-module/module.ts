import type { AppModulePHState } from "@powerhousedao/vetra/document-models/app-module";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/app-module";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";

/** Document model module for the Todo List document type */
export const AppModule: DocumentModelModule<AppModulePHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
