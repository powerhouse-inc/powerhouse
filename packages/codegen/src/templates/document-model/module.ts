import { ts } from "@tmpl/core";

type DocumentModelModuleFileTemplateArgs = {
  phStateName: string;
  versionedDocumentModelPackageImportPath: string;
  pascalCaseDocumentType: string;
  version: number;
};
export function documentModelModuleFileTemplate({
  phStateName,
  versionedDocumentModelPackageImportPath,
  pascalCaseDocumentType,
  version,
}: DocumentModelModuleFileTemplateArgs) {
  const template = ts`
  import type { DocumentModelModule } from "document-model";
  import { createState } from "document-model";
  import { defaultBaseState } from "document-model/core";
  import type { ${phStateName} } from "${versionedDocumentModelPackageImportPath}";
  import {
    actions,
    documentModel,
    reducer,
    utils,
  } from "${versionedDocumentModelPackageImportPath}";

  /** Document model module for the Todo List document type */
  export const ${pascalCaseDocumentType}: DocumentModelModule<${phStateName}> = {
    version: ${version},
    reducer,
    actions,
    utils,
    documentModel: createState(defaultBaseState(), documentModel),
  };
`;

  return template.raw;
}
