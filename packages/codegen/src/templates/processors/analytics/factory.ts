import { ts } from "@tmpl/core";
import { getDocumentType } from "../utils.js";

export const analyticsFactoryTemplate = (v: {
  pascalCaseName: string;
  documentTypes: string[];
}) =>
  ts`
import { type ProcessorRecord } from "document-drive";
import { type IProcessorHostModule } from "document-drive";
import { type PHDocumentHeader } from "document-model";
import { ${v.pascalCaseName}Processor } from "./index.js";

export const ${v.pascalCaseName}ProcessorFactory = (module: IProcessorHostModule) => (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
  return [
    {
      processor: new ${v.pascalCaseName}Processor(module.analyticsStore),
      filter: {
        branch: ["main"],
        documentId: ["*"],
        scope: ["*"],
        documentType: [${getDocumentType(v.documentTypes)}],
      },
    },
  ];
}
`.raw;
