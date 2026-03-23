import type { ProcessorModulePHState } from "@powerhousedao/vetra/document-models/processor-module";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/processor-module";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";

/** Document model module for the Todo List document type */
export const ProcessorModule: DocumentModelModule<ProcessorModulePHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
