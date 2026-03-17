import { ts } from "@tmpl/core";

type DocumentModelModuleFileTemplateArgs = {
  phStateName: string;
  pascalCaseDocumentType: string;
  version: number;
};
export function documentModelModuleFileTemplate({
  phStateName,
  pascalCaseDocumentType,
  version,
}: DocumentModelModuleFileTemplateArgs) {
  const template = ts`
  import type { DocumentModelModule } from "document-model";
  import { createState, defaultBaseState } from "document-model";
  import type { ${phStateName} } from "./gen/types.js";
  import { documentModel } from "./gen/document-model.js";
  import { reducer } from "./gen/reducer.js";
  import { actions } from "./actions.js";
  import { utils } from "./utils.js";

  /** Document model module for the ${pascalCaseDocumentType} document type */
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
