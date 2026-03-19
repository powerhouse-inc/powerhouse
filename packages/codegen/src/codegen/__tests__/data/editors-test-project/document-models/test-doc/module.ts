import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
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
