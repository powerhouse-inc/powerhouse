import type { DocumentModelModule } from "document-model";
import {
    createState,
    defaultBaseState,
} from "document-model";
import type { TestDocPHState } from "test/document-models/test-doc/v1";
import {
    actions,
    documentModel,
    reducer,
    utils,
} from "test/document-models/test-doc/v1";

/** Document model module for the Todo List document type */
export const TestDoc: DocumentModelModule<TestDocPHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
