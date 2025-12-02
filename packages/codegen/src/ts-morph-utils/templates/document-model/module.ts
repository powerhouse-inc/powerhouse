import { ts } from "@tmpl/core";

type DocumentModelModuleFileTemplateArgs = {
  phStateName: string;
  documentModelDir: string;
  pascalCaseDocumentType: string;
};
export function documentModelModuleFileTemplate({
  phStateName,
  documentModelDir,
  pascalCaseDocumentType,
}: DocumentModelModuleFileTemplateArgs) {
  const template = ts`
  import type { DocumentModelModule } from "document-model";
  import { createState } from "document-model";
  import { defaultBaseState } from "document-model/core";
  import type { ${phStateName} } from "${documentModelDir}";
  import {
    actions,
    documentModel,
    reducer,
    utils,
  } from "${documentModelDir}";

  /** Document model module for the Todo List document type */
  export const ${pascalCaseDocumentType}: DocumentModelModule<${phStateName}> = {
    reducer,
    actions,
    utils,
    documentModel: createState(defaultBaseState(), documentModel),
  };
`;

  return template.raw;
}
