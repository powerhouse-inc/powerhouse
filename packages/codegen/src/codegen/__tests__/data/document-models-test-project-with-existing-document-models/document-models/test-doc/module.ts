import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { TestDocPHState } from "./index.js";
import { actions, documentModel, reducer, utils } from "./index.js";

/** Document model module for the Todo List document type */
export const TestDoc: DocumentModelModule<TestDocPHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
