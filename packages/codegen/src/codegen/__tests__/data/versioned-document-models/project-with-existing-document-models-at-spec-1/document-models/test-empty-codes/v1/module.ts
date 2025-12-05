import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { TestEmptyCodesPHState } from "test/document-models/test-empty-codes/v1";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "test/document-models/test-empty-codes/v1";

/** Document model module for the Todo List document type */
export const TestEmptyCodes: DocumentModelModule<TestEmptyCodesPHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
