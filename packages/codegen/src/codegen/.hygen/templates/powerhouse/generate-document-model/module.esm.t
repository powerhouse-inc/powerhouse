---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/module.ts"
force: true
---
import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { <%= phStateName %> } from "<%= documentModelDir %>";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "<%= documentModelDir %>";

/** Document model module for the <%= pascalCaseDocumentType %> document type */
export const <%= pascalCaseDocumentType %>: DocumentModelModule<<%= phStateName %>> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
