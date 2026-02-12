import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { VetraPackagePHState } from "@powerhousedao/vetra/document-models/vetra-package";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/vetra-package";

/** Document model module for the Todo List document type */
export const VetraPackage: DocumentModelModule<VetraPackagePHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
