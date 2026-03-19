import type { VetraPackagePHState } from "@powerhousedao/vetra/document-models/vetra-package";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/vetra-package";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { createState, defaultBaseState } from "@powerhousedao/shared/document-model";

/** Document model module for the Todo List document type */
export const VetraPackage: DocumentModelModule<VetraPackagePHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
